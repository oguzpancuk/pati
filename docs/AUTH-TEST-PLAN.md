# Auth test plan — e-mail verification (ADR-0004) together with Apple/Google sign-in (S7, ADR-0003)

The two features share one rule set: an address is either **proven**
(`email_verified`, set by the code or by a verified provider e-mail),
**pending** (`email_verification_pending`, registered but no code typed —
gated), or **grandfathered** (registered before verification existed —
usable, never proven). Every scenario below is about which of the three a row
is in and what each sign-in path may do with it.

## 0. Prerequisites

```bash
bash contracts/init.sh            # Docker DB + migrations + backend on :3000
bash contracts/init.sh --ios      # …plus the simulator build
cd web && npm run dev             # web on :5175 (proxies /api to :3000)
tail -f /tmp/pati-backend.log | grep -A6 'mail:dev'   # every code lands here
```

Locally there is no mail: the dev transport prints the code (and the
subject line carries it). Real Apple/Google sign-in needs the console values
in docs/DEPLOYMENT.md; without them the buttons are hidden and only the curl
harness can exercise those paths (it runs a local issuer).

## 1. Automated — run these first, and before every push

| Command                                                | Proves                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bash backend/scripts/email-verification-check/run.sh` | pending state, the gate, wrong/expired/retired codes, cooldown, address hold and replacement (old session dies), concurrent replacement, provider takeover of a pending row, concurrent identical submissions, deletion while pending, and the S7 link a verified address unlocks (87 assertions) |
| `bash backend/scripts/social-auth-check/run.sh`        | S7: create, return, link, seven forged-token refusals, grandfathered-account refusal, case variants, deletion with provider re-auth, fresh account after deletion (42 assertions)                                                                                                                 |
| `bash .claude/hooks/verify.sh full`                    | tsc ×3, mobile jest (incl. the pending-registration state test), release bundle, web/admin builds                                                                                                                                                                                                 |

Both harnesses boot their own backend (ports 3101/3102) and leave the dev
server alone. They need `lsof` and the local database.

## 2. Manual — e-mail verification alone

Fixtures: `node backend/scripts/email-verification-check/backdate.js <user id> sent|expiry|created|grandfather`
(development only) skips the waits: cooldown, code expiry, the 24-hour hold,
or turns a fresh registration into a grandfathered one. The user id is in the
registration response and in `/users/me`.

| #   | Scenario                        | Steps                                                                                                             | Expected                                                                                                                                             |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Register on iOS                 | Register with a fresh address                                                                                     | Code screen: "…adresine 6 haneli bir kod gönderdik", resend counting down from 60. Code in the backend log.                                          |
| E2  | Type the code on iOS            | Type the six digits (the sixth auto-submits)                                                                      | Map opens; profile works; DB row `pending=false, verified=true`.                                                                                     |
| E3  | Register on web                 | Same as E1/E2 in the browser (light and dark)                                                                     | Same screen and outcome.                                                                                                                             |
| E4  | Wrong codes                     | Type a wrong code five times                                                                                      | "Kod hatalı (4 deneme kaldı)" … down to "deneme hakkın bitti, yeni kod iste"; the correct code now answers "Çok fazla hatalı deneme; yeni kod iste". |
| E5  | Resend                          | Tap resend before 60 s, then after (`backdate.js <id> sent`)                                                      | First: button disabled / 429 with the seconds; then a new code in the log, old code refused, new one verifies.                                       |
| E6  | Expired code                    | `backdate.js <id> expiry`, type the code                                                                          | "Kodun süresi dolmuş; yeni kod iste".                                                                                                                |
| E7  | Gate                            | While pending, `curl -H "Authorization: Bearer <token>" localhost:3000/api/users/me/animals`                      | 403 `{"emailUnverified":true}`; `/users/me` still 200.                                                                                               |
| E8  | Come back later                 | Kill the app while pending, reopen; or log in with the password on another device                                 | Code screen again, copy says ask for a new code (no mail was sent by login); resend works.                                                           |
| E9  | Verified elsewhere              | Leave the phone on the code screen, verify on web, reopen the phone                                               | Phone opens straight onto the map (cold-start re-read).                                                                                              |
| E10 | Wrong address                   | On the code screen tap "Çıkış yap", register with another address                                                 | New pending registration; the mistyped address stays held for a day.                                                                                 |
| E11 | Address held                    | Register the same address again within 24 h                                                                       | 409 "doğrulama bekleyen bir kayıt var… giriş yapıp yeni kod iste".                                                                                   |
| E12 | Address released                | `backdate.js <id> created`, register the same address with a new password                                         | 201 with a **new** user id; the old token gets 401 on `/users/me`; the old password gets 401; the new code verifies.                                 |
| E13 | Verified address never released | `backdate.js <verified id> created`, register the address again                                                   | 409 "zaten var"; the owner's password still logs in.                                                                                                 |
| E14 | Delete while pending            | `curl -X DELETE …/api/users/me -d '{"password":"…"}'` with a pending token (no UI path exists on the code screen) | 200; the address registers again at once.                                                                                                            |
| E15 | Grandfathered account           | `backdate.js <id> grandfather` (or an account from before the feature), log in                                    | No code screen, app works; DB row `pending=false, verified=false`.                                                                                   |
| E16 | Mail off in production          | Deploy without `RESEND_API_KEY`                                                                                   | Boot log `mail: NOT CONFIGURED`; registration answers `verificationRequired:false`, no code screen.                                                  |
| E17 | Mail on in production           | `fly secrets set RESEND_API_KEY=…`, register with an address you own                                              | Boot log `mail: Resend (from: …)`; the mail arrives, subject carries the code, iOS offers the code from the Mail notification.                       |

## 3. Manual — S7 together with verification

These need at least Google web configured (the cheapest console; see
docs/DEPLOYMENT.md). Until then, the same rules are asserted by the two
harnesses through a local issuer.

| #   | Scenario                                           | Steps                                                                                                          | Expected                                                                                                           |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| S1  | Buttons follow the server                          | `curl localhost:3000/api/auth/providers`; open login on both clients                                           | Buttons drawn only for `enabled:true` providers; none locally.                                                     |
| S2  | Provider account is born proven                    | Sign in with Google on a fresh address                                                                         | 201, straight to the map, **no code screen**; `/users/me` → `hasPassword:false, authProviders:["google"]`.         |
| S3  | Return visit                                       | Sign in with the same Google account again                                                                     | 200, same user id.                                                                                                 |
| S4  | Link into a verified password account (the S7 gap) | Register + verify by code (E1–E2), then Google with the same address                                           | 200, **same** user id; `authProviders:["google"]`, `hasPassword:true`. Before this feature this was a 409.         |
| S5  | Squat, then the owner arrives with Google          | Register on an address (do not verify), then Google sign-in with that address                                  | 201 with a **new** id; the pending row is gone: its token 401s, its password 401s. Works inside the 24 h hold too. |
| S6  | Grandfathered password account + Google            | E15 account, then Google with its address                                                                      | 409 "şifreli bir pati hesabına ait; şifrenle giriş yap" (unchanged S7 rule).                                       |
| S7  | Password login on a social-only account            | Log in with e-mail + any password on an S2 account                                                             | 401 "Bu hesap Google ile açılmış; Google ile giriş yapın".                                                         |
| S8  | Case variants                                      | Register `Ali@Example.com`, verify, then Google reports `ali@example.com`                                      | Links into the same account (addresses are stored lower-cased).                                                    |
| S9  | Deletion re-auth                                   | Profile → delete: password account types its password (wrong → 403), social account signs in with the provider | Deleted; the same Google identity afterwards gets a **fresh** account (S9 in the harness).                         |
| S10 | Suspended user                                     | Suspend in the admin panel, then provider sign-in                                                              | 403 with the reason; no identity row written.                                                                      |
| S11 | Apple specifics (iOS device)                       | Sign in with Apple, hide my e-mail; then sign out and in again                                                 | Relay address stored; the name is kept from the first authorization; second sign-in nameless but same account.     |
| S12 | iOS Google guard                                   | Server `GOOGLE_IOS_CLIENT_ID` ≠ compiled-in id (or unset)                                                      | iOS Google button hidden, app does not crash; `googleClientId.test.ts` asserts the Info.plist pairing.             |
| S13 | Unverified provider e-mail                         | Only reproducible through the harness (step 8)                                                                 | 403 for a taken and for a free address; no account created.                                                        |
| S14 | Forged tokens                                      | Only through the harness (steps 5–8b)                                                                          | Wrong audience, bad signature, expired, `alg:none`, HS256 confusion → 401.                                         |

## 4. Reading the database while testing

```bash
docker exec stray-db psql -U stray -d stray -c \
  "select id, email, email_verified, email_verification_pending, password_hash is not null as has_password from users order by id desc limit 10"
docker exec stray-db psql -U stray -d stray -c "select * from email_verifications"
docker exec stray-db psql -U stray -d stray -c "select * from user_identities order by id desc limit 5"
```

`email_verifications` holds only a salted hash — the code cannot be read
back from the database, only from the mail (or the dev log).
