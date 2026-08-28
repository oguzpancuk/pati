#!/usr/bin/env bash
# PreToolUse(Edit|Write) hook for unattended runs.
# 1) AGENT_STOP kill switch: refuse Edit/Write while the file exists.
# 2) Evidence gate: refuse writes to feature_list.json unless THIS session
#    Read evidence — an image/screenshot, a .log file, or anything under a
#    test-results|test-output|coverage|screenshots directory. Reading the
#    feature list itself, configs, or source files does NOT count.
# Unattended context: parse failures fail CLOSED (exit 2).
set -uo pipefail
proj="${CLAUDE_PROJECT_DIR:-.}"

if [ -f "$proj/AGENT_STOP" ]; then
  echo "evidence-gate: AGENT_STOP present — Edit/Write halted by operator." >&2
  exit 2
fi

command -v python3 >/dev/null 2>&1 || { echo "evidence-gate: python3 missing — failing closed." >&2; exit 2; }

payload="$(cat)"
out="$(printf '%s' "$payload" | python3 -c '
import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    sys.exit(3)
print(d.get("session_id","nosession"))
print(d.get("tool_input",{}).get("file_path",""))
')" || { echo "evidence-gate: could not parse hook payload — failing closed." >&2; exit 2; }
sid="$(printf '%s\n' "$out" | sed -n 1p)"
file_path="$(printf '%s\n' "$out" | sed -n 2p)"

case "$file_path" in
  */feature_list.json|feature_list.json) ;;
  *) exit 0 ;;
esac

log="$proj/.claude/.session-reads.${sid}.log"
if [ -f "$log" ] && grep -Ev 'feature_list\.json$|/\.claude/' "$log" \
     | grep -Eq '\.(png|jpe?g|gif)$|\.log$|/(test-results|test-output|coverage|screenshots)/'; then
  exit 0
fi

echo "evidence-gate: write to feature_list.json DENIED — no evidence Read this" >&2
echo "session. Run the verification, Read its output (screenshot / .log /" >&2
echo "test-results file), then flip passes. Observed evidence is the contract." >&2
exit 2
