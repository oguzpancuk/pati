---
name: deploy
description: Deploy the latest main to Fly.io (pati-app.com + admin.pati-app.com), then verify production. Use when asked to "deploy", "ship it", "canlıya al". Only the Ops session (the Mac with fly login) can run this.
---

# Deploy

Source of truth: `docs/DEPLOYMENT.md`. App `pati-app` (Fly.io, fra), database
`pati-db` (PostGIS, 1 GB RAM). Single image: backend + web/dist + admin/dist.

1. `git fetch origin && git status -sb` — if behind, `git pull --rebase --autostash origin main`.
   On conflict, stop and report; never deploy unresolved.
2. If `fly auth whoami` is empty, stop: tell the user to run `fly auth login`
   in their own terminal.
3. `fly deploy --app pati-app --ha=false` — expect `release_command … completed`
   and `Machine … is now in a good state` in the output. If `release_command
   failed`: `fly status -a pati-db` (if the machine is stopped,
   `fly machine start <id> -a pati-db`) and `fly logs -a pati-app --no-tail | tail -40`.
4. Verify: `curl -s https://pati-app.com/health` → `{"status":"ok"}`;
   `curl -s -o /dev/null -w "%{http_code}" https://pati-app.com/` and
   `https://admin.pati-app.com/` → 200. If the change is visual, take a
   production screenshot with the `web-screenshot` skill.
5. If the schema changed, migrate already ran in the release step; if a data
   script is needed (`seed-rehber.js --tazele/--temizle`), use
   `fly ssh console --app pati-app -C "node scripts/…"`.
6. Report to the user (in Turkish): commit short hash, deploy result,
   verification lines, any warnings. Never print secrets (DB password, JWT).
