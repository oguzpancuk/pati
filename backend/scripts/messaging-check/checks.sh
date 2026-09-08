#!/usr/bin/env bash
# End-to-end curl checks of user-to-user messaging (ROADMAP P6 item 4):
# DMs between friends, admin-run groups, the polling contract, soft
# deletes, reports. Run through run.sh, which boots a throwaway backend;
# or point API/LOG at a running one. Exits non-zero when a check fails.
#
# Accounts: test1@stray.test (seeded) plus trackb2/trackb3@stray.test,
# registered here when missing and verified from the backend log (the
# dev mailer prints the code).
set -uo pipefail
API=${API:-http://localhost:3104/api}
LOG=${LOG:-/tmp/pati-messaging-api.log}
pass=0; fail=0
expect() { # expect <label> <actual> <want>
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "ok   $1"; else fail=$((fail+1)); echo "FAIL $1: got [$2] want [$3]"; fi
}
req() { # req <token> <method> <path> [json] -> body; sets STATUS
  local tok=$1 m=$2 p=$3 d=${4:-}
  local out
  if [ -n "$d" ]; then
    out=$(curl -s -w '\n%{http_code}' -X "$m" "$API$p" -H "Authorization: Bearer $tok" -H 'Content-Type: application/json' -d "$d")
  else
    out=$(curl -s -w '\n%{http_code}' -X "$m" "$API$p" -H "Authorization: Bearer $tok")
  fi
  STATUS=${out##*$'\n'}; BODY=${out%$'\n'*}
}
j() { node -e "const b=JSON.parse(require('fs').readFileSync(0,'utf8'));const v=(()=>{try{return eval('b'+process.argv[1])}catch(e){return undefined}})();console.log(v===undefined?'undefined':(typeof v==='object'?JSON.stringify(v):String(v)))" "$1"; }

login() { curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"password\":\"password123\"}" | j '.token'; }

# --- accounts: test1 (seeded), trackb2/trackb3 (registered by this track; verified once)
T1=$(login test1@stray.test)
for n in 2 3; do
  tok=$(login trackb$n@stray.test)
  if [ "$tok" = "undefined" ] || [ -z "$tok" ]; then
    curl -s -o /dev/null -X POST "$API/auth/register" -H 'Content-Type: application/json' \
      -d "{\"name\":\"Track B $n\",\"email\":\"trackb$n@stray.test\",\"password\":\"password123\"}"
    tok=$(login trackb$n@stray.test)
  fi
  req "$tok" GET /users/me
  if [ "$(echo "$BODY" | j '.email_verification_pending')" = "true" ]; then
    code=$(grep "to=trackb$n@stray.test" "$LOG" | tail -1 | sed -E 's/.*kodun: ([0-9]{6}).*/\1/')
    req "$tok" POST /auth/verify-email "{\"code\":\"$code\"}"
    echo "verify trackb$n: $STATUS"
  fi
done
T2=$(login trackb2@stray.test); T3=$(login trackb3@stray.test)
req "$T1" GET /users/me; U1=$(echo "$BODY" | j '.id')
req "$T2" GET /users/me; U2=$(echo "$BODY" | j '.id'); N2=$(echo "$BODY" | j '.name')
req "$T3" GET /users/me; U3=$(echo "$BODY" | j '.id')
echo "users: $U1 $U2 $U3"

# --- friendships: 1-2, 1-3 accepted; 2-3 NOT friends
befriend() { # befriend <tokA> <tokB> <idB>
  req "$1" POST /friendships "{\"addresseeId\":$3}"
  [ "$STATUS" = "409" ] && return
  fid=$(echo "$BODY" | j '.id'); [ "$(echo "$BODY" | j '.autoAccepted')" = "true" ] && return
  req "$2" POST "/friendships/$fid/accept"
}
befriend "$T1" "$T2" "$U2"; befriend "$T1" "$T3" "$U3"
# rerunnable: a previous run befriends 2-3 near the end; undo it first
req "$T2" GET /friendships/me; F23=$(echo "$BODY" | j ".friends.find(f=>f.id===$U3)?.friendship_id")
[ "$F23" != "undefined" ] && req "$T2" DELETE "/friendships/$F23"
req "$T2" GET /friendships/me
expect "2 and 3 are not friends" "$(echo "$BODY" | j ".friends.some(f=>f.id===$U3)")" "false"

# 1. DM: non-friend refused, friend opens, idempotent
req "$T2" POST /messages/direct "{\"userId\":$U3}"; expect "DM to non-friend 403" "$STATUS" "403"
req "$T1" POST /messages/direct "{\"userId\":$U1}"; expect "DM to self 400" "$STATUS" "400"
req "$T1" POST /messages/direct "{\"userId\":$U2}"; DM=$(echo "$BODY" | j '.id'); expect "DM open 201/200" "$([ "$STATUS" = 201 ] || [ "$STATUS" = 200 ]; echo $?)" "0"
req "$T2" POST /messages/direct "{\"userId\":$U1}"; expect "DM from other side same id" "$(echo "$BODY" | j '.id')" "$DM"
expect "DM reopen not created" "$(echo "$BODY" | j '.created')" "false"

# 2. send / list / poll / unread / read
# rerunnable: the previous run leaves T2 with an unread message from section 3b
# and T1 with the quoted sources from section 3c
req "$T2" POST "/messages/conversations/$DM/read"
req "$T1" POST "/messages/conversations/$DM/read"
req "$T1" POST "/messages/conversations/$DM/messages" '{"body":"   "}'; expect "empty body 400" "$STATUS" "400"
req "$T1" POST "/messages/conversations/$DM/messages" '{"body":"selam"}'; expect "send 201" "$STATUS" "201"; M1=$(echo "$BODY" | j '.id')
expect "send echoes body" "$(echo "$BODY" | j '.body')" "selam"
req "$T3" GET "/messages/conversations/$DM/messages"; expect "non-member 404" "$STATUS" "404"
req "$T2" GET /messages/conversations; expect "inbox unread 1" "$(echo "$BODY" | j ".conversations.find(c=>c.id===$DM).unreadCount")" "1"
expect "inbox DM titled by other" "$(echo "$BODY" | j ".conversations.find(c=>c.id===$DM).name")" "S1 Test"
req "$T1" GET /messages/conversations; expect "sender unread 0" "$(echo "$BODY" | j ".conversations.find(c=>c.id===$DM).unreadCount")" "0"
req "$T2" GET "/messages/conversations/$DM/messages"; NOW=$(echo "$BODY" | j '.now'); expect "list ends with M1" "$(echo "$BODY" | j '.messages.at(-1).id')" "$M1"
req "$T2" POST "/messages/conversations/$DM/read"; expect "read 200" "$STATUS" "200"
req "$T2" GET /messages/conversations; expect "unread after read 0" "$(echo "$BODY" | j ".conversations.find(c=>c.id===$DM).unreadCount")" "0"
req "$T2" POST "/messages/conversations/$DM/messages" '{"body":"selam sana da"}'; M2=$(echo "$BODY" | j '.id')
req "$T1" GET "/messages/conversations/$DM/messages?after=$M1&since=$NOW"; expect "poll after returns 1" "$(echo "$BODY" | j '.messages.length')" "1"
expect "poll after id" "$(echo "$BODY" | j '.messages[0].id')" "$M2"
req "$T1" GET "/messages/conversations/$DM"; expect "DM canSend true" "$(echo "$BODY" | j '.canSend')" "true"
expect "DM detail 2 members" "$(echo "$BODY" | j '.members.length')" "2"

# 3. delete in DM: sender yes, other side no; deletion reported through since
req "$T1" DELETE "/messages/$M2"; expect "delete other's DM message 403" "$STATUS" "403"
req "$T2" DELETE "/messages/$M2"; expect "sender deletes own 200" "$STATUS" "200"
req "$T1" GET "/messages/conversations/$DM/messages?after=$M2&since=$NOW"; expect "poll reports deleted id" "$(echo "$BODY" | j '.deleted.map(d=>d.id)')" "[$M2]"
expect "poll reports who deleted" "$(echo "$BODY" | j '.deleted[0].deletedBySender')" "true"
req "$T1" GET "/messages/conversations/$DM/messages"; expect "deleted body hidden" "$(echo "$BODY" | j '.messages.at(-1).body')" "null"
expect "deleted flag" "$(echo "$BODY" | j '.messages.at(-1).deleted')" "true"
expect "deletedBySender" "$(echo "$BODY" | j '.messages.at(-1).deletedBySender')" "true"

# 3b. interleaved: A's cursor is at the newest id; B replies, then A sends without
# polling in between. A's next poll from the old cursor must bring BOTH, and A's
# inbox must still show B's reply as unread — sending is not reading.
req "$T1" GET "/messages/conversations/$DM/messages"; CUR=$(echo "$BODY" | j '.messages.at(-1).id'); NOW2=$(echo "$BODY" | j '.now')
req "$T1" POST "/messages/conversations/$DM/read"
req "$T2" POST "/messages/conversations/$DM/messages" '{"body":"araya girdim"}'; MB=$(echo "$BODY" | j '.id')
req "$T1" POST "/messages/conversations/$DM/messages" '{"body":"ben de yazdim"}'; MA=$(echo "$BODY" | j '.id')
req "$T1" GET "/messages/conversations/$DM/messages?after=$CUR&since=$NOW2"; expect "interleaved poll returns both" "$(echo "$BODY" | j '.messages.map(m=>m.id)')" "[$MB,$MA]"
req "$T1" GET /messages/conversations; expect "reply before own send still unread" "$(echo "$BODY" | j ".conversations.find(c=>c.id===$DM).unreadCount")" "1"
req "$T1" POST "/messages/conversations/$DM/read"
req "$T1" GET "/messages/conversations/$DM/messages?limit=2.7"; expect "fractional limit floored" "$(echo "$BODY" | j '.messages.length')" "2"

# 3c. quotes (P7 item 7): the reply's echo, the page and the poll all carry
# the source; a source deleted afterwards reads as deleted; a deleted,
# unknown or malformed source is refused (cross-conversation and pre-join
# sources are refused in section 5, where the group exists).
req "$T1" GET "/messages/conversations/$DM/messages"; QCUR=$(echo "$BODY" | j '.messages.at(-1).id'); QNOW=$(echo "$BODY" | j '.now')
req "$T2" POST "/messages/conversations/$DM/messages" '{"body":"  alintilanacak   mesaj\nikinci satir  "}'; QS=$(echo "$BODY" | j '.id')
expect "plain message replyTo null" "$(echo "$BODY" | j '.replyTo')" "null"
req "$T1" POST "/messages/conversations/$DM/messages" "{\"body\":\"yanit\",\"replyToId\":$QS}"; expect "reply 201" "$STATUS" "201"; QR=$(echo "$BODY" | j '.id')
expect "echo carries quote id" "$(echo "$BODY" | j '.replyTo.id')" "$QS"
expect "echo carries quote sender" "$(echo "$BODY" | j '.replyTo.sender.id')" "$U2"
expect "quote excerpt folds whitespace" "$(echo "$BODY" | j '.replyTo.excerpt')" "alintilanacak mesaj ikinci satir"
expect "quote not deleted" "$(echo "$BODY" | j '.replyTo.deleted')" "false"
LONG=$(printf 'a%.0s' $(seq 1 200))
req "$T2" POST "/messages/conversations/$DM/messages" "{\"body\":\"$LONG\"}"; QL=$(echo "$BODY" | j '.id')
req "$T1" POST "/messages/conversations/$DM/messages" "{\"body\":\"uzun yanit\",\"replyToId\":$QL}"
expect "excerpt cut at 120 plus ellipsis" "$(echo "$BODY" | j '.replyTo.excerpt.length')" "121"
req "$T2" GET "/messages/conversations/$DM/messages?after=$QCUR&since=$QNOW"; expect "poll carries quote" "$(echo "$BODY" | j ".messages.find(m=>m.id===$QR).replyTo.id")" "$QS"
req "$T2" GET "/messages/conversations/$DM/messages"; expect "page carries quote" "$(echo "$BODY" | j ".messages.find(m=>m.id===$QR).replyTo.sender.name")" "$N2"
req "$T1" POST "/messages/conversations/$DM/messages" '{"body":"x","replyToId":999999999}'; expect "reply to unknown 400" "$STATUS" "400"
req "$T1" POST "/messages/conversations/$DM/messages" '{"body":"x","replyToId":"abc"}'; expect "reply to non-id 400" "$STATUS" "400"
req "$T1" POST "/messages/conversations/$DM/messages" '{"body":"duz","replyToId":null}'; expect "replyToId null is a plain message" "$(echo "$BODY" | j '.replyTo')" "null"
req "$T2" DELETE "/messages/$QS"
req "$T1" GET "/messages/conversations/$DM/messages"; expect "quote of a deleted source reads deleted" "$(echo "$BODY" | j ".messages.find(m=>m.id===$QR).replyTo.deleted")" "true"
expect "deleted quote hides the excerpt" "$(echo "$BODY" | j ".messages.find(m=>m.id===$QR).replyTo.excerpt")" "null"
expect "deleted quote keeps the sender" "$(echo "$BODY" | j ".messages.find(m=>m.id===$QR).replyTo.sender.id")" "$U2"
req "$T1" POST "/messages/conversations/$DM/messages" "{\"body\":\"x\",\"replyToId\":$QS}"; expect "reply to a deleted source 400" "$STATUS" "400"

# 4. group: create (only own friends), rename, promote, add, remove, leave
req "$T1" POST /messages/groups '{"name":"","memberIds":[1]}'; expect "group no name 400" "$STATUS" "400"
req "$T1" POST /messages/groups "{\"name\":\"Mahalle\",\"memberIds\":[]}"; expect "group no members 400" "$STATUS" "400"
req "$T2" POST /messages/groups "{\"name\":\"Mahalle\",\"memberIds\":[$U3]}"; expect "group with non-friend 403" "$STATUS" "403"
req "$T1" POST /messages/groups "{\"name\":\"  Mahalle   Kedileri \",\"memberIds\":[$U2,$U2]}"; expect "group create 201" "$STATUS" "201"; G=$(echo "$BODY" | j '.id')
expect "group name cleaned" "$(echo "$BODY" | j '.name')" "Mahalle Kedileri"
req "$T2" GET "/messages/conversations/$G"; expect "member role" "$(echo "$BODY" | j '.role')" "member"
expect "creator is admin" "$(echo "$BODY" | j ".members.find(m=>m.id===$U1).role")" "admin"
req "$T2" PUT "/messages/conversations/$G" '{"name":"Hack"}'; expect "member rename 403" "$STATUS" "403"
req "$T1" PUT "/messages/conversations/$G" '{"name":"Mahalle Kedileri 2"}'; expect "admin rename 200" "$STATUS" "200"
req "$T1" PUT "/messages/conversations/$DM" '{"name":"x"}'; expect "rename DM 400" "$STATUS" "400"
req "$T2" POST "/messages/conversations/$G/members" "{\"userId\":$U3}"; expect "member add 403" "$STATUS" "403"
req "$T1" POST "/messages/conversations/$G/messages" '{"body":"u3 gelmeden once"}'; PRE=$(echo "$BODY" | j '.id')
req "$T1" POST "/messages/conversations/$G/members" "{\"userId\":$U3}"; expect "admin adds friend 201" "$STATUS" "201"
req "$T3" GET "/messages/conversations/$G/messages"; expect "late member sees nothing from before joining" "$(echo "$BODY" | j ".messages.some(m=>m.id===$PRE)")" "false"
req "$T2" GET "/messages/conversations/$G/messages"; expect "founding member sees it" "$(echo "$BODY" | j ".messages.some(m=>m.id===$PRE)")" "true"
req "$T1" POST "/messages/conversations/$G/members" "{\"userId\":$U3}"; expect "add twice 409" "$STATUS" "409"
req "$T1" GET "/messages/conversations/$G"; expect "3 members" "$(echo "$BODY" | j '.members.length')" "3"
req "$T3" GET /messages/conversations; expect "new member sees group" "$(echo "$BODY" | j ".conversations.some(c=>c.id===$G)")" "true"

# 5. group messages and admin delete; non-admin refusal
req "$T3" POST "/messages/conversations/$G/messages" '{"body":"herkese selam"}'; GM=$(echo "$BODY" | j '.id'); expect "group send 201" "$STATUS" "201"
req "$T2" POST "/messages/conversations/$G/messages" "{\"body\":\"sana da\",\"replyToId\":$GM}"; expect "group reply 201" "$STATUS" "201"
expect "group reply quotes u3" "$(echo "$BODY" | j '.replyTo.sender.id')" "$U3"
req "$T1" POST "/messages/conversations/$G/messages" "{\"body\":\"x\",\"replyToId\":$M1}"; expect "quote across conversations 400" "$STATUS" "400"
req "$T3" POST "/messages/conversations/$G/messages" "{\"body\":\"x\",\"replyToId\":$PRE}"; expect "late member quoting a pre-join message 400" "$STATUS" "400"
req "$T2" POST "/messages/conversations/$G/messages" "{\"body\":\"x\",\"replyToId\":$PRE}"; expect "founding member quotes it 201" "$STATUS" "201"; QP=$(echo "$BODY" | j '.id')
req "$T1" GET "/messages/conversations/$G/messages"; expect "founding member sees the pre-join quote" "$(echo "$BODY" | j ".messages.find(m=>m.id===$QP).replyTo.id")" "$PRE"
req "$T3" GET "/messages/conversations/$G/messages"; expect "late member gets no quote of a pre-join message" "$(echo "$BODY" | j ".messages.find(m=>m.id===$QP).replyTo")" "null"
req "$T3" POST "/messages/conversations/$G/messages" "{\"body\":\"x\",\"replyToId\":\"$GM\"}"; expect "replyToId as a string 400" "$STATUS" "400"
req "$T2" DELETE "/messages/$GM"; expect "non-admin delete 403" "$STATUS" "403"
req "$T1" DELETE "/messages/$GM"; expect "admin deletes any 200" "$STATUS" "200"
req "$T3" GET "/messages/conversations/$G/messages"; expect "admin-deleted flag" "$(echo "$BODY" | j '.messages[0].deletedBySender')" "false"

# 6. promote, then the promoted admin removes a member; admin cannot remove admin
req "$T2" POST "/messages/conversations/$G/members/$U3/promote"; expect "member promote 403" "$STATUS" "403"
req "$T1" POST "/messages/conversations/$G/members/$U2/promote"; expect "promote 200" "$STATUS" "200"
expect "promoted role" "$(echo "$BODY" | j ".members.find(m=>m.id===$U2).role")" "admin"
req "$T2" DELETE "/messages/conversations/$G/members/$U1"; expect "admin removes admin 403" "$STATUS" "403"
req "$T2" DELETE "/messages/conversations/$G/members/$U2"; expect "remove self 400" "$STATUS" "400"
req "$T2" DELETE "/messages/conversations/$G/members/$U3"; expect "new admin removes member 200" "$STATUS" "200"
req "$T3" GET "/messages/conversations/$G"; expect "removed member 404" "$STATUS" "404"
req "$T3" POST "/messages/conversations/$G/messages" '{"body":"hala buradayim"}'; expect "removed member cannot send" "$STATUS" "404"

# 7. report a message (content_reports), own message refused, duplicate 409
req "$T2" POST "/messages/conversations/$G/messages" '{"body":"kaba bir sey"}'; RM=$(echo "$BODY" | j '.id')
req "$T2" POST "/messages/$RM/report" '{"reason":"abuse"}'; expect "report own 400" "$STATUS" "400"
req "$T1" POST "/messages/$RM/report" '{"reason":"nope"}'; expect "bad reason 400" "$STATUS" "400"
req "$T1" POST "/messages/$RM/report" '{"reason":"abuse","details":"hakaret"}'; expect "report 201" "$STATUS" "201"
expect "report target_type" "$(echo "$BODY" | j '.target_type')" "message"
req "$T1" POST "/messages/$RM/report" '{"reason":"spam"}'; expect "report twice 409" "$STATUS" "409"
req "$T3" POST "/messages/$RM/report" '{"reason":"spam"}'; expect "outsider report 404" "$STATUS" "404"

# 8. leave: last admin leaving hands admin to the longest-standing member
req "$T1" POST "/messages/conversations/$DM/leave"; expect "leave DM 400" "$STATUS" "400"
req "$T1" POST "/messages/conversations/$G/leave"; expect "leave 200" "$STATUS" "200"
req "$T2" GET "/messages/conversations/$G"; expect "u2 still admin" "$(echo "$BODY" | j '.role')" "admin"
req "$T2" POST "/messages/conversations/$G/members" "{\"userId\":$U3}"; expect "remaining admin re-adds u3 (friend of u2? no → 403 expected)" "$STATUS" "403"; befriend "$T2" "$T3" "$U3"; req "$T2" POST "/messages/conversations/$G/members" "{\"userId\":$U3}"; expect "remaining admin re-adds u3" "$STATUS" "201"
req "$T2" POST "/messages/conversations/$G/leave"; expect "last admin leaves" "$STATUS" "200"
req "$T3" GET "/messages/conversations/$G"; expect "u3 inherits admin" "$(echo "$BODY" | j '.role')" "admin"

# 9. unfriend gates DM sending, history stays
req "$T1" GET /friendships/me; FID=$(echo "$BODY" | j ".friends.find(f=>f.id===$U2).friendship_id")
req "$T1" DELETE "/friendships/$FID"
req "$T1" POST "/messages/conversations/$DM/messages" '{"body":"hala?"}'; expect "unfriended send 403" "$STATUS" "403"
req "$T1" GET "/messages/conversations/$DM"; expect "unfriended canSend false" "$(echo "$BODY" | j '.canSend')" "false"
req "$T1" GET "/messages/conversations/$DM/messages"; expect "history readable" "$(echo "$BODY" | j ".messages.some(m=>m.id===$M1)")" "true"
befriend "$T1" "$T2" "$U2"

echo; echo "harness: $pass passed, $fail failed"; [ "$fail" = 0 ]
