# pati — project notes for Claude Code

Mobile app coordinating street-animal care: a map of food/water drop points,
animal profiles, health records, badges, and a leaderboard.

This file is auto-loaded in every session; **keep it short.** Details live in
`docs/`, not here:

| Topic | File |
| --- | --- |
| Project overview | [docs/PROJECT.md](docs/PROJECT.md) |
| Remaining work, open decisions | [docs/ROADMAP.md](docs/ROADMAP.md) |
| Design system | [docs/DESIGN.md](docs/DESIGN.md) |
| **Decision rationale, known limits, environment pitfalls** | [docs/NOTES.md](docs/NOTES.md) |
| Deployment (Fly.io) steps | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |

When you make a decision and need to record the rationale, it goes in
`docs/NOTES.md`.

## Repository

```
backend/   Node.js + Express, PostgreSQL 16 + PostGIS, JWT + bcrypt
mobile/    React Native 0.74 + TypeScript  ← primary app
web/       React 18 + Vite PWA (permanent third client, Leaflet map)
admin/     React 18 + Vite + TypeScript (admin panel)
shared/    Plain-SVG generators for the web side (human + animal avatars; shared by admin and web)
```

## Things to know before you break something

- **PostGIS is load-bearing, not decorative.** The app's core is geo queries:
  `ST_DWithin` for "is there care within 100 m", `ST_MakeEnvelope` for the map
  viewport, GIST indexes. If anyone proposes switching databases, state the
  cost of losing this first.
- **The mobile side is React Native**, not React for web. Web React is only
  `admin/` and `web/`.
- **Single migration file** (`backend/migrations/001_init.sql`). No incremental
  migrations; schema changes mean resetting the database. `CREATE TABLE IF NOT
  EXISTS` silently does nothing on an existing table — beware when adding columns.
- **`users.avatar_url` holds two kinds of values**: the URL of an uploaded
  photo, or a built-in avatar key like `pati-avatar:f3` (see
  `backend/src/utils/avatars.js`). Never put it straight into `<img src>` /
  `<Image uri>`; on mobile `ui/Avatar` already disambiguates.
- **The taxonomy exists in two copies**: `backend/src/utils/taxonomy.js` and
  `mobile/src/taxonomy.ts` (pattern, color, illness, injury, vaccine lists).
  Changing one means changing the other; the server cannot delegate validation
  to the client. **web/ keeps no copy** — it imports the mobile files directly
  via the `@mobile/taxonomy` and `@mobile/avatars` aliases.
- **Avatar art exists in two technologies**: mobile uses react-native-svg
  components (`mobile/src/components/avatars/`), web uses plain SVG string
  generators (`shared/`). If a face changes, both change together.

## Verification

```bash
cd mobile   && npx tsc --noEmit && npx jest && npx react-native bundle \
  --platform ios --dev false --entry-file index.js --bundle-output /tmp/b.js
cd admin    && npx tsc --noEmit && npm run build
cd web      && npx tsc --noEmit && npm run build
cd backend  && node -e "require('./src/app.js')"   # no tests, see below
```

The battery's executable form is `bash .claude/hooks/verify.sh full`
(what `/verify` runs). A `quick` mode (tsc x3 + jest + backend load) runs
automatically before every `git push` via the push-gate hook — red battery
means the push is blocked; force pushes are always blocked.

**The backend has no automated tests.** Changes are verified manually with
curl. Writing tests is on the roadmap; if you touched the backend, actually run
the end-to-end verification — never say "it probably works".

## Language and writing conventions

- **Code, comments, docs, commit messages, and tooling are in English** with
  standard industry terms (the repo is a portfolio piece).
- **Product-facing text stays Turkish**: UI strings, API error messages,
  seeded demo content, and app routes (`/hayvanlar`) — the product serves
  Turkish users. Don't "fix" these into English.
- Comments explain **why**, not what.
- Commit bodies state the reasoning, in English, from this point on. Older
  Turkish history is intentionally left as is (rewriting would force-push).

### Mobile UI (details: docs/DESIGN.md)

- Stylesheets via **`makeStyles(({ colors: c }) => ({...}))`**, never
  `StyleSheet.create` — colors freeze in dark mode otherwise.
- **Never write `fontWeight`.** Weight comes from file selection
  (`fontFamily: 'Nunito-Bold'`); combining both produces faux bold on Android.
- **When overriding `fontSize`, also set `lineHeight`.** Setting only one makes
  iOS clip text (this broke the login-screen logo once).
- **No hex colors in screen files**; everything comes from `src/theme/`.
- Use `components/brand/Icon` instead of emoji. Badge medallions and level
  marks are SVG too: `components/badges/{BadgeSymbol,LevelMark}`.

## Development environment pitfalls

