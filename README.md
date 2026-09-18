# pati — Street Animal Care App

> **birlikte bakıyoruz** — "we care together"

A social-impact platform designed to improve the welfare of street animals in
Türkiye. It lets animal lovers, veterinarians, and activists coordinate the
feeding, health, and wellbeing of street dogs and cats.

> The product is Turkish-facing by design: UI strings, seeded demo content,
> API error messages, and app routes (e.g. `/hayvanlar`) are in Turkish.
> Code, comments, docs, and commit messages are in English from
> [this commit](../../commit/06ec70c) onward; earlier history is Turkish.

## Documentation

| Document | Contents |
| --- | --- |
| [docs/PROJECT.md](docs/PROJECT.md) | **The whole project in one place** — what it does, how it works, where it stands, what's next |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Remaining work, suggested order, approaches, open decisions |
| [docs/DESIGN.md](docs/DESIGN.md) | Design system — tokens, core components, rules for new screens |
| [docs/NOTES.md](docs/NOTES.md) | Rationale behind technical decisions, known limits, dev-environment pitfalls |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production deployment (Fly.io) |
| [docs/PRD.md](docs/PRD.md) | Original product requirements |
| [docs/store/APP-STORE.md](docs/store/APP-STORE.md) | App Store submission — every console field, as answered |
| [docs/adr/](docs/adr/) | Architecture decisions: basemap, social sign-in, e-mail verification, photo checks |
| [CLAUDE.md](CLAUDE.md) | Conventions and load-bearing facts for anyone (or anything) editing the repo |

## Project layout

```
pati/
├── backend/    Node.js + Express API (PostgreSQL + PostGIS, JWT auth)
├── mobile/     React Native app (primary client)
├── web/        React + Vite PWA (permanent third client, MapLibre map)
├── admin/      Web admin panel (React + Vite)
├── shared/     Plain-SVG generators (avatars, badges, logo) + the basemap builder
└── docs/       Product documentation
```

## Tech stack

- **Mobile:** React Native + TypeScript
- **Web/Admin:** React 18 + Vite + TypeScript
- **Backend:** Node.js + Express
- **Database:** PostgreSQL + PostGIS (geospatial queries are the core)
- **Maps:** MapLibre on all three clients, over a basemap style this repo
  generates (`shared/mapstyle/build.mjs`, ADR-0002) — no map API key anywhere
- **Auth:** JWT + bcrypt, plus Sign in with Google and Sign in with Apple
  (ADR-0003); e-mail registration is gated behind a 6-digit code (ADR-0004)
- **Photos:** re-encoded on upload, stored on the local disk or in an
  S3-compatible bucket (Cloudflare R2 in production), and screened by a
  hosted vision model that fails open (ADR-0005)

## MVP scope — complete ✅

- Türkiye-focused map: mark "left food" / "left water" **at your own
  position** — the app sends the device's location with the bottom button
  instead of letting you tap a spot on the map, so there is no second point to
  check it against. A photo is mandatory, and a vision model looks at it
  before the record exists: a photo that shows neither food nor water comes
  back rejected with a one-line reason (ADR-0005)
- A 100 m green halo around cared-for points; everywhere else stays plain map
  (the red base layer was removed — it read as constant alarm). Green fades
  over 4 h for food and 6 h for water; the more people drop at the same spot,
  the stronger the green
- Location-based care check (100 m — the same radius as the green circle, so
  you are warned exactly when you are outside one). Food and water maps are
  separate views. If the green in your area has expired, an on-device
  notification fires while the app is running (6 h cooldown; see
  *Notifications* below for what the OS does and does not allow)
- Animal profiles (manual, at least 1 photo taken in the app, multiple-choice
  breed/pattern lists for cats and dogs), a photo list, and nearby animals
  filtered by species
- Animals appear on the map as round avatar markers; tapping opens the
  profile. When adding a new animal the app first shows similar nearby ones —
  confirming "it's this one" moves that animal's current location and shows it
  on a mini map in its profile
