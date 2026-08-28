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
if printf '%s' "$cmd" | grep -Eq '(^|[[:space:]])(--force(-with-lease(=[^[:space:]]*)?)?([[:space:]]|$)|-f([[:space:]]|$))' \
   || printf '%s' "$cmd" | grep -Eq 'push[^;&|]*[[:space:]]\+[[:alnum:]_/-]'; then
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