- **`pod install` is mandatory after `npm install`** (native dependencies).
- **Font and app-icon changes require a native build** — restarting Metro is
  not enough; run `npm run ios` / `npm run android`.
- The Android emulator reaches the backend via `10.0.2.2:3000`.
- The seed script **wipes all data on every run** (TRUNCATE, admins included)
  and regenerates it fresh; today's food/water actions land within the last
  hour so the map is born alive. Never run it against production.

## Session roles (two Claude Code workers)

Two sessions work on the same repo; the difference is **where they run**:

- **Ops** — the local session on the user's Mac. Has: the iOS simulator/Metro,
  Vite, the local DB in Docker, Fly login (`fly`), Namecheap DNS, secrets
  (`~/.config/pati/`), Claude Design sync (`/design-sync`). Its job: keep the
  local environment running, **ship `main` to production** (`fly deploy`),
  database/seed/certificate upkeep, cross-cutting infrastructure (rate limit,
  CORS, migrations). "Run it / ship it / check the simulator" requests go here.
- **Developer** — the claude.ai/code cloud session. Sees the repo, builds
  features, verifies in its own sandbox with tsc/build/Playwright, pushes to
  `main`. It **cannot reach** the user's machine, device, Fly account, or the
  local DB; verification that needs a device or environment is handed to Ops.

Rules: the two sessions must not touch the same file at the same time;
handoffs happen through git (push → "ship the latest"); anything requiring the
environment, accounts, or secrets goes to Ops. Roles describe access, not
ability — when Ops is idle it writes code too.

## Working principles (all agents)

An explicit request from the user — every session and subagent follows these:

1. **Challenge the user.** You are a colleague, not an order-taker: don't start
   executing before you understand the intent; if you see a cost, a risk, or a
   better path, say so before starting. Calibration: argue decisions that carry
   real cost (architecture, data, money, user-visible behavior); don't argue
   matters of taste — just build them. One round of pushback at most: state it,
   and if the user still wants it, do it and record why you objected.
2. **Strengthen and teach the agentic setup.** Knowledge goes into the repo,
   not the chat: an instruction repeated twice should become a file under
   `.claude/` — propose it and do it. On significant work, show the user in one
   sentence how it could be institutionalized (which skill/subagent/CI step
   would make it permanent). Never add a second tool for the same job; check
   the existing list first and merge on overlap.
3. **Always be honest.** "It probably works" is banned: if you didn't verify,
   say "not verified". If tests are red, say red; if you failed, say you
   failed; if you made a mistake, be the first to say it. If the user's idea is
   bad, say so without flattery — politeness in tone, honesty in content.
   "Done" requires evidence: command output, a screenshot, or a live check.

## Helpers: skills, subagents, CI

Ready in the repo (`.claude/`); every session and subagent sees them at startup:

- **Commands:** `/start` (bring the environment up), `/verify` (verification battery)
- **Skills:** `deploy` (Fly deploy + live verification), `simulator-view`
  (open a screen via deep link + screenshot), `web-screenshot` (PWA screenshot)
- **Subagents:** `code-reviewer` (read-only review), `test-writer` (writes/runs
  tests), `release-auditor` (release-sprint audit), `screen-verifier` (visual
  verification; Ops only), `design-guardian` (audits UI diffs against the
  docs/design handoff), `evaluator-qa` (skeptical judge of "done" claims;
  collects its own evidence, defaults to NEEDS_WORK)
- **Hooks** (`.claude/hooks/`, wired in settings.json): format-on-edit;
  push-gate (quick battery green required before any push; force push always
  blocked). `verify.sh` is the battery's single implementation.
- **Unattended runs:** `contracts/` (feature list + evidence gates, OFF by
  default — see `contracts/README.md`). Maintenance tick: `.claude/loop.md`.
  Instantiated-from: `.maya-version` (maya repo)
- **CI:** `.github/workflows/ci.yml` gates web/admin/mobile/backend/docker on
  every push. If it's red, don't deploy.

Typical flow when a feature lands: `code-reviewer` → `test-writer` if needed →
push → CI green → Ops runs `deploy`.

## How we work

- Work happens on `main`; no PR flow. Commit + push freely.
- If a change can produce a screenshot or visual output, produce it — in this
  project the bugs that escape tests are the visual ones (clipping, drift).
  Deep links jump straight to a screen in the simulator:
  `xcrun simctl openurl booted pati://add-animal` (paths:
  `mobile/src/navigation/index.tsx` → `linking`).

## Standing reminder

🚀 **Launch sprint.** At the end of every major task, remind the user:
photos to object storage, incremental migrations, rate limiting, moderation,
KVKK (privacy) texts, deployment, pilot. Details in
[docs/ROADMAP.md](docs/ROADMAP.md). The user explicitly asked for this
reminder — do not skip it.
