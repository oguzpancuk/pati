---
description: Bring the development environment up and launch the app in the iOS simulator
---

Bring the development environment up end to end:

1. `git pull` — the remote session may have pushed. If `package.json` or
   `Podfile.lock` changed, run `npm install` and `cd ios && pod install`;
   otherwise skip.
2. Start PostgreSQL if it is not running; run `cd backend && npm run migrate`
   if needed (schema file changed).
3. Start the backend: `cd backend && npm run dev` (keep it in the background).
4. If fresh demo data is wanted, `npm run seed` — WARNING: it wipes all data;
   ask me before running it.
5. Launch the app: `cd mobile && npm run ios`.

If Metro or the build fails: read the error, state the root cause in one
sentence, check the "development environment pitfalls" section in CLAUDE.md
(pod install, native rebuild, DerivedData), and apply the fix. When the
simulator is up, say which screen appeared and stop.
