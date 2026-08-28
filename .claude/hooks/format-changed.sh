#!/usr/bin/env bash
# PostToolUse(Edit|Write) hook: format the touched file if the project has a
# formatter. Fails OPEN (exit 0 always) — formatting is a convenience, never
# a blocker. Stack-agnostic: does nothing when no formatter is configured.
set -uo pipefail

payload="$(cat)"
file_path="$(printf '%s' "$payload" | python3 -c '
import json,sys
try:
    d=json.load(sys.stdin)
    print(d.get("tool_input",{}).get("file_path",""))
except Exception:
    pass
' 2>/dev/null)"

[ -n "$file_path" ] && [ -f "$file_path" ] || exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Prettier, only if this project actually carries it (no global install use).
if [ -x node_modules/.bin/prettier ]; then
  node_modules/.bin/prettier --write --ignore-unknown "$file_path" >/dev/null 2>&1 || true
fi
# [STACK: add other formatters here, e.g. gofmt, ruff format, mix format]

exit 0