- Chat on the animal profile: carers and registrars can comment (commenting
  adds you to the carer list)
- Health and medication records: carers add illness/injury records, link a
  comment to a record ("gave the medication for this illness"), and tapping a
  record lists all its comments. Each record has 3 states: **not started**
  (no comments) → **in treatment** (at least one comment) → **recovered**
  (marked by carers). Recovered records accept no new comments
- User profile: avatar, level, badges with a featured-3 selection, leaderboard
  rank, and a friendship system (search, requests, other users' profiles).
  Cared-for animals are listed with photos on both your own and others'
  profiles; recent comments are shown with a "see all" history
- Badges, levels, and points: care, count and pattern badges (no streaks —
  see below); a 10-level system driven by total points; a celebration modal showing rank/point deltas
  when a badge lands; a full leaderboard
- **Sign-in options:** e-mail and password, Sign in with Google, and Sign in
  with Apple. An e-mail registration stays gated until a 6-digit code sent to
  that address is typed in; until then every route answers 403 except
  verification and `GET`/`DELETE /users/me`
- **Messaging and groups:** direct messages between friends, group
  conversations, and a notification inbox
- **Safety tools:** report a user, an animal, a comment or a photo to the
  moderation queue; block a user, which removes the friendship, refuses new
  requests in both directions, hides each from the other's search, and hides
  the blocked person's comments and notifications — while their profile still
  opens, so the block can be undone
- **The web PWA is a full client, not a companion:** map, animals, profiles,
  health records, messages, leaderboard and the legal pages all exist there
  too, and every feature lands on both clients in the same task
- **Admin panel (web):** dashboard, user management (roles, suspension),
  animal management (edit, delete, **duplicate merge**), care-photo
  moderation, comment moderation, ad management, and a full audit log
- **Ads:** food brand in the food popup, water brand in the water popup, vet
  clinic when adding a health record. Brands in the same slot rotate per
  popup open; impressions and clicks are measured separately for reporting

## To do

Detailed plans, approaches, and open decisions: [docs/ROADMAP.md](docs/ROADMAP.md).

- [ ] **1. AI animal matching (v2)** — image-embedding model + pgvector over
  photos, with a calibrated similarity score. What runs in production today is
  a field heuristic (pattern + color + distance within 1 km) **whose ranking a
  hosted vision model then adjusts** by comparing the new photo against each
  candidate's gallery (ADR-0005); v2 replaces that comparison with vectors.
- [ ] **2. Donations** — ⏸️ **Deferred.** Blockers are external, not code:
  payment provider, legal entity, accountant/lawyer sign-off, store rules.
  The decision list is ready in [ROADMAP.md](docs/ROADMAP.md).
- [x] **3. Ads** — ✅ done (see MVP list).
- [x] **4. UI** — ✅ done: the "pati" brand identity, theme layer (tokens,
  light + dark), the core component set, SVG logo and icon set, all screens
  migrated. The web PWA follows the newer "studio aesthetic" handoff
  ([docs/design](docs/design)). See [docs/DESIGN.md](docs/DESIGN.md).
- [x] **5. Admin panel (web)** — ✅ done (see MVP list).

> ### 🚀 Launch sprint — closed for iOS
>
> The list that had to be finished before any real user touched the app —
> photos to object storage, incremental migrations, rate limiting,
> moderation, KVKK (privacy) texts, deployment, pilot — is done. The backend,
> the web PWA and the admin panel run in production on Fly.io
> ([pati-app.com](https://pati-app.com)), and **iOS 1.0 build 2 is in App
> Review** — submitted 2026-09-16, answered on 2026-09-17 with a Guideline 2.1
> information request, replied to and resubmitted on 2026-09-18. What the
> submission answered, field by field, is in
> [docs/store/APP-STORE.md](docs/store/APP-STORE.md); the reply itself is in
> [docs/store/REVIEW-REPLY.md](docs/store/REVIEW-REPLY.md). The sprint's **Android
> items are deliberately unfinished**: the Play Console track is the next
> release, not this one.

Known technical debt, with the reasoning behind each accepted limit:
[docs/NOTES.md](docs/NOTES.md).

## Known limits (summary)

Accepted deliberately — full list with rationale in
[docs/NOTES.md](docs/NOTES.md), the same six as
[PROJECT.md §4](docs/PROJECT.md):

1. **The leaderboard is recomputed on every request.** Fine at hundreds of
   users (set-based queries, no per-user queries), unsustainable at
   thousands; points will need periodic materialization.
2. ~~**Photos live on the server's local disk.**~~ **Closed 2026-09-10** —
   uploads are re-encoded and stored in Cloudflare R2 with the disk as a
   cache. What is still true: a second machine would not work, because the
   photo-token flows and the vision model's gallery reads go through the
   local volume.
3. **Numbered migrations, no ledger** — `backend/scripts/migrate.js`
   re-applies every `.sql` file on every deploy, so each must stay
   idempotent, and a new column belongs in `001_init.sql` *and* a new
   numbered file.
4. ~~**Photo evidence is not validated; rate limiting only covers auth.**~~
   **Both closed** — every care and animal photo is screened by a vision
   model (ADR-0005), and content writes are rate-limited across eight route
   files, not just auth. Seven of them key on the user; `report.routes.js`
   builds its own limiter and keys on the IP, which is what the shared
   middleware argues against for content endpoints (Turkish carriers put
   thousands of users behind one CGNAT address).
5. **Automated-test coverage is uneven.** 134 backend and 193 mobile tests
   pass, but none of them exercises an application route: the curl harnesses
   in `backend/scripts/*/run.sh` are what cover the API, and they are not in
   the battery.
6. **Notifications only fire while the app runs** — real background push
   needs APNs/FCM or geofencing.

## Getting started — full local setup

Three moving parts:

| Part | Folder | How it runs | Required? |
| --- | --- | --- | --- |
| **API** | `backend/` | `npm run dev` → `localhost:3000` | Yes — everything depends on it |
| **Mobile app** | `mobile/` | `npm run ios` / `npm run android` | Yes |
| **Web PWA** | `web/` | `npm run dev` → `localhost:5175` | Optional client |
| **Admin panel** | `admin/` | `npm run dev` → `localhost:5174` | Optional |

Order: database → backend → mobile → web/admin.

### 1. Clone

```bash
git clone https://github.com/oguzpancuk/pati.git
cd pati
```

GitHub no longer accepts passwords over HTTPS — use a
[Personal Access Token](https://github.com/settings/tokens) (classic, `repo`
scope) when prompted for a password.

### 2. Start the database with Docker

```bash
docker run -d \
  --name stray-db \
  -p 5433:5432 \
  -e POSTGRES_USER=stray \
  -e POSTGRES_PASSWORD=stray \
  -e POSTGRES_DB=stray \
  imresamu/postgis:16-3.4
```

(`imresamu/postgis` is the multi-arch community build of the official
`postgis/postgis` image — the official one emulates on Apple Silicon, which is
harmless but slow. Port `5433` avoids clashing with a preinstalled Postgres on
`5432`; use `-p 5432:5432` if yours is free.)

Confirm `stray-db` is `Up` with `docker ps`.

### 3. Set up and run the backend

```bash
cd backend
cp .env.example .env
```

Make sure `DATABASE_URL` in `.env` matches the Docker settings above:

```
DATABASE_URL=postgresql://stray:stray@localhost:5433/stray
JWT_SECRET=any-long-random-string
```

```bash
npm install
npm run migrate
npm run dev
```

When you see `pati API listening on port 3000`, it's ready — **keep this
terminal open.**

### 3b. (Optional) Load demo data

To start with a living map instead of an empty app:

```bash
npm run seed
```

Creates 100 users, 2 animals each (200 animals), food/water actions spread
around Kadıköy, and chats on animal profiles. The first 20 users get 30 days
of food and water records each, the next 30 get 7 days, the rest 1-3 — so the
data reaches **silver** on the care badges (the ladder is 1/10/50/250) and
bronze on most others. No gold or diamond tier appears in seeded data.

Demo logins: `test1@stray.test` … `test100@stray.test`, password `password123`.

> Testing on the Android emulator? Build photo URLs via `10.0.2.2`:
> `PUBLIC_BASE_URL=http://10.0.2.2:3000 npm run seed`
>
> ⚠️ The seed script TRUNCATEs **all** data (admins included) on every run.
> Never run it against production. What is safe beside real data is
> `npm run seed-showcase` — additive `is_demo` rows (44 districts × 50 bots)
> that `npm run seed-showcase:remove` deletes exactly.
>
> A local checkout stores photos on the backend's own disk
> (`backend/uploads/`), served under `/uploads/...`, because no `S3_*`
> variables are set. Production points the same code at a bucket; the stored
> URL is `/uploads/<file>` either way.

### 4. Install mobile dependencies

In a new terminal:

```bash
cd pati/mobile
npm install
```

> **Fonts:** the brand font is **Quicksand** (the older Nunito files are
> still linked but no longer referenced — don't copy them into new styles).
> Both ship in `mobile/assets/fonts/` and are linked to the iOS/Android
> projects (`react-native.config.js`). No extra command needed — but fonts
> load natively, so the **first run needs a real build** (`npm run ios` /
> `npm run android`); restarting Metro alone leaves system fonts. After
> changing font files, re-run `npx react-native-asset`.

### 5a. Run on iOS (Mac only)

**Xcode:** full Xcode from the App Store (Command Line Tools alone won't do):

```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
```

**Ruby/CocoaPods:** macOS's bundled Ruby (2.6.x) is too old; CocoaPods needs
at least Ruby 3.0:

```bash
brew install ruby
echo 'export PATH="/opt/homebrew/opt/ruby/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

**Pod install** (native dependencies — location, camera, notifications — so
repeat after every mobile `npm install`; skipping it produces "The package
'…' doesn't seem to be linked"):

```bash
cd ios
bundle install
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 bundle exec pod install
cd ..
```

> **Both halves of that second line matter.** `bundle exec` uses the
> CocoaPods version `mobile/Gemfile` pins (`>= 1.13, < 1.15` — 1.15 breaks the
> React Native 0.74 build); a bare `pod` is whatever the machine happens to
> have, if it has one at all. And without the UTF-8 locale CocoaPods dies
> inside Ruby with "Unicode Normalization not appropriate for ASCII-8BIT"
> before it even reads the Podfile, with nothing in the error pointing at the
> cause. Bundler finds the Gemfile one directory up, so running this from
> `mobile/ios` is correct.

**Run:**

```bash
npm run ios
```

Reaches `localhost:3000` directly. No map API key is needed on any platform:
the map is MapLibre over a basemap style this repo generates (ADR-0002).

### 5b. Run on Android

**Prerequisite:** Android Studio installed, an AVD created and **running**.
No map key step: MapLibre needs none, and the
`google_maps_api.xml.example` this section used to point at was deleted with
the basemap migration (ADR-0002).

**Run:**

```bash
npm run android
```

Connects to the backend via `10.0.2.2:3000` (the emulator's alias for the
host). `API_BASE_URL` in `mobile/src/api/client.ts` picks that automatically
in dev builds; for a **dev** build on a physical device, change it to your
machine's LAN IP (e.g. `http://192.168.1.5:3000/api`). Release builds ignore
all of this and talk to `https://pati-app.com/api`.

### 6. Run the web PWA and the admin panel

Both are separate web apps against the same API — no extra server.

From the repository root:

```bash
cd web && npm install && npm run dev        # http://localhost:5175
cd ../admin && npm install && npm run dev   # http://localhost:5174
```

**The admin panel needs an admin account first.** After creating an account in
the app (or loading demo data), in `backend/`:

```bash
npm run make-admin -- you@example.com     # demo data: test1@stray.test works too
```

> Why not create the first admin via the API? Admin endpoints already require
> admin rights — chicken and egg. Hence a script run by someone with server
> access. Revoke with `npm run make-admin -- you@example.com --revoke`.

Vite proxies `/api` to `localhost:3000`; if the backend runs elsewhere:
`API_URL=http://server:3000 npm run dev`. Production build: `npm run build`
→ `dist/` (static files).

**In the panel:** dashboard (counts + 30-day activity chart), users (search,
roles, suspension — a suspended account is rejected on every request even with
a valid token), animals (edit, delete, duplicate merge — photos, comments,
health records, and carers move to the target), care records (photo
moderation), comments, ads (brands, slots, campaign windows,
impression/click/CTR reports), audit log.

## Using the app

1. Create an account: e-mail and password, Sign in with Google, or Sign in
   with Apple. An e-mail registration next asks for the 6-digit code sent to
   that address — until it is typed, the session can only verify itself, read
   its own profile, or delete the account.
2. Grant location and notification permissions. Location is never asked for
   at app start: the sheet belongs to the first action that needs it (opening
   the map, adding an animal), so a refusal answers a request you actually
   saw.
3. The **map** tab shows all of Türkiye; cared-for points glow green within
   100 m, the rest stays plain. The bottom sheet tells you whether your area
   has recent food/water and lets you drop a record with a mandatory photo.
4. Zoom to street level and registered animals appear as round avatars;
   tap one to open its profile.
5. The **animals** tab lists nearby animals sorted by distance; adding a new
   one runs the match flow first ("is it this one?") to prevent duplicates.
6. The **profile** tab shows your level, cared-for animals, recent comments,
   badges (pick 3 to feature), the leaderboard, and theme selection.

### Badges, points, and ranking

All badges come in bronze / silver / gold / diamond tiers. Once earned, a
badge is permanent — the highest tier you ever reached is the one that
scores. Three groups:

**Nothing counts days.** Badges count what you did, not how many days running
you did it (owner, 2026-09-11): a streak punished one missed day and rewarded
nobody for two drops in an afternoon. The old `streak:` keys were renamed to
`care:` by migration 015 and re-awarded under the ladders below.

| Group | Badges | Thresholds (bronze → diamond) |
| --- | --- | --- |
| **Care** | **Mama Gönüllüsü** (food records), **Su Gönüllüsü** (water records) | 1 / 10 / 50 / 250 |
| **Care** | **Kayıt Gönüllüsü** (animals registered) | 1 / 5 / 20 / 100 |
| **Count** | **Takip Gönüllüsü** (comments) | 1 / 10 / 50 / 200 |
| **Count** | **Sağlık Gönüllüsü** (health records), **Aşı Gönüllüsü** (vaccinations) | 1 / 5 / 20 / 100 |
| **Pattern** | One per cat/dog pattern: **Tekir Dostu**, **Sarman Dostu**, **Kangal melezi Dostu**… | 1 / 5 / 20 / 100 registrations |

Two naming patterns and no third — "\<Area\> Gönüllüsü" for contributions,
"\<Pattern\> Dostu" for patterns — so adding a category is mechanical rather
than another joke to invent. The tier goes in front as an adjective: "Altın
Mama Gönüllüsü", "Elmas Tekir Dostu". (Badge names are product content and
stay Turkish.)

**Points:** each tier awards points (bronze 10, silver 25, gold 60,
diamond 150). Comments also score, but weighted: at most 5 comments per animal
count (1 point each) and each **distinct** animal commented on adds 3 —
breadth beats repetition.

**Levels:** total points map to 10 levels — a ladder of responsibility, from
**Yeni Komşu** (0 points) through Gönüllü and Sorumlu to **Onur Üyesi**
(3600) — with a progress bar toward the next title. The level emblem is a
procedural SVG mark drawn from the level number, not an emoji.

**Celebrations:** earning a badge opens a modal with the badge, its points,
old → new rank, and the new level if you leveled up. Badges earned while the
app was closed are caught when the profile screen opens.

**Leaderboard:** ranks users by total points; ties share a rank (1, 2, 2, 4).
Your own row is pinned on top and highlighted. Showcase (demo) accounts,
suspended accounts and self-deleted ones hold no rank — a rank is frozen into
badge awards, so it must not move because a bot arrived.

**Notifications:** while the app runs, it checks every 30 minutes (and on
every foreground, to make up for windows the OS skipped) whether food/water
remains within 100 m; if not, it shows an on-device notification (6 h
cooldown). There is no background mode: iOS suspends the app and the timer
stops with it, so the app asks only for when-in-use location. One key in
`Info.plist` is deliberately absent, and it is a specific one: the **legacy**
`NSLocationAlwaysUsageDescription`, whose mere presence makes
`@react-native-community/geolocation` turn every `getCurrentPosition` into a
background-permission request. (The modern
`NSLocationAlwaysAndWhenInUseUsageDescription` would be harmless — the two
look interchangeable and are not.) Android asks separately for background
location; without it the behaviour matches iOS.

**Where the app gets your location:** always the device. A development
override that pinned certain accounts to a fixed Kadıköy point used to live
here; it was removed in `a200d07`, so distance-gated flows are tested with
the simulator's own location simulation (Xcode → Features → Location) or on a
real device.

See `mobile/src/location.ts`.

## Troubleshooting

- **"I don't see the new design"**: you are almost certainly opening the
  **old app**. The package ID has changed twice (`com.straymobile` →
  `com.patiapp` → `com.oguzpancuk.pati`), so
  the new build installs as a separate app. Uninstall the old one
  (`adb uninstall <old id>` on Android; long-press-delete on the iOS
  simulator), then `npx react-native start --reset-cache` and rebuild. The
  orange paw icon is the right app.
- **Text still in the system font / old icon**: fonts and icons load natively;
  rebuild with `npm run ios` / `npm run android` (iOS: `bundle exec pod
  install` first).
- **`git clone`/`push` "Invalid username or token"**: GitHub no longer accepts
  passwords; use a Personal Access Token (step 1).
- **`ffi-*.gem requires ruby >= 3.0`**: old system Ruby; install Homebrew Ruby
  (step 5a).
- **`Unicode Normalization not appropriate for ASCII-8BIT`** from
  `pod install`: CocoaPods needs a UTF-8 locale. Re-run it as
  `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 bundle exec pod install` (step 5a). `contracts/init.sh
  --ios` runs the bare command, so a fresh checkout aborts there under
  `set -e` with nothing pointing at the cause.
- **`npm run migrate` fails on a column that should exist**: the migration
  runner has no ledger and re-applies every file in order, so a statement
  that is not re-runnable breaks every later deploy. See known limit 3.
- **`xcodebuild requires Xcode, but active developer directory is CommandLineTools`**:
  full Xcode isn't selected; apply step 5a.
- **`Unable to open base configuration reference file ... Pods-*.xcconfig`**:
  `pod install` hasn't run; apply step 5a.
- **`zsh: command not found: pod`**: CocoaPods is a gem, and its bin directory
  is often not on `PATH`. That is what `bundle exec` in step 5a is for.
- **`unable to attach DB: ... database is locked`** (Xcode): a stale build
  cache. Try, in order:
  ```bash
  killall -9 XCBBuildService Xcode xcodebuild 2>/dev/null
  rm -rf ~/Library/Developer/Xcode/DerivedData
  rm -rf ~/Library/Caches/com.apple.dt.XCBuild ~/Library/Caches/com.apple.dt.Xcode
  ```
  If it persists, reboot and retry from a single terminal.
- **Docker: `ports are not available: ... address already in use`**: port
  `5432` is taken by another Postgres; use `5433` as in step 2 (and update
  `DATABASE_URL`).
- **Docker: `platform does not match host platform`**: harmless emulation
  warning on Apple Silicon; the `imresamu/postgis` image in step 2 removes it
  entirely.
