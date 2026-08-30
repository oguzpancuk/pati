---
name: parallel-tracks
description: Mechanics for owner-approved parallel work — worktree tracks, file claims, merges, rollback. Load only after the owner explicitly approves parallel execution of a multi-item task.
---

# /parallel-tracks — approved parallel execution

Serial is the default. Propose parallel only when ALL four hold, and
propose by showing the partition ("items 3-5-8 are a disjoint cluster,
web/ only, tsc-covered; run them in a worktree?"):
1. Large multi-item task (roughly 5+ items / several hours).
2. A genuinely disjoint file cluster exists — check the product
   CLAUDE.md's load-bearing facts for mirrors and shared resources first.
3. The cluster sits where the battery is strong (typecheck/tests);
   weakly-tested areas never go parallel.
4. Real time pressure (the owner named a deadline). Otherwise a serial
   overnight run costs nothing.

## Partition
- Predict each item's file set (quick grep/read); cluster by overlap.
- Mirrors ("change both together" comments) and shared resources (DB,
  ports, simulator) are cluster boundaries with a single owner each.
- Write every track's file claims into the session plan (ROADMAP).

## Execution
- The main session keeps the shared-resource clusters and remains the
  owner's single interface; disjoint clusters go to worktree subagents
  on their own track branches (branches stay local, deleted after merge).
- A file outside your claims is read-only. Needing to write one: check
  the other track's claims — claimed means stop and park; unclaimed
  means update your claim and continue.
- Merge each finished track into main EARLY, always with `--no-ff` (one
  merge commit per track — its rollback handle). Never resolve a merge
  conflict creatively: park the track, the owner arbitrates. A conflict
  means the partition was wrong.
- Before any push: full battery + evaluator-qa on the merged whole
  (individually green tracks can clash semantically). Pushes go from
  main only, prefix-style, each individually approved.

## Rollback
- One item = revert its commit. One track = `git revert -m 1 <merge-sha>`.
- Re-merging a reverted branch does NOT bring the changes back (git
  counts them as merged): revert the revert, or cherry-pick onto a
  fresh branch.
- When done, `git worktree list` must be back to one entry.
