---
name: deploy-checklist
description: Pre-deploy verification checklist — run before any production deploy, when asked to "deploy", "ship", "release", "canlıya al", or "yayınla". Walks the generic gates, then the product's own deploy steps.
---

# /deploy-checklist

Walk every item IN ORDER; report each as pass / fail / not-applicable-because.
A fail stops the deploy — no "deploy anyway" without my explicit say-so.

## Generic gates (every product)
1. Working tree clean, on the release branch, synced with remote.
2. CI green on this exact commit: the `verify` check on the commit `main`
   points at — the required check that let it merge. Do not run the
   battery locally instead: a local tree can carry deps or state CI does
   not, and CI's run is the one the merge gate trusted.
3. No secrets in the diff since last deploy (`git diff <last-tag>..HEAD`
   scanned for keys/tokens/passwords).
4. Migrations/data changes: reversible, or the irreversibility is stated
   and acknowledged.
5. Release notes exist for the range (offer /release-notes if not).
6. `evaluator-qa` on every ROADMAP item marked done since the last deploy:
   it grades each done-when clause against the running app, not the
   tests. One NEEDS_WORK stops the deploy. This is the only pass that
   checks every clause, not just the ones the battery could not see.

## Release
7. Push the release tag (`vX.Y.Z` on the commit the gates passed). That is
   the only deploy action anyone takes by hand: `deploy.yml` deploys web
   and backend once the owner approves the `production` environment on
   GitHub, and Xcode Cloud archives the iOS surface to TestFlight.
8. Watch until done: the `deploy` workflow green, the health check
   answering, the TestFlight build present — then open it on a device.
   Rollback is the same workflow run by hand with the previous tag.

## Product steps
[STACK: TODO — steps 7–8 above assume `deploy.yml` deploys on the tag. Here
it is still unconfigured (see CLAUDE.md, Deploy), so until it is filled the
tag deploys nothing and the steps below are the deploy path, run by the
owner.]

Source of truth: `docs/DEPLOYMENT.md`. Fly.io app `pati-app` (region fra),
database `pati-db` (PostGIS). One image: backend + `web/dist` + `admin/dist`.
Only a machine with `fly auth login` done can run this.

P1. `git fetch origin && git status -sb` — if behind, `git pull --rebase
--autostash origin main`. On conflict, stop and report; never deploy
   unresolved.
P2. `fly auth whoami` empty → stop; the user runs `fly auth login` themselves.
P3. `fly deploy --app pati-app --ha=false` — expect `release_command …
completed` and `Machine … is now in a good state`. If `release_command
failed`: `fly status -a pati-db` (a stopped machine: `fly machine start
<id> -a pati-db`), then `fly logs -a pati-app --no-tail | tail -40`.
P4. Verify: `curl -s https://pati-app.com/health` → `{"status":"ok"}`;
   `curl -s -o /dev/null -w "%{http_code}" https://pati-app.com/` and
   `https://admin.pati-app.com/` → 200. Visual change → production
   screenshot: `cd web && node scripts/shot.mjs https://pati-app.com/<path>
out.png <email> <pw>`.
P5. Schema changes migrated in the release step. A data script
   (`seed-guides.js --refresh/--remove`) runs via
   `fly ssh console --app pati-app -C "node scripts/…"`.
P6. Rollback: `fly releases -a pati-app` → `fly deploy --image <previous
image ref> -a pati-app`.
P7. Report: commit short hash, deploy result, the verification lines, any
   warnings. Never print secrets (DB password, JWT).
