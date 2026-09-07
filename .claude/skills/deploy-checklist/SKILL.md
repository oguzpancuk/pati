---
name: deploy-checklist
description: Pre-deploy verification checklist — run before any production deploy, when asked to "deploy", "ship", "release", "canlıya al", or "yayınla". Walks the generic gates, then the product's own deploy steps.
---

# /deploy-checklist

Walk every item IN ORDER; report each as pass / fail / not-applicable-because.
A fail stops the deploy — no "deploy anyway" without my explicit say-so.

## Generic gates (every product)

1. Working tree clean, on the release branch, synced with remote.
2. Full battery green on this exact commit: `bash .claude/hooks/verify.sh`.
3. No secrets in the diff since last deploy (`git diff <last-tag>..HEAD`
   scanned for keys/tokens/passwords).
4. Migrations/data changes: reversible, or the irreversibility is stated
   and acknowledged. A touched migration is rehearsed first: the real
   `backend/scripts/migrate.js` twice on a throwaway database built from
   production's own files (CLAUDE.md, load-bearing facts; v28 failed
   without it).
5. Release notes exist for the range (offer /release-notes if not).

## Product steps

Source of truth: `docs/DEPLOYMENT.md`. Fly.io app `pati-app` (region fra),
database `pati-db` (PostGIS). One image: backend + `web/dist` + `admin/dist`.
Only a machine with `fly auth login` done can run this.

1. `git fetch origin && git status -sb` — if behind, `git pull --rebase
--autostash origin main`. On conflict, stop and report; never deploy
   unresolved.
2. `fly auth whoami` empty → stop; the user runs `fly auth login` themselves.
3. `fly deploy --app pati-app --ha=false` — expect `release_command …
completed` and `Machine … is now in a good state`. If `release_command
failed`: `fly status -a pati-db` (a stopped machine: `fly machine start
<id> -a pati-db`), then `fly logs -a pati-app --no-tail | tail -40`.
4. Verify: `curl -s https://pati-app.com/health` → `{"status":"ok"}`;
   `curl -s -o /dev/null -w "%{http_code}" https://pati-app.com/` and
   `https://admin.pati-app.com/` → 200. Visual change → production
   screenshot: `cd web && node scripts/shot.mjs https://pati-app.com/<path>
out.png <email> <pw>`.
5. Schema changes migrated in the release step. A data script
   (`seed-guides.js --refresh/--remove`) runs via
   `fly ssh console --app pati-app -C "node scripts/…"`.
6. Rollback: `fly releases -a pati-app` → `fly deploy --image <previous
image ref> -a pati-app`.
7. Report: commit short hash, deploy result, the verification lines, any
   warnings. Never print secrets (DB password, JWT).
