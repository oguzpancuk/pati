# pati

<!-- Instantiated from maya (see .maya-version); the pre-maya agent setup was
     retired on 2026-08-28 (docs/NOTES.md). Keep this file short — details
     live in docs/. -->

Mobile app coordinating street-animal care: a map of food/water drop points,
animal profiles, health records, badges, and a leaderboard. Turkish users;
English codebase.

Spec: `docs/PRD.md` · Build order: `docs/ROADMAP.md` · Working notes:
`docs/NOTES.md` · Decisions: `docs/adr/` · Overview: `docs/PROJECT.md` ·
Design system: `docs/DESIGN.md` · Deploy: `docs/DEPLOYMENT.md` ·
Auth test plan: `docs/AUTH-TEST-PLAN.md`

## Stack & commands

```
backend/   Node.js + Express, PostgreSQL 16 + PostGIS, JWT + bcrypt
mobile/    React Native 0.74 + TypeScript  ← primary app
web/       React 18 + Vite PWA (permanent third client, MapLibre map)
admin/     React 18 + Vite + TypeScript (admin panel)
shared/    Plain-SVG generators (avatars, badges, logo) + the basemap builder
```

| Purpose        | Command                                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| install        | `npm ci` in each of backend/, mobile/, web/, admin/; then `cd mobile/ios && bundle install && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 bundle exec pod install`             |
| dev            | `bash contracts/init.sh` (DB + backend + health check); `--ios` also launches the simulator                                                                           |
| test           | `cd mobile && npx jest`; `cd backend && node --test` (14 files, 134 unit tests — no routes, no database; web/admin have none)                                         |
| typecheck      | `npx tsc --noEmit` in mobile/, web/, admin/                                                                                                                           |
| lint           | `cd mobile && npm run lint` (mobile only; not yet in the battery)                                                                                                     |
| quick battery  | `bash .claude/hooks/verify.sh` (tsc ×3, jest, web css parse, backend load + node:test — what the push-gate runs)                                                      |
| full battery   | `bash .claude/hooks/verify.sh full` (+ RN release bundle, admin build, web build)                                                                                     |
| seed demo data | `cd backend && npm run seed` — **wipes every table**, ask first, never against production                                                                             |
| showcase world | `cd backend && npm run seed-showcase` — ADDITIVE `is_demo` rows (44 districts × 50 bots); `npm run seed-showcase:remove` deletes exactly those. Safe beside real data |
| iOS screenshot | `mobile/scripts/simulator-login.sh <email> <pw>` once, then `mobile/scripts/simulator-goto.sh pati://<path> out.png 8`                                                |
| web screenshot | `cd web && node scripts/shot.mjs <url> out.png <email> <pw>` (playwright)                                                                                             |
| deep link      | `xcrun simctl openurl booted pati://add-animal` (paths: `mobile/src/navigation/index.tsx` → `linking`)                                                                |

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
  in 001** — and every statement in it must survive being re-run. Any
  statement outside a `CREATE TABLE` body that names such a column (an
  index, a standalone constraint, a partial-index `WHERE`) goes in the new
  file only: 001 runs first and fails on the column production does not
  have yet (v28). Before a deploy that touches migrations, run
  `backend/scripts/migrate.js` twice against a throwaway database built
  from production's own files (`git show <deployed>:…`).
- **E-mail registration is gated until a 6-digit code is typed**
  (`users.email_verification_pending`, ADR-0004): `requireAuth` answers 403
  `emailUnverified` to a pending session everywhere except verification and
  `GET`/`DELETE /users/me`; both clients show the code screen while the flag
  is set. `email_verified` is a different column — "proven, linkable" — and
  is what the code sets. Mail is off (registration unverified, as before)
  wherever `RESEND_API_KEY` is missing; in development the code is printed
  to the backend log.
