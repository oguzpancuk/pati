#!/usr/bin/env bash
# PostToolUse(Read) hook for unattended runs: log every file this SESSION
# actually opened, keyed by session id, so the evidence gate checks evidence
# from this session only. Old session logs are pruned after a day.
set -uo pipefail
command -v python3 >/dev/null 2>&1 || exit 0

payload="$(cat)"
out="$(printf '%s' "$payload" | python3 -c '
import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    sys.exit(3)
print(d.get("session_id","nosession"))
print(d.get("tool_input",{}).get("file_path",""))
')" || exit 0
sid="$(printf '%s\n' "$out" | sed -n 1p)"
file_path="$(printf '%s\n' "$out" | sed -n 2p)"
[ -n "$file_path" ] || exit 0

proj="${CLAUDE_PROJECT_DIR:-.}"
logdir="$proj/.claude"
mkdir -p "$logdir"
log="$logdir/.session-reads.${sid}.log"
# prune other sessions' logs older than a day (bounded growth)
find "$logdir" -maxdepth 1 -name '.session-reads.*.log' ! -name ".session-reads.${sid}.log" -mmin +1440 -delete 2>/dev/null || true
printf '%s\n' "$file_path" >> "$log"
exit 0
