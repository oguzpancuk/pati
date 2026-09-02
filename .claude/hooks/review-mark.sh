#!/usr/bin/env bash
# SubagentStop hook (matcher: code-reviewer): when the reviewer finishes,
# record the HEAD it looked at in .claude/last-reviewed. Harness-written on
# purpose — the agent cannot mark its own work reviewed (review-gate refuses
# shell writes to the file; settings deny Edit/Write on it). Fails OPEN: a
# missing marker only makes review-gate stricter.
set -uo pipefail
proj="${CLAUDE_PROJECT_DIR:-.}"
command -v python3 >/dev/null 2>&1 || exit 0

agent="$(cat | python3 -c '
import json,sys
try:
    print(json.load(sys.stdin).get("agent_type",""))
except Exception:
    print("")
')"
case "$agent" in
  code-reviewer|*:code-reviewer) ;;
  *) exit 0 ;;
esac

cd "$proj" 2>/dev/null || exit 0
head="$(git rev-parse HEAD 2>/dev/null)" || exit 0
mkdir -p .claude && printf '%s\n' "$head" > .claude/last-reviewed
exit 0
