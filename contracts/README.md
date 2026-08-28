# Unattended-run contracts

The pattern for overnight / goal-loop work, adapted from Anthropic's
long-running-agents harness (`anthropics/cwc-long-running-agents`). Everything
here is OFF by default — wire it up only for an actual unattended run, and
re-test whether each piece is still needed on every model release
(ablation watchlist: maya `CHANGELOG.md`).

## The pattern

1. **Initializer session** (once): expand the ROADMAP into
   `contracts/feature_list.json` — every feature `"passes": false` (schema:
   `feature_list.schema.json`), each with human-verifiable steps. Write
   `contracts/init.sh` (from `init.sh.example`) so every later session can
   boot the app in one command. Commit.
2. **Work sessions** (repeated): each session reads git log + NOTES.md +
   the feature list, picks ONE unfinished feature, implements it, verifies
   it end-to-end (through the UI for UI features — a passing unit test is
   not end-to-end), flips only that feature's `passes`, commits, appends a
   dated NOTES.md entry.
3. **Run it** with the built-in goal loop, always bounded:

   ```
   /goal every feature in contracts/feature_list.json has passes true,
   verify.sh exits 0, and git status is clean — or stop after 25 turns
   ```

4. **Kill switch**: create a file named `AGENT_STOP` in the repo root — the
   gates then refuse Edit/Write and (via bash-guard) all Bash commands.
   Delete it to resume.

## Rules baked into the contract

- Agents may ONLY flip the `passes` field. It is unacceptable to remove or
  edit feature entries — that is how functionality silently disappears.
- `passes: true` requires observed evidence. What counts as evidence (a
  heuristic, deliberately narrow): a screenshot/image, a `.log` file, or any
  file under a `test-results/`, `test-output/`, `coverage/` or `screenshots/`
  directory, **Read in this same session**. Reading the feature list, configs,
  or source files does not count.
- One feature per session. Progress notes + commits are the handoff; the
  next session starts from the repo, not from memory.

## Enforcement wiring (only for unattended runs)

Three hooks — add to `.claude/settings.json` for the run, remove after:

```json
"PostToolUse": [
  { "matcher": "Read", "hooks": [ { "type": "command",
    "command": "\"$CLAUDE_PROJECT_DIR\"/contracts/track-read.sh" } ] }
],
"PreToolUse": [
  { "matcher": "Edit|Write", "hooks": [ { "type": "command",
    "command": "\"$CLAUDE_PROJECT_DIR\"/contracts/evidence-gate.sh" } ] },
  { "matcher": "Bash", "hooks": [ { "type": "command",
    "command": "\"$CLAUDE_PROJECT_DIR\"/contracts/bash-guard.sh" } ] }
]
```

- `track-read.sh` logs what the session opened, keyed by session id
  (`.claude/.session-reads.<session>.log`; old sessions' logs pruned) — so
  evidence from a previous session never satisfies a new one.
- `evidence-gate.sh` denies Edit/Write on `feature_list.json` without
  this-session evidence, and enforces AGENT_STOP. Fails closed on parse
  errors — asking nicely in the prompt does not reliably stop premature
  `passes: true`; the gate does.
- `bash-guard.sh` closes the shell bypass: no `sed -i`/`tee`/redirect writes
  to the feature list, and AGENT_STOP halts Bash too. Without it the other
  two gates only cover the Edit/Write tools.

Also run the **evaluator-qa** agent on the final state: the builder never
grades its own overnight work.
