#!/usr/bin/env bash
# PreToolUse(Bash) hook for unattended runs ONLY. Closes the shell bypass:
# without it, `sed -i`/`tee`/redirects could edit feature_list.json and any
# work could continue past the AGENT_STOP kill switch.
# Unattended context: parse failures fail CLOSED.
set -uo pipefail
proj="${CLAUDE_PROJECT_DIR:-.}"

if [ -f "$proj/AGENT_STOP" ]; then
  echo "bash-guard: AGENT_STOP present — all commands halted by operator." >&2
  exit 2
fi

command -v python3 >/dev/null 2>&1 || { echo "bash-guard: python3 missing — failing closed." >&2; exit 2; }

payload="$(cat)"
cmd="$(printf '%s' "$payload" | python3 -c '
import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    sys.exit(3)
print(d.get("tool_input",{}).get("command",""))
')" || { echo "bash-guard: could not parse hook payload — failing closed." >&2; exit 2; }
[ -n "$cmd" ] || exit 0

# Heuristic: any command that both names feature_list.json and looks like it
# writes (redirect, tee, sed -i, mv/cp onto it, or a script interpreter).
if printf '%s' "$cmd" | grep -q 'feature_list\.json' \
   && printf '%s' "$cmd" | grep -Eq '(>|>>)|\btee\b|\bsed\b[^;|&]*-i|\bmv\b|\bcp\b|\btruncate\b|\bpython[0-9.]*\b|\bnode\b|\bperl\b'; then
  echo "bash-guard: shell write touching feature_list.json DENIED — the feature" >&2
  echo "list is edited only via the Edit tool, through the evidence gate." >&2
  exit 2
fi
exit 0