- **The photo AI fails open** (ADR-0005). `backend/src/utils/ai.js` calls
  Gemini (`generateContent`, plain fetch) for **four** operations:
  `checkCarePhoto` (does it show food or water), `checkAnimalPhoto` (does it
  show the claimed species), `compareAnimalPhotos` (is this the same animal)
  and `locateAnimalFace` (where to crop the thumbnail). Without
  `GEMINI_API_KEY`, or on any error, the first three return `unavailable`
  and the caller accepts the photo unchecked — matching falls back to fields
  alone. `locateAnimalFace` returns `null` instead, and its fail-open is
  milder: no cut-out, so the SVG avatar stays.
  The doors, all five: a care photo is checked at `POST /care-actions/check`
  and confirmed with the returned `photoToken`; animal photos are screened
  at `POST /animals/match`, which returns one `photoToken` per photo for
  `POST /animals/:id/photos` to redeem; **`POST /animals/:id/care-photos`
  is the carer door — it screens the species AND compares against the
  animal's gallery, refusing a mismatch with `carePhotoMismatch`**; and a
  direct upload is checked inline. The server always decides. Evidence:
  `backend/scripts/ai-check/run.sh` (fake `generateContent` endpoint).
- **Photos are fitted before they are stored, and where they live is
  configurable.** Every upload is re-encoded as a JPEG inside 1600 px (512
  for avatars) with the EXIF rotation baked in
  (`middleware/imageResize.middleware.js`), so later `sharp(...).rotate()`
  calls are no-ops on our own files. `config/storage.js` then decides the
  home: the machine's disk by default, an S3-compatible bucket (Cloudflare
  R2) when the four `S3_*` variables are set, with the disk as its cache.
  Stored URLs stay `/uploads/<file>` either way — never build a bucket URL
  into a row. A bucket buys durability and serving, **not** a second
  machine: the two-request photo-token flows and the AI's gallery reads
  still go through the local volume. Unlike the photo AI this does **not** fail open: a bucket
  that refuses the object fails the upload (Turkish 503) rather than
  recording a photo nobody kept. Evidence:
  `backend/scripts/storage-check/run.sh` (fake bucket); setup in
  docs/DEPLOYMENT.md. Turning a bucket on does not move what is already on
  the volume — `backend/scripts/publish-backlog.js` is the one-off that
  does, and it is re-runnable.

- **Blocking rewrites reads in four controllers, not one.** `user_blocks`
  (016) is one row per (blocker, blocked), and `backend/src/utils/blocks.js`
  holds **four** helpers, and which one a reader needs depends on its shape.
  Two SQL fragments for lists that join many people:
  `noBlockEitherWaySql` (friend requests, user search, and all three lists in
  `listMyFriendships` — accepted friends as well as the pending ones) and
  `notBlockedByViewerSql` (an animal's comments and their total, the health
  record's comment count and its `in_treatment` test, the notification list,
  BOTH its counts, and `markRead`). And two boolean guards for a read that
  is about one person: `hasBlocked` (the profile's `blocked` flag, and
  `getUserComments`, which returns an empty list rather than filtering rows)
  and `blockExists` (refusing a friend request in either direction). **A new
  per-target list — someone's liked photos, say — fits neither fragment and
  needs the `hasBlocked` shape.** The rule in one sentence: blocking
  removes the friendship — which is what closes direct messages and
  group-add, since both gate on `areFriends` — refuses new requests in both
  directions, hides the two people from each other's search, and hides the
  blocked person's comments and notifications from the blocker, while their
  profile still opens so the block can be undone. **A new list, search or
  notification query that forgets the filter silently breaks the promise the
  block dialog makes to the user.** Evidence: `checks.sh` section 17 and
  `backend/test/blocks.test.js`.
- **`users.avatar_url` holds two kinds of values**: an uploaded photo URL or a
  built-in key like `pati-avatar:f3` (`backend/src/utils/avatars.js`). Never
  put it straight into `<img src>` / `<Image uri>`; mobile's `ui/Avatar`
  disambiguates.
