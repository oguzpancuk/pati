---
description: Run the full verification battery (mobile tsc+jest+bundle, admin build, web build, backend load)
---

Run `bash .claude/hooks/verify.sh full` — the single implementation of the
battery (the same script the push-gate hook runs in `quick` mode before every
push, and CI mirrors). It attempts every step even after a failure and prints
a combined summary.

Then report:

- If there are errors: first state the root cause in one sentence, then
  propose a fix; do not start fixing without my approval. List every failing
  step (which step, which error, which file) — the script's summary table has
  them all.
- If everything is clean, one line is enough: "✅ 8/8 clean".
