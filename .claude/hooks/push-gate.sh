#!/usr/bin/env bash
# PreToolUse(Bash) hook: gate `git push`.
#  - a real git-push invocation requires the verify battery green (exit 2 blocks)
#  - force pushes are blocked outright (run them manually if truly intended)
#  - non-push commands pass through untouched
# Parse policy: python3 missing -> disarmed but LOUD (exit 0 + stderr warning);
# payload present but unparseable -> fail closed (exit 2).
set -uo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "push-gate: python3 missing — gate DISARMED. Install python3 to re-arm." >&2
  exit 0
fi

payload="$(cat)"
cmd="$(printf '%s' "$payload" | python3 -c '
import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    sys.exit(3)
print(d.get("tool_input",{}).get("command",""))
')" || { echo "push-gate: could not parse hook payload — blocking to be safe." >&2; exit 2; }

[ -n "$cmd" ] || exit 0

# Match `git push` only at a command position (start, after ; & | ( ` $( ),
# allowing option words like -C <dir>, -c k=v, --git-dir=... in between.
# Substring matches inside strings ("echo git push", commit messages) pass.
if ! printf '%s' "$cmd" | grep -Eq '(^|[;&|(`]|\$\()[[:space:]]*git([[:space:]]+(-[Cc][[:space:]]*[^[:space:]]+|--[[:alnum:]-]+(=[^[:space:]]+)?))*[[:space:]]+push([[:space:]]|$)'; then
  exit 0
fi

# Force pushes: blocked here regardless of battery state. The settings.json
# deny rules are prefix-matched best-effort; this is the real guard.
# Only the push command's OWN arguments are inspected: a shell-aware split
# keeps quoted strings whole, so a commit message that mentions "git push -f"
# on the same command line no longer trips the gate. Exit 1 = force push,
# 0 = clean push, 3 = unbalanced quotes, 4 = no push segment recognised.
force_rc=0
printf '%s' "$cmd" | python3 -c '
import shlex, sys
cmd = sys.stdin.read()
try:
    toks = list(shlex.shlex(cmd, posix=True, punctuation_chars=True))
except ValueError:
    sys.exit(3)
segs, cur = [], []
for t in toks:
    if t and all(c in ";&|()" for c in t):
        if cur: segs.append(cur); cur = []
    else:
        cur.append(t)
if cur: segs.append(cur)
found = False
for seg in segs:
    if "git" not in seg: continue
    j = seg.index("git") + 1
    while j < len(seg) and seg[j].startswith("-"):
        j += 2 if seg[j] in ("-C", "-c") else 1
    if j >= len(seg) or seg[j] != "push": continue
    found = True
    for a in seg[j + 1:]:
        if a == "--force" or a.startswith("--force-with-lease") or a.startswith("+"):
            sys.exit(1)
        if a.startswith("-") and not a.startswith("--") and "f" in a[1:]:
            sys.exit(1)
sys.exit(0 if found else 4)
' || force_rc=$?
case "$force_rc" in
  0) ;;
  4) # The regex saw a push the tokenizer did not (inside $(...) or backticks):
     # fall back to scanning the whole line, erring on the side of blocking.
     if printf '%s' "$cmd" | grep -Eq '(^|[[:space:]])(--force(-with-lease(=[^[:space:]]*)?)?([[:space:]]|$)|-f([[:space:]]|$))' \
        || printf '%s' "$cmd" | grep -Eq 'push[^;&|]*[[:space:]]\+[[:alnum:]_/-]'; then
       force_rc=1
     fi ;;
  *) force_rc=1 ;;  # a force push, or unparseable input -> fail closed
esac
if [ "$force_rc" -ne 0 ]; then
  echo "push-gate: force push BLOCKED. If truly intended, run it yourself in a terminal." >&2
  exit 2
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

if [ ! -f .claude/hooks/verify.sh ]; then
  echo "push-gate: verify.sh missing — allowing push, but the battery gate is OFF" >&2
  exit 0
fi

if out="$(bash .claude/hooks/verify.sh 2>&1)"; then
  # forward warnings (e.g. the unconfigured-battery placeholder) so a green
  # gate that verifies nothing is never silent
  printf '%s\n' "$out" | grep -i 'warning' >&2 || true
  exit 0
else
  echo "push-gate: verify battery FAILED — push blocked. Fix, commit, retry." >&2
  echo "--- verify.sh output (last 40 lines) ---" >&2
  printf '%s\n' "$out" | tail -40 >&2
  exit 2
fi