- **The taxonomy exists in two copies**: `backend/src/utils/taxonomy.js` and
  `mobile/src/taxonomy.ts`. Change one, change the other — the server cannot
  delegate validation to the client. web/ imports the mobile copy through the
  `@mobile/*` alias, which covers about sixteen modules — taxonomy, avatars,
  badges, paging, reportReasons, the whole `map/` folder including the
  generated styles — not the two this line used to name. The Dockerfile
  learned the same lesson: listing them one by one broke the build every
  time a shared module appeared.
- **Avatar art exists in two technologies**: react-native-svg components
  (`mobile/src/components/avatars/`) and plain-SVG generators (`shared/`).
  A face changes in both or in neither.
- **The basemap styles are generated files.** All three clients render
  MapLibre with `mobile/src/map/styles/pati-{light,dark}.json`; never edit
  those JSONs by hand — change `shared/mapstyle/build.mjs` and rerun it
  (ADR-0002). Mobile's `@maplibre/maplibre-react-native` is pinned to
  10.4.2 until the RN new-architecture upgrade.
- **The care markers are generated files too.** `mobile/src/map/careMarkers.ts`
  is the single source (SVG, ring steps, image keys; web imports it via
  `@mobile`); `mobile/src/map/markers/*.png` + `index.ts` are its output
  from `mobile/scripts/generate-care-markers.mjs` — rerun it after any
  change there, never edit the PNGs or the index by hand.

### Mobile UI (details: docs/DESIGN.md)

- Stylesheets via `makeStyles(({ colors: c }) => ({...}))`, never
  `StyleSheet.create` — colors freeze in dark mode otherwise.
- Never write `fontWeight`; weight comes from the font file
  (`fontFamily: 'Quicksand-Bold'`). Both together produce faux bold on
  Android. The example here used to say `Nunito-Bold`, which is worse than a
  typo: the Nunito files are still linked, so copying it renders text in the
  wrong typeface rather than failing.
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

**The backend's tests are unit tests, not HTTP tests.** `cd backend && node
--test` runs fourteen files and 134 tests covering pure logic — badge
thresholds and staging, rate-limit shapes, demo visibility, block SQL
fragments, coordinate guards, storage, image resizing, the showcase seed.
None of them touches an application route or a database, though a few bind
a loopback port to drive a throwaway app. So if you touched a controller,
still run the end-to-end curl harness against a running instance
(`backend/scripts/*/run.sh`) — never "it probably works". This paragraph
used to say the backend had no automated tests at all, which told anyone
reading it to skip the suite that would have caught them.

Nothing leaves this machine unreviewed. Two hooks, not one:
`.claude/hooks/review-gate.sh` refuses any local commit newer than the
review marker the harness writes when code-reviewer finishes, and
`.claude/hooks/push-gate.sh` runs the battery and refuses force pushes. The
review scan is coarse in one direction: it refuses a command that names the
marker file **together with** a redirect or a writing binary (`tee`, `sed
-i`, `python`, `node`, …), so a script that merely mentions it in a heredoc
is refused even when it only reads; a script that must name that file goes
through the editing tools instead. Commit first, then review — the reviewer
covers marker..HEAD; a fix made after a review needs its own. Force pushes
and remote deletions are refused outright, and the same coarseness means a
commit message mentioning a push flag is written with `git commit -F`.

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

- `pod install` is mandatory after `npm install` in mobile/, and the command
  has two non-obvious halves: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 bundle exec
  pod install`. Without the UTF-8 locale CocoaPods dies inside Ruby with
  "Unicode Normalization not appropriate for ASCII-8BIT" before it reads the
  Podfile. Without `bundle exec` you get whatever CocoaPods the machine has —
  often none on `PATH`, since it is a gem, and otherwise likely 1.15+, which
  `mobile/Gemfile` pins away from (`>= 1.13, < 1.15`) because it breaks the
  RN 0.74 build. Bundler finds that Gemfile from `mobile/ios` by walking up.
  `contracts/init.sh --ios` runs the full command; it used to run the bare
  one, and a fresh checkout aborted there under `set -e` with nothing pointing
  at the cause.
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
