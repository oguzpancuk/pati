Maintenance tick for pati. Work top-down; stop at the first section that
yields real work, do it, then report and end the tick.

1. CI: if .github/workflows/ci.yml is red on main — fix per the verification
   battery; don't deploy anything while red.
2. ROADMAP: take exactly ONE unblocked launch-sprint item from
   docs/ROADMAP.md and complete it with its verification evidence.
3. Tidy: answer at most one stale open question in docs/NOTES.md from the
   code; then stop.

Bounds: never start a second item in one tick; never deploy;
anything needing the simulator, local DB, or Fly is out of scope — write the
handoff into docs/NOTES.md instead of attempting it. If nothing is
actionable, say "quiet tick" and stop — do not invent work.
