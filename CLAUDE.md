# pati

<!-- Instantiated from maya (see .maya-version); the pre-maya agent setup was
     retired on 2026-08-28 (docs/NOTES.md). Keep this file short — details
     live in docs/. -->

Mobile app coordinating street-animal care: a map of food/water drop points,
animal profiles, health records, badges, and a leaderboard. Turkish users;
English codebase.

Spec: `docs/PRD.md` · Build order: `docs/ROADMAP.md` · Working notes:
`docs/NOTES.md` · Decisions: `docs/adr/` · Overview: `docs/PROJECT.md` ·
Design system: `docs/DESIGN.md` · Deploy: `docs/DEPLOYMENT.md`

## Stack & commands

```
backend/   Node.js + Express, PostgreSQL 16 + PostGIS, JWT + bcrypt
mobile/    React Native 0.74 + TypeScript  ← primary app
web/       React 18 + Vite PWA (permanent third client, MapLibre map)
admin/     React 18 + Vite + TypeScript (admin panel)
shared/    Plain-SVG generators (human + animal avatars) for admin and web
```

| Purpose        | Command                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| install        | `npm ci` in each of backend/, mobile/, web/, admin/; then `cd mobile/ios && pod install`                               |
| dev            | `bash contracts/init.sh` (DB + backend + health check); `--ios` also launches the simulator                            |
| test           | `cd mobile && npx jest` (backend/web/admin have no tests yet)                                                          |
| typecheck      | `npx tsc --noEmit` in mobile/, web/, admin/                                                                            |
| lint           | `cd mobile && npm run lint` (mobile only; not yet in the battery)                                                      |
| quick battery  | `bash .claude/hooks/verify.sh` (tsc ×3, jest, backend load — what the push-gate runs)                                  |
| full battery   | `bash .claude/hooks/verify.sh full` (+ RN release bundle, admin build, web build)                                      |
| seed demo data | `cd backend && npm run seed` — **wipes every table**, ask first, never against production                              |
| iOS screenshot | `mobile/scripts/simulator-login.sh <email> <pw>` once, then `mobile/scripts/simulator-goto.sh pati://<path> out.png 8` |
| web screenshot | `cd web && node scripts/shot.mjs <url> out.png <email> <pw>` (playwright)                                              |
| deep link      | `xcrun simctl openurl booted pati://add-animal` (paths: `mobile/src/navigation/index.tsx` → `linking`)                 |

## Standards

- Strict typing where the language offers it; schema validation at every
  external boundary. `any`/untyped escape hatches need a `// why:` comment.
- Every feature lands with its verification: a test, or for UI a screenshot
  check — named in the ROADMAP done-when clause it satisfies. In this
  project the bugs that escape tests are visual (clipping, drift): if a
  change can produce a screenshot, produce it.
- Code, comments, docs, commits and tooling are English (the repo is a
  portfolio piece); comments explain why, not what. **Product-facing text
  stays Turkish**: UI strings, API error messages, seeded demo content,
  routes (`/hayvanlar`). Don't "fix" these into English.
- **Web and mobile stay in sync.** The web PWA is a full client, not a
  companion: every feature/UX change lands on BOTH `mobile/` and `web/`
  in the same task, each verified with its own screenshot. Where exact
  parity is impossible (OS-only capabilities), implement the closest
  equivalent and state the divergence in the report — never silently
  skip the web side. (Owner rule, 2026-08-30.)

### Load-bearing facts

- **PostGIS is load-bearing, not decorative.** The core is geo queries
  (`ST_DWithin` for "care within 100 m", `ST_MakeEnvelope` for the viewport,
  GIST indexes). Any proposal to switch databases must state that cost first.
- **Migrations are numbered files applied in order** by
  `backend/scripts/migrate.js`, which the Fly release command runs on every
  deploy. `001_init.sql` describes a database built from scratch;
  `002_social_auth.sql` and anything after it exist because production is
  never rebuilt. `CREATE TABLE IF NOT EXISTS` silently does nothing on an
  existing table, so **a new column belongs in a new numbered file as well as
  in 001** — and every statement in it must survive being re-run.
- **E-mail registration is gated until a 6-digit code is typed**
  (`users.email_verification_pending`, ADR-0004): `requireAuth` answers 403
  `emailUnverified` to a pending session everywhere except verification and
  `GET`/`DELETE /users/me`; both clients show the code screen while the flag
  is set. `email_verified` is a different column — "proven, linkable" — and
  is what the code sets. Mail is off (registration unverified, as before)
  wherever `RESEND_API_KEY` is missing; in development the code is printed
  to the backend log.
