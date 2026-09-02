#!/usr/bin/env bash
# PreToolUse(Bash) hook: gate `git push`.
#  - force pushes and remote deletions are refused outright
#  - a push requires the verify battery green (exit 2 blocks)
#  - non-push commands pass through untouched
#
# No shell parsing. Two earlier versions tokenised the command to inspect
# "the push's own arguments" and both leaked: `env git push`, `\git push` and
# `GIT_TRACE=1 git push` never reached the force check, and --mirror/--delete
# did not count as force (reproduced 2026-09-02; harvested from pati's seven
# review rounds). This version asks two questions of the raw text — does it
# mention git and push, does it carry a force-shaped flag anywhere — and
# accepts the false positives that buys: a commit message that mentions
# "push -f" blocks the command. Write such messages with `git commit -F`.
# Parse policy: python3 missing -> disarmed but LOUD; unreadable -> fail closed.
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
mentions() { printf '%s' "$cmd" | grep -Eq "$1"; }

# Is this a push? Word matches anywhere — prefixes like env, \, VAR=1 cannot
# hide it. Substring hits ("echo git push") pay the price of the checks below.
mentions '(^|[^[:alnum:]_.-])git([^[:alnum:]_.-]|$)' && mentions '(^|[^[:alnum:]_.-])push([^[:alnum:]_.-]|$)' || exit 0

# Force / destructive: -f (in any short-flag cluster), --force*, --mirror,
# --delete/-d, a +refspec, or a `:branch` deletion refspec. Anywhere, with
# any non-word boundary — `$(git push -f)` ends the flag with ")".
if mentions '(^|[^[:alnum:]_.-])(-[[:alnum:]]*f[[:alnum:]]*|--force[^[:space:])]*|--mirror|--delete|-d)([^[:alnum:]_.-]|$)' \
   || mentions '[[:space:]]\+[[:alnum:]_/.-]' \
   || mentions '[[:space:]]:[[:alnum:]_/.-]'; then
  echo "push-gate: force push / remote deletion BLOCKED. If truly intended, run it yourself in a terminal." >&2
  echo "(The scan is coarse: a commit message mentioning such a flag also trips it — use git commit -F.)" >&2
  exit 2
fi

# Another repository (-C, --git-dir, a preceding cd): the battery can only
# vouch for this project, so refuse rather than guess.
if mentions '(^|[[:space:]])(-C|--git-dir|--work-tree)([[:space:]=]|$)' \
   || mentions '(^|[;&|(]|[[:space:]])(cd|pushd)[[:space:]]' \
   || mentions '(^|[^[:alnum:]_])GIT_(DIR|WORK_TREE)='; then
  echo "push-gate: this push targets another directory (-C / --git-dir / cd) — blocked. Push from the project root." >&2
  exit 2
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || { echo "push-gate: cannot enter the project directory — blocking to be safe." >&2; exit 2; }

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
