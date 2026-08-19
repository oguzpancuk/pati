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

## Project layout

```
pati/
├── backend/    Node.js + Express API (PostgreSQL + PostGIS, JWT auth)
├── mobile/     React Native app (primary client)
├── web/        React + Vite PWA (permanent third client, Leaflet map)
├── admin/      Web admin panel (React + Vite)
├── shared/     Plain-SVG generators shared by web and admin
└── docs/       Product documentation
```

## Tech stack

- **Mobile:** React Native + TypeScript
- **Web/Admin:** React 18 + Vite + TypeScript
- **Backend:** Node.js + Express
- **Database:** PostgreSQL + PostGIS (geospatial queries are the core)
- **Maps:** react-native-maps (mobile) / Leaflet + OpenStreetMap (web)
- **Auth:** JWT + bcrypt

## MVP scope — complete ✅

- User registration and login
- Türkiye-focused map: mark "left food" / "left water" at your location —
  a photo is mandatory, and the action is rejected if your live position is
  more than 20 m from the marked point (urban GPS accuracy is typically
  5–20 m, so the tolerance follows that)
- A 100 m green halo around cared-for points; everywhere else stays plain map
  (the red base layer was removed — it read as constant alarm). Green fades
  over 4 h for food and 6 h for water; the more people drop at the same spot,
  the stronger the green
- Location-based care check (100 m — the same radius as the green circle, so
  you are warned exactly when you are outside one). Food and water maps are
  separate views. If the green in your area has expired, an on-device
  notification fires (requires background location; 6 h notification cooldown)
- Animal profiles (manual, at least 2 photos, multiple-choice breed/pattern
  lists for cats and dogs), a photo list, and nearby animals filtered by species
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
- Badges, levels, and points: streak, breed, and counter badges; a 10-level
  system driven by total points; a celebration modal showing rank/point deltas
  when a badge lands; a full leaderboard
- **Admin panel (web):** dashboard, user management (roles, suspension),
  animal management (edit, delete, **duplicate merge**), care-photo
  moderation, comment moderation, ad management, and a full audit log
- **Ads:** food brand in the food popup, water brand in the water popup, vet
  clinic when adding a health record. Brands in the same slot rotate per
  popup open; impressions and clicks are measured separately for reporting

## To do

Detailed plans, approaches, and open decisions: [docs/ROADMAP.md](docs/ROADMAP.md).

- [ ] **1. AI animal matching (v2)** — image-embedding model + pgvector over
  photos, with a similarity score. The current heuristic matcher (breed +
  color + distance) already runs in production flows.
- [ ] **2. Donations** — ⏸️ **Deferred.** Blockers are external, not code:
  payment provider, legal entity, accountant/lawyer sign-off, store rules.
  The decision list is ready in [ROADMAP.md](docs/ROADMAP.md).
- [x] **3. Ads** — ✅ done (see MVP list).
- [x] **4. UI** — ✅ done: the "pati" brand identity, theme layer (tokens,
  light + dark), 11 core components, SVG logo and icon set, all screens
  migrated. The web PWA follows the newer "studio aesthetic" handoff
  ([docs/design](docs/design)). See [docs/DESIGN.md](docs/DESIGN.md).
- [x] **5. Admin panel (web)** — ✅ done (see MVP list).

> ### 🚀 Launch sprint — deferred, not forgotten
>
> Feature work continues, but before **any real user touches the app** a
> mandatory list must be closed: photos to object storage, incremental
> migrations, rate limiting, moderation, KVKK (privacy) texts, deployment,
> pilot. Full list and rationale in
> [docs/ROADMAP.md](docs/ROADMAP.md). **Re-check this list at the end of
> every major task.**

Technical debt to close before production: [docs/NOTES.md](docs/NOTES.md).

## Known limits (summary)

Accepted deliberately; to be closed before production — full list with
rationale in [docs/NOTES.md](docs/NOTES.md):

1. **The leaderboard is recomputed on every request.** Fine at hundreds of
   users (set-based queries, no per-user queries), unsustainable at
   thousands; points will need periodic materialization.
2. **Photos live on the server's local disk** — no backups, no multi-node,
   no resizing. Production needs S3/R2 + CDN.
3. **Single migration file** — schema changes reset the database.
4. **Photo evidence is not validated; rate limiting only covers auth** —
   moderation exists in the admin panel, automation doesn't.
5. **Very low automated-test coverage** on the backend.
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
git clone https://github.com/oguzpancuk/Pati.git
cd Pati
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
around Kadıköy, and chats on animal profiles. 20 users have 30-day streaks and
30 have 7-day streaks, so Gold/Silver/Bronze badges all appear in the data.

Demo logins: `test1@stray.test` … `test100@stray.test`, password `password123`.

> Testing on the Android emulator? Build photo URLs via `10.0.2.2`:
> `PUBLIC_BASE_URL=http://10.0.2.2:3000 npm run seed`
>
> ⚠️ The seed script TRUNCATEs **all** data (admins included) on every run.
> Never run it against production. For production demo data see
> `scripts/seed-rehber.js` (additive, reversible; docs/DEPLOYMENT.md).
>
> Care photos are stored on the backend's local disk (`backend/uploads/`) and
> served under `/uploads/...` — development/MVP only.

### 4. Install mobile dependencies