- **`users.avatar_url` holds two kinds of values**: an uploaded photo URL or a
  built-in key like `pati-avatar:f3` (`backend/src/utils/avatars.js`). Never
  put it straight into `<img src>` / `<Image uri>`; mobile's `ui/Avatar`
  disambiguates.
- **The taxonomy exists in two copies**: `backend/src/utils/taxonomy.js` and
  `mobile/src/taxonomy.ts`. Change one, change the other — the server cannot
  delegate validation to the client. web/ imports the mobile copy via the
  `@mobile/taxonomy` and `@mobile/avatars` aliases.
- **Avatar art exists in two technologies**: react-native-svg components
  (`mobile/src/components/avatars/`) and plain-SVG generators (`shared/`).
  A face changes in both or in neither.
- **The basemap styles are generated files.** All three clients render
  MapLibre with `mobile/src/map/styles/pati-{light,dark}.json`; never edit
  those JSONs by hand — change `shared/mapstyle/build.mjs` and rerun it
  (ADR-0002). Mobile's `@maplibre/maplibre-react-native` is pinned to
  10.4.2 until the RN new-architecture upgrade.

### Mobile UI (details: docs/DESIGN.md)

- Stylesheets via `makeStyles(({ colors: c }) => ({...}))`, never
  `StyleSheet.create` — colors freeze in dark mode otherwise.
- Never write `fontWeight`; weight comes from the font file
  (`fontFamily: 'Nunito-Bold'`). Both together produce faux bold on Android.
- When overriding `fontSize`, also set `lineHeight` — iOS clips otherwise
  (this broke the login-screen logo once).
- No hex colors in screen files; everything comes from `src/theme/`.
- `components/brand/Icon` instead of emoji; badge medallions and level marks
  are SVG too (`components/badges/{BadgeSymbol,LevelMark}`).

## Verification

`bash .claude/hooks/verify.sh` is the single battery (CI runs the same file).
It must pass on a clean, committed HEAD before a push or a "done" report —
`git status --porcelain` empty before and after. A result from a dirty tree
is not a result. The push-gate hook runs the quick mode before every
`git push` and blocks force pushes outright.

**The backend has no automated tests.** If you touched it, run the
end-to-end check with curl against a running instance — never "it probably
works".

Nothing leaves this machine unreviewed: the push gate refuses any local
commit newer than `.claude/last-reviewed`, which the harness writes when
code-reviewer finishes. Commit first, then review — the reviewer covers
`last-reviewed..HEAD`; a fix made after a review needs its own. Force
pushes and remote deletions are refused outright; the scan is coarse, so a
commit message that mentions a push flag is written with `git commit -F`.

## Workflow

- The repo is the memory. Read `docs/ROADMAP.md` + `docs/NOTES.md` when
  starting; update `docs/NOTES.md` (dated, append-only) when stopping.
  Decisions that constrain the future go to `docs/adr/`.
- Every task states its stopping condition up front; when met, stop & report.
- Work happens on `main`; no PR flow. Push/deploy authority comes from the
  global constitution's authority tiers (ask per push); the old local
  "push freely" loosening was retired 2026-08-30. CI must be green before
  any deploy.
- Unattended runs (goal loops, overnight): follow `contracts/README.md` —
  one feature per session, default-FAIL feature list, evidence before
  `passes: true`.
- Launch code-reviewer before reporting a feature done, and evaluator-qa
  before any deploy and after an unattended run — unprompted; the roster
  is a standing instruction, not an option.

## Environment pitfalls

- `pod install` is mandatory after `npm install` in mobile/.
- Font and app-icon changes need a native build (`npm run ios` /
  `npm run android`); restarting Metro is not enough.
- The Android emulator reaches the backend via `10.0.2.2:3000`.
- The local database is the `stray-db` Docker container on port 5433
  (`contracts/init.sh` creates or starts it).

## Deploy

Fly.io: app `pati-app` (backend + web/dist + admin/dist in one image),
database `pati-db` (PostGIS), region fra; `pati-app.com` and
`admin.pati-app.com`. Run `/deploy-checklist` — it needs a machine with
`fly auth login` done and stops if the generic gates fail. Steps and
first-time setup: `docs/DEPLOYMENT.md`.
