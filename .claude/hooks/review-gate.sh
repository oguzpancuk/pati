#!/usr/bin/env bash
# PreToolUse(Bash) hook: no commit leaves this machine without a code-reviewer
# pass. `.claude/last-reviewed` holds the sha the last review covered. It is
# written by review-mark.sh (a SubagentStop hook — the harness, not the agent)
# and stays untracked: committing it would itself create an unreviewed commit.
#
# Rule: every commit reachable from HEAD, a local branch or a tag that is not
# yet on any remote-tracking ref must be an ancestor of the marker. No refspec
# parsing at all — a stale side branch over-blocks a push of main, and that is
# the accepted cost (the parsing version leaked through seven review rounds).
# What this cannot do: launch the reviewer, or prove the review was thorough.
# It turns "forgot" into a blocked push that names the range. No exceptions —
# docs-only commits included (owner decision, 2026-09-02).
# Also refuses shell writes to the marker (Edit/Write are denied in settings).
# Fails closed on anything it cannot read.
set -uo pipefail
proj="${CLAUDE_PROJECT_DIR:-.}"
marker=".claude/last-reviewed"

command -v python3 >/dev/null 2>&1 || { echo "review-gate: python3 missing — failing closed." >&2; exit 2; }

payload="$(cat)"
cmd="$(printf '%s' "$payload" | python3 -c '
import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    sys.exit(3)
print(d.get("tool_input",{}).get("command",""))
')" || { echo "review-gate: could not parse hook payload — failing closed." >&2; exit 2; }
[ -n "$cmd" ] || exit 0
mentions() { printf '%s' "$cmd" | grep -Eq "$1"; }

# 1) The marker is harness-written. A redirect INTO it, or a writing tool
#    named alongside it, is refused; `2>/dev/null` on a read is not.
if mentions 'last-reviewed' \
   && { mentions '>>?\|?[[:space:]]*["'"'"']?[^[:space:]>]*last-reviewed' \
        || mentions '(^|[^[:alnum:]_.-])(tee|dd|ln|install|mv|cp|truncate|python[0-9.]*|node|perl|ruby|php|xargs)([^[:alnum:]_.-]|$)' \
        || mentions '(^|[^[:alnum:]_.-])sed([^;|&]*)[[:space:]]-i'; }; then
  echo "review-gate: '$marker' is written by the harness when code-reviewer finishes — never by hand." >&2
  exit 2
fi

# 1b) "Already on a remote" is decided by remote-tracking refs, which only
#     git itself writes here. Rewriting them (update-ref, symbolic-ref,
#     `fetch . x:refs/remotes/...`) would launder unreviewed commits; the
#     settings deny is prefix-matched, this is its backstop.
if mentions '(^|[^[:alnum:]_.-])(update-ref|symbolic-ref)([^[:alnum:]_.-]|$)' || mentions 'refs/remotes/'; then
  echo "review-gate: remote-tracking refs are written by git during fetch/push only — blocked." >&2
  exit 2
fi

# 2) Only pushes from here on.
mentions '(^|[^[:alnum:]_.-])git([^[:alnum:]_.-]|$)' && mentions '(^|[^[:alnum:]_.-])push([^[:alnum:]_.-]|$)' || exit 0

if mentions '(^|[[:space:]])(-C|--git-dir|--work-tree)([[:space:]=]|$)' \
   || mentions '(^|[;&|(]|[[:space:]])(cd|pushd)[[:space:]]' \
   || mentions '(^|[^[:alnum:]_])GIT_(DIR|WORK_TREE)='; then
  echo "review-gate: this push targets another directory (-C / --git-dir / cd) — blocked. Push from the project root." >&2
  exit 2
fi

cd "$proj" || { echo "review-gate: cannot enter the project directory — failing closed." >&2; exit 2; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "review-gate: not a git repository — failing closed." >&2; exit 2; }

reviewed=""
if [ -f "$marker" ]; then
  reviewed="$(awk 'NR==1{print $1}' "$marker")"
  git rev-parse --verify --quiet "${reviewed}^{commit}" >/dev/null 2>&1 || reviewed=""
fi

# Everything that could leave: HEAD, all branches, all tags — minus what any
# remote already has — minus the reviewed ancestry. Order matters: the
# explicit ^marker must precede --not, which flips the sense of what follows.
if [ -n "$reviewed" ]; then
  unreviewed="$(git rev-list --oneline HEAD --branches --tags "^$reviewed" --not --remotes 2>/dev/null)"
else
  unreviewed="$(git rev-list --oneline HEAD --branches --tags --not --remotes 2>/dev/null)"
fi
[ $? -eq 0 ] || { echo "review-gate: cannot compute the unreviewed range — failing closed." >&2; exit 2; }

[ -z "$unreviewed" ] && exit 0

echo "review-gate: these local commits have NOT been through code-reviewer:" >&2
printf '%s\n' "$unreviewed" | sed 's/^/  /' >&2
if [ -n "$reviewed" ]; then
  echo "(reviewed through ${reviewed:0:7}; a fix made after a review needs its own review)" >&2
else
  echo "(no review recorded this checkout)" >&2
fi
echo "Run the code-reviewer agent on them, act on its findings, then push. A side" >&2
echo "branch you do not mean to publish: delete it or review it — the gate does" >&2
echo "not parse refspecs and treats every unreviewed local commit as publishable." >&2
exit 2
