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

proj="$(cd "${CLAUDE_PROJECT_DIR:-.}" && pwd)" || exit 0

# Prettier, only if this project actually carries it (no global install use).
# Lesson harvested from pati: multi-package repos may have no root
# package.json — walk UP from the edited file toward the project root and use
# the nearest node_modules/.bin/prettier (config still resolves per-file).
dir="$(cd "$(dirname "$file_path")" && pwd)" || exit 0
prettier=""
while :; do
  if [ -x "$dir/node_modules/.bin/prettier" ]; then
    prettier="$dir/node_modules/.bin/prettier"; break
  fi
  if [ "$dir" = "$proj" ] || [ "$dir" = "/" ]; then break; fi
  dir="$(dirname "$dir")"
done
if [ -z "$prettier" ]; then
  # Multi-package repo with no root package.json: fall back to any
  # first-level package's prettier (config still resolves per-file).
  for cand in "$proj"/*/node_modules/.bin/prettier; do
    if [ -x "$cand" ]; then prettier="$cand"; break; fi
  done
fi
if [ -n "$prettier" ]; then
  "$prettier" --write --ignore-unknown "$file_path" >/dev/null 2>&1 || true
fi
# [STACK: add other formatters here, e.g. gofmt, ruff format, mix format]

exit 0
