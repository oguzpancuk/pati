---
description: Run the full verification battery (mobile tsc+jest+bundle, admin build, web build, backend load)
---

Verify the whole project and report the result as a short table. In order:

1. `cd mobile && npx tsc --noEmit && npx jest`
2. `cd mobile && npx react-native bundle --platform ios --dev false --entry-file index.js --bundle-output /tmp/pati-bundle.js`
3. `cd admin && npx tsc --noEmit && npm run build`
4. `cd web && npx tsc --noEmit && npm run build`
5. `cd backend && node -e "require('./src/app.js')"`

Rules:

- If a step fails, DO NOT stop — run the remaining steps too and report them
  all together at the end (which step, which error, which file).
- If there are errors, first state the root cause in one sentence, then
  propose a fix; do not start fixing without my approval.
- If everything is clean, one line is enough: "✅ 5/5 clean".
