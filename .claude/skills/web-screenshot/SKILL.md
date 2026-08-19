---
name: web-screenshot
description: Screenshot a page of the web PWA (local Vite or production pati-app.com) at phone size, report console errors, and verify visually. Use when asked to "check the web", "show the production page".
---

# Web screenshot

Script: `web/scripts/shot.mjs` (playwright, a `web/` devDependency; if chromium
is missing run `cd web && npx playwright install chromium`).

```bash
cd web && node scripts/shot.mjs http://localhost:5175/hayvanlar/12 "$CLAUDE_JOB_DIR/tmp/web.png" <email> <password>
cd web && node scripts/shot.mjs https://pati-app.com/profil "$CLAUDE_JOB_DIR/tmp/live.png" <email> <password>
```

- With email/password it logs in via the API and writes the token to
  localStorage; without them you get the login screen. Ask the user for the
  password; never paste it into the chat.
- The `hatalar:` line in the output summarizes console/page errors — it must
  be empty ("yok").
- Open the PNG with `Read` and judge it by eye; "returned 200" alone is not
  verification.
- Local Vite is `localhost:5175`; production is `https://pati-app.com`, the
  admin panel `https://admin.pati-app.com` (same account).