In a new terminal:

```bash
cd Pati/mobile
npm install
```

> **Fonts:** the brand font Nunito ships in `mobile/assets/fonts/` and is
> linked to the iOS/Android projects (`react-native.config.js`). No extra
> command needed — but fonts load natively, so the **first run needs a real
> build** (`npm run ios` / `npm run android`); restarting Metro alone leaves
> system fonts. After changing font files, re-run `npx react-native-asset`.

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
bundle exec pod install
cd ..
```

**Run:**

```bash
npm run ios
```

Reaches `localhost:3000` directly; no map API key needed (Apple Maps).

### 5b. Run on Android

**Prerequisite:** Android Studio installed, an AVD created and **running**.

**Google Maps API key (required for the map):**

1. Enable "Maps SDK for Android" in the
   [Google Cloud Console](https://console.cloud.google.com/) and create a key.
2. Copy `mobile/android/app/src/main/res/values/google_maps_api.xml.example`
   to `google_maps_api.xml` in the same folder and paste your key.

**Run:**

```bash
npm run android
```

Connects to the backend via `10.0.2.2:3000` (the emulator's alias for the
host). On a physical device, change `API_BASE_URL` in
`mobile/src/api/client.ts` to your machine's LAN IP
(e.g. `http://192.168.1.5:3000/api`).

### 6. Run the web PWA and the admin panel

Both are separate web apps against the same API — no extra server.

```bash
cd web && npm install && npm run dev      # http://localhost:5175
cd admin && npm install && npm run dev    # http://localhost:5174
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

1. Create an account on the **register** screen.
2. Grant location and notification permissions — the map, care checks, and
   alerts depend on them.
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
badge is permanent (a broken streak doesn't demote it). Three groups:

| Group | Badges | Thresholds (bronze → diamond) |
| --- | --- | --- |
| **Streak** | **Mama Perisi** (food), **Su Elçisi** (water), **Mahalle Muhabiri** (registering) — longest consecutive-day streak | 1 / 7 / 30 / 365 days |
| **Breed** | One per cat/dog breed: **Tekir Ahbabı**, **Sarman Sırdaşı**, **Kangal Yoldaşı**… | 1 / 5 / 20 / 100 registrations |
| **Counter** | **Mahalle Dedikoducusu** (comments), **Pati Şifacısı** (health records) | Comments 1/10/50/200 · Health 1/5/20/100 |

Badge names read with their tier: "Altın Tekir Ahbabı", "Elmas Mama Perisi".
(Badge names are product content and stay Turkish.)

**Points:** each tier awards points (bronze 10, silver 25, gold 60,
diamond 150). Comments also score, but weighted: at most 5 comments per animal
count (1 point each) and each **distinct** animal commented on adds 3 —
breadth beats repetition.

**Levels:** total points map to 10 levels, from 🌱 Yeni Komşu (0) to
👑 Sokakların Piri (3600), with a progress bar toward the next title.

**Celebrations:** earning a badge opens a modal with the badge, its points,
old → new rank, and the new level if you leveled up. Badges earned while the
app was closed are caught when the profile screen opens.

**Leaderboard:** ranks all users by total points; ties share a rank
(1, 2, 2, 4). Your own row is pinned on top and highlighted.

**Notifications:** while the app runs, it checks every 30 minutes (and on
foreground) whether food/water remains within 100 m; if not, it shows an
on-device notification (6 h cooldown). Background operation needs
"always" location permission; without it the app still works, you just don't
get alerts while it's closed.

**Location override for remote testing:** in dev builds (`__DEV__`) the
following accounts use a fixed Kadıköy location instead of real GPS, so
distance-gated flows can be tested from anywhere and demo data is visible:

- `oguzpancuk@gmail.com` → Kadıköy, Rıhtım
- `sumeyyeayan@gmail.com` → Kadıköy, Bahariye (~250 m away — close but not
  identical, so duplicate detection can be tested with two users)
- **`test1@stray.test` … `test100@stray.test`** → spread 90–360 m around the
  Kadıköy center; each account keeps its spot across launches.

See `mobile/src/location.ts`.

> Logged in with a demo account and the map looks empty? The app probably fell
> back to real GPS — check whether that account is in the override list.

## Troubleshooting

- **"I don't see the new design"**: you are almost certainly opening the
  **old app**. The package ID changed (`com.straymobile` → `com.patiapp`), so
  the new build installs as a separate app. Uninstall the old one
  (`adb uninstall com.straymobile` on Android; long-press-delete on the iOS
  simulator), then `npx react-native start --reset-cache` and rebuild. The
  orange paw icon is the right app.
- **Text still in the system font / old icon**: fonts and icons load natively;
  rebuild with `npm run ios` / `npm run android` (iOS: `pod install` first).
- **`git clone`/`push` "Invalid username or token"**: GitHub no longer accepts
  passwords; use a Personal Access Token (step 1).
- **`ffi-*.gem requires ruby >= 3.0`**: old system Ruby; install Homebrew Ruby
  (step 5a).
- **`xcodebuild requires Xcode, but active developer directory is CommandLineTools`**:
  full Xcode isn't selected; apply step 5a.
- **`Unable to open base configuration reference file ... Pods-*.xcconfig`**:
  `pod install` hasn't run; apply step 5a.
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
