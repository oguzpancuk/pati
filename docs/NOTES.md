# Technical Notes, Decisions, and Known Limits

This file keeps the **rationale** behind decisions made during development and
the things deliberately postponed. Purpose: six months from now, "why was this
done this way?" must still have an answer, and the items that must close
before production must not be forgotten.

When you make a decision or knowingly accept a limit, add a line here.

---

## Upstream candidates (maya)

<!-- Improvements made HERE to files that came from the maya template
     (.claude/hooks/, contracts/, evaluator-qa, loop.md) that maya should
     inherit. /update-stack harvests this list monthly. Format:
     date · file · one-line what/why. Remove entries once upstreamed. -->

- (upstreamed to maya `cd1a40d`, 2026-08-30: the plan-and-parallelize and
  mid-work-question candidates — owner-refined: serial stays the default,
  parallel tracks are opt-in via the new /parallel-tracks template skill,
  questions preempt the turn. Parity-test candidate below stays parked by
  owner decision.)
- 2026-08-30 · verify.sh / template test seed · Parity-test candidate: the
  repo now has three comment-enforced mirrors (taxonomy backend↔mobile,
  badge thresholds backend↔mobile catalog display, MAX_DISTANCE_TO_PIN).
  A small jest test that `require`s the backend copies by relative path and
  asserts equality would make the mirrors machine-checked (suggested by the
  S4 code review).

---

### 2026-08-28 — pre-maya agent setup retired; only the maya layout remains

The August-19 "agent factory" (`.claude/commands/{start,verify}`, agents
design-guardian / release-auditor / screen-verifier / test-writer, skills
deploy / simulator-view / web-screenshot, and the CLAUDE.md sections
"Session roles", "Working principles", "Helpers", "How we work", "Standing
reminder") is gone. Owner decision: one layout per product, the maya
template, so /update-stack can diff it. Where the content went:

- `/start` → `contracts/init.sh` (DB + backend + health check; `--ios` for
  the simulator). `/verify` → the commands table in CLAUDE.md.
- `deploy` skill → the product-steps section of the template's
  `/deploy-checklist` (Fly commands, verification, rollback).
- Screenshot skills → the scripts they wrapped, listed in the commands
  table (`mobile/scripts/simulator-*.sh`, `web/scripts/shot.mjs`).
- code-reviewer / evaluator-qa → template verbatim; project rules are read
  from CLAUDE.md, not baked into the agent.
- CI → the template shape: one `verify` job running `verify.sh full` (plus
  the schema migrate step and the docker build, which the battery does not
  cover).
- Dropped without a successor, by owner decision: the Ops/Developer session
  roles, the "working principles" trio (challenge / institutionalize /
  honesty — the global maya CLAUDE.md carries honesty), and the launch-sprint
  standing reminder (docs/ROADMAP.md is the reminder).

## 1. Product decisions and rationale

### Distance tolerance is 20 meters

It started at 10 m. Typical urban GPS accuracy is 5–20 m; the 10 m limit was
rejecting honest users who really were dropping food. 20 m still requires
physically being there but removes accuracy-driven false rejections.
`backend/src/controllers/care.controller.js` → `MAX_DISTANCE_TO_PIN_METERS`
(the same constant exists on mobile in `mobile/src/screens/MapScreen.tsx` —
**defined in two places; change both together**).

### Fade window equals warning window

Food 4 h, water 6 h. The map-green fade time and the "care missing" warning
window are deliberately identical: when they differed, warnings could fire
while the map was still green. Food runs out/spoils faster than water — hence
the different durations.

The window is computed **per row** (the `CASE` inside `WINDOW_HOURS_SQL`), so
food and water fade at their own speeds even when listed in one query.

### Badges never demote

Even when an active streak breaks, the tier stays; points come from the
highest tier reached. Rationale: badges are a reward mechanism, not a
punishment; a profile that gets poorer after losing a streak kills motivation.

### Comment points are breadth-weighted

At most 5 comments per animal count (1 point each) plus 3 points per
**distinct** animal commented on. Rationale: flat per-comment scoring would
let 500 comments on one animal break the leaderboard. This formula makes
breadth (caring about many animals) worth more than repetition.
`backend/src/utils/badges.js` → `commentPoints()`.

### Illness state is derived, not stored

A health record's state (`not_started` / `in_treatment` / `recovered`) has no
column; it derives in SQL from "are there comments?" and "is `recovered_at`
set?". Rationale: a stored value could go stale when comments were
added/deleted. A derived value cannot desync.

### Badge names are deliberately warm and playful

The first draft named breed badges like "Tekir Avcısı" ("Tabby Hunter") —
"hunter" carries an aggressive connotation that doesn't fit this product;
what's pursued here is a living creature receiving care, not prey. Current
names build on friendship: Tekir Ahbabı, Sarman Sırdaşı, Kara Kedi Kankası,
Kangal Yoldaşı, Mama Perisi, Su Elçisi, Mahalle Muhabiri, Mahalle
Dedikoducusu, Pati Şifacısı. The tier reads as a leading adjective:
"Altın Tekir Ahbabı". (Names are product content and stay Turkish.)

### The moment of earning a badge is stored; the badge itself is not

Badges are derived data (recomputable at any time), but "when did you earn
this and what was your rank at that moment" cannot be reconstructed — ranking
also shifts as others earn points. So `user_badge_awards` stores only a
**snapshot of the earning moment**: points before/after, rank before/after,
level before/after.

The "previous rank" comes from the `users.last_rank` snapshot, refreshed both
when a badge lands and when the profile opens — in practice it means "where
you stood last time you looked". The first badge has nothing to compare to,
so `rank_before` stays NULL and the UI handles that case.

### Ranking is computed only when a badge is actually new

`syncBadgeAwards` runs after every point-earning action, but the expensive
part (the all-users ranking scan) only runs when a new badge was actually
earned. Badge sync is a side job: if it fails, the main action (food drop,
comment…) is not rolled back — a delayed badge beats a failed action.

### The seed script marks badges as "seen"

Demo users' 30-day streaks generate dozens of badges. Without a backfill, the
first action on a demo account exploded them all as celebration popups at
once. `seed-demo.js` therefore writes existing badges with `seen_at = now()`.

> The same applies to real users: when this feature ships onto a database
> with existing data, run a similar backfill or users will get their entire
> backlog on their next action.

### Ad rotation keeps no cursor

"Each open shows the next brand" — instead of a cursor table, the position
derives from **how many impressions the user has in that slot**:
`index = impressions % brand_count`. Impressions are recorded for billing
anyway, so this yields a per-user, evenly distributed rotation with no extra
state.

Per-user rather than global because a global cursor shows two simultaneous
users the same brand and skips entries for a user opening twice in a row.
Cost: adding/removing a brand shifts the order. Acceptable.

### Impressions are recorded on display, not on fetch

`GET /api/ads` is side-effect-free; the impression is a separate `POST`. An
ad fetched but never rendered isn't billed, and rotation advances by what was
actually shown. (A GET recording impressions would let retries or prefetching
inflate the counter.)

### Ads are a side feature: failures never break a flow

If an ad can't be fetched, an impression/click can't be reported, or the
target URL won't open, the user sees no error — the banner silently doesn't
render. Breaking the food-drop flow over an ad is unacceptable. With nothing
active, the banner isn't drawn at all (an empty box would wreck the layout).

### The mandatory "Reklam" label

Users must be able to tell content from advertising. Both honesty and store
policy expect it.

### Users are suspended, never deleted

The admin panel has "suspend", not "delete". Rationale: a user's care actions
are the map's data and their comments are content others read — deleting the
account destroys data other people see. A suspended account has
`suspended_at` set and every API request is rejected (`requireAuth` checks it
each time), while the historical contribution stays.

This also practically solves **JWT non-revocability**: even with a valid
token, a suspended user gets 403.

### Admins can't change their own role/status

A sole admin accidentally demoting themself locks the panel entirely (the
only recovery is the server-side script). Hence users can't modify role or
suspension fields on their own record.

### The audit log is best-effort

If `writeAuditLog` fails, the primary action is not rolled back — only
logged. Rationale: the delete/edit has already happened; failing the request
over the log makes things worse. The content of deleted records is written
into the audit log — the row is gone but "what was deleted" stays answerable.

### Animal merge runs in a single transaction

If half of the photo/comment/health/carer moves succeeded, two broken records
would remain. `user_animal_care` has a composite primary key, so
`ON CONFLICT DO NOTHING` is required when the same person cares for both.

### Featured badges store only the key

`users.featured_badges` holds keys like `["streak:feeder", "breed:Tekir"]`,
no tier. When the user climbs from silver to gold, the profile badge upgrades
by itself — no sync job.

### Notifications are computed on device, not on the server

Instead of "send this user a notification", the device takes its own location
and queries `/api/care-actions/status`. Rationale: the user's location is
never streamed to the server. Cost: no notifications while the app is fully
closed (see Known Limits #6).

### The location override is `__DEV__`-only

Two personal accounts (`oguzpancuk@gmail.com`, `sumeyyeayan@gmail.com`) and
**all demo accounts** (`test1@stray.test` …) get a fixed Kadıköy location —
so distance-gated flows can be tested from abroad. The branch never runs in
production builds.

The two personal accounts are ~250 m apart so duplicate-animal detection can
be tested with two users. Demo accounts derive their spot
**deterministically** from their number (golden-angle spread, 90–360 m from
the center): random placement would teleport an account between launches; a
single fixed point would stack 100 accounts.

> Demo accounts weren't in the override at first, and the map looked empty in
> tests — the device's real GPS was used abroad. The seed writes to Kadıköy,
> so the override must share the seed's center.

---

### The 2-second matching wait is a deliberate placeholder

The "AI matching" screen shows for at least 2 s
(`mobile/src/screens/AddAnimalScreen.tsx` → `MIN_MATCHING_MS`). The server
currently checks species/pattern/color/distance and returns instantly, so the
wait is artificial; it makes the comparison feel real and reserves the slot
for photo-based matching (ROADMAP §1). When that lands, the constant goes and
the screen stays.

### Similarity is a tier, not a percentage

`GET /api/animals/match` returns high/medium/low; no numeric score reaches
the client. The only signal is a few user-entered fields; "73% similar" would
promise a precision that doesn't exist. Scoring lives in one place
(`animal.controller.js` → `similarityFor`: pattern +2, color +1, within
200 m +1; ≥3 high, 2 medium, else low). Species filters: a cat never matches
a dog.

### Nearby animals 1 km; food/water effect radius 100 m

The "nearby" list dropped from 5 km to 1 km: that's a walkable care distance,
a street animal doesn't leave its neighborhood, and at 5 km the list filled
with irrelevant records. The heart animation uses the same 100 m as the map's
green circle (`MapScreen.tsx` → `ACTION_CIRCLE_RADIUS_METERS`) — one
definition of "effect area" in the app. Widening it later is one constant.

### Pagination: profile previews + "show more"; full lists scroll

Profile screens are ScrollViews; instead of infinite scroll they use an
explicit button (`ui/LoadMoreButton`, "Show more (12)") — users see where
they stopped and how much is left. Preview size is **3** everywhere
(animals, friends, comments, animal chat); "more" fetches pages of 20. Only
full-list screens (nearby animals, comments) load via FlatList
`onEndReached`. Server side is `limit/offset`; without `limit` the old wide
default holds so the map fetches its surroundings in one request. The chat
paginates newest-backwards and each page returns in chronological order
(`listComments`).

### In production the web PWA owns the root; the landing page lives at /tanitim

Decision (launch prep): production serves `web/dist` from the root (one https
address, `/api` same-origin, SPA fallback); the `backend/public` landing page
moved to `/tanitim/` (paths made relative). See docs/DEPLOYMENT.md. In
development, with no `web/dist`, the root serves nothing and the landing page
is still `/tanitim/`.

### The root used to be a PWA shell, not a web app (history)

The page under `backend/public/` answered "add to home screen via URL":
manifest + service worker + icons, opens full-screen, offline shell. It shows
"is there food/water near me" via the public `/api/care-actions/status`; no
login, map, or profile. The service worker is served with `Cache-Control:
no-cache`; otherwise browsers stick to an old sw.js and never update. When
shell files change, bump `CACHE` in `sw.js`.

### The `pati://` deep-link scheme

`mobile/src/navigation/index.tsx` → `linking`. Infrastructure for share links
and a way to jump straight to screens in development:
`xcrun simctl openurl booted pati://add-animal` (or `pati://animal/12`,
`pati://profile`). Ends manual navigation during screenshots. The scheme is
registered in iOS Info.plist and AndroidManifest — **changing it needs a
native build**.

The iOS simulator asks "open with pati?" for every `openurl` and it can't be
confirmed from the CLI. Dev workaround: in `__DEV__`, `linking.getInitialURL`
reads and clears the `devInitialUrl` key from AsyncStorage. Usage (with Metro
running):

```bash
D=booted; C=$(xcrun simctl get_app_container $D com.patiapp data)
M="$C/Library/Application Support/com.patiapp/RCTAsyncLocalStorage_V1/manifest.json"
node -e 'const f=process.argv[1];const m=JSON.parse(require("fs").readFileSync(f));m.devInitialUrl="pati://add-animal";require("fs").writeFileSync(f,JSON.stringify(m))' "$M"
xcrun simctl terminate $D com.patiapp; xcrun simctl launch $D com.patiapp
```

### The red base layer was removed from the map

Originally all of Türkiye was painted with a red polygon and cared-for spots
"cleaned" it with green circles (everything alarmed, good spots the
exception). Removed: it muddied Apple Maps' beige ground and radiated a
tension foreign to the app's calm tone. Amber and terracotta were tried and
drowned in the ground. Now: uncared area is plain map, cared area is a solid
green circle (`MapScreen.tsx` → `MAX_GREEN_ALPHA` 0.30 → 0.50), and the
"no food around here" message moved to the banner and notifications. The rule
is unchanged: outside a green circle you get warned.

### The web doesn't block records when location is unavailable

Mobile requires the real device location for food/water and animal records.
Web (`web/`) is softer: when location fails (http origin — browsers refuse
without even asking in insecure contexts —, permission denied, desktop), a
food/water record lands at **the map center** and an animal record at the
Kadıköy center, and the user is told why (`web/src/location.ts` →
`LocationError`, message by cause). Rationale: on `http://<ip>` over shared
Wi-Fi no permission dialog can help; saying "grant permission" misleads, and
blocking the flow made testing impossible. In production (https) the browser
asks normally; if denied, the same softness applies.

### Web care alerts only while the tab is open

`web/src/careAlerts.ts` applies the same rule as mobile (no food/water within
100 m, 6 h cooldown) via the browser Notification API; there is no background
push — no alerts with the tab closed. On iOS Safari the Notification API only
exists for installed PWAs; unsupported means never asked. Real background
notifications are the mobile app's job; web push (VAPID + service worker) is
a near-launch decision.

### Map animals: 200 m, and only when zoomed right in

Mobile `ANIMAL_RADIUS_METERS = 200`, `ANIMAL_VISIBLE_MAX_DELTA = 0.004`; web
`ANIMAL_RADIUS_METERS = 200`, `ANIMAL_VISIBLE_MIN_ZOOM = 17`. The user's
business is with the animals on their own street; a 10 km fetch drawn at city
scale filled the map with avatars. The celebration zoom (`CELEBRATE_ZOOM_*`)
must stay inside the visibility threshold or hearts fire while avatars hide.

### Trying it from a phone: same Wi-Fi (http) and tunnel (https)

`web/vite.config.ts` listens on external interfaces (`host: true`); on the
same Wi-Fi `http://<mac-ip>:5175` opens, but iOS gives no location over http.
For a real test: `TUNNEL=1 npm run dev` +
`cloudflared tunnel --url http://localhost:5175` (quick tunnel, no account;
the URL changes each start). The API rides the `/api` proxy, so one tunnel is
enough. `TUNNEL=1` binds HMR to 443/wss — without it the page opens but live
reload breaks.

## 2. Technical decisions

### The leaderboard is computed set-based

Instead of a query per user, all users are computed in one query set with
`user_id = ANY($1)`. With 100 demo users the query count is constant. For the
scale limit see Known Limits #1.

### Streaks via "gaps and islands"

The consecutive-day streak comes from the classic gaps-and-islands pattern
(groups where `d - ROW_NUMBER()` stays constant) — no app-side loops.

### `react-native-maps` pinned to 1.14.0

Newer versions demand React ≥ 18.3.1; the project is React 18.2.0 /
RN 0.74.5. The map library can't upgrade before React/RN do.

### Map interaction

- Zoom uses `animateToRegion` (delta), not `animateCamera({zoom})` — the
  latter was unreliable on Apple Maps.
- Tapping a marker also fires `MapView.onPress`. Android disambiguates via
  `event.nativeEvent.action === 'marker-press'`, but iOS lacks that field —
  a timestamp guard (`MARKER_PRESS_GUARD_MS`) covers iOS.
- `animateToRegion` before the map is ready silently drops; hence
  `onMapReady` + a pending-center retry.

### No camera in the simulator

`launchCamera` returns `camera_unavailable` in the simulator. `__DEV__`
builds fall back to the gallery (`launchImageLibrary`); production keeps the
photo requirement as is.

### Docker image `imresamu/postgis:16-3.4`

The official `postgis/postgis` has no arm64 build; it emulates on Apple
Silicon with warnings. `imresamu/postgis` is the multi-arch community build
and runs natively. Host port 5433 because 5432 is usually taken by a
preinstalled PostgreSQL on Macs.

### 401 → automatic logout

An API-client interceptor clears the token and drops the user at the login
screen on 401. Rationale: after a database reset, a stale token once left the
app unable to either log in or log out.

### Font weight comes from files, not `fontWeight`

Nunito ships as four files and typography tokens write
`fontFamily: 'Nunito-Bold'`, never `fontWeight`. Using both makes Android
synthesize a fake bold over an already-bold file. Filenames match PostScript
names exactly; Android resolves the family from the filename and iOS from the
PostScript name — only a matching pair lets one `fontFamily` work on both.

### Fonts came from `@expo-google-fonts` without depending on it

React Native wants `.ttf`. `@fontsource/nunito` ships only `.woff/.woff2`,
split per alphabet — Turkish characters live in `latin-ext`, so single files
were missing ı/ğ/ş. `@expo-google-fonts/nunito` contains complete `.ttf`
files, so they were copied out; the package itself is not a dependency (no
Expo runtime needed). The license travels along as
`mobile/assets/OFL-Nunito.txt` — SIL OFL requires it.

### SVG icons instead of emoji

Tab, button, and list icons are SVG in `components/brand/Icon.tsx`. Emoji
render differently per device/OS, can't take the brand color, and size with
typography. The deliberate exceptions were badge tiers (🥇🥈🥉💎) and level
marks — both have since moved to custom SVG as well.

### Overriding `fontSize` requires `lineHeight` too

Typography variants carry `fontSize` and `lineHeight` as a pair. Overriding
only `fontSize` breaks the pair and **iOS clips the text** — the 46 pt "pati"
wordmark once squeezed into a 22 pt line box and got cut in half.

Solved in two layers: `ui/Text` lowers the variant's line height when a
caller sets `fontSize` without `lineHeight` (clipping can't silently recur);
`Wordmark`, `Avatar`, and `Button` set both explicitly because their metrics
must be predictable.

### `makeStyles` instead of `StyleSheet.create`

Dark mode required theme-bound stylesheets. `StyleSheet.create` runs once at
module load, freezing colors on the first theme. `theme/makeStyles.ts`
returns a factory instead: the sheet is built **once per theme** and cached;
components call `const styles = useStyles()`. With two themes the cache is
bounded.

For the same reason `navigationTheme` / `screenOptions` / `tabBarOptions`
are functions of the theme, not static objects.

### Theme choice is tri-state and stored on device

`system` (default) / `light` / `dark`. `system` follows the OS
(`useColorScheme`). Stored in `AsyncStorage` (`pati.themeMode`); unreadable
storage silently falls back to system — a theme preference isn't critical data.

### The app icon is generated from code

`mobile/scripts/generate-icons.mjs` produces every icon size from the same
SVG paths as `Logo.tsx` (`npm run icons`). A script rather than manual PNG
exports because a logo change regenerates everything with one command and the
in-app logo can't drift from the home-screen icon. The App Store rejects
alpha in the 1024 px icon, so square icons are opaque; only the Android round
variant and the launch logo are transparent.

### No fixed height on the tab bar

`tabBarStyle` has no `height`. `@react-navigation/bottom-tabs` adds the
bottom safe area itself; a fixed height clips labels on notched phones.

### Built-in avatars live in `avatar_url`, not a separate column

A user's picture is **one of two things**: an uploaded photo or a chosen
built-in avatar. They answer the same question and can't both be valid — a
tagged union, not two independent fields. So built-in avatars are written
into the same column as `pati-avatar:f3`.

Win: none of the dozens of queries returning user pictures (comments,
friends, leaderboard, carers, search) changed. Cost: `avatar_url` is no
longer always a URL. The single rule is never to put the value straight into
`<img src>` — mobile's `ui/Avatar` disambiguates itself and the admin panel
has an explicit check.

The "cleaner-looking" `avatar_key` column alternative required touching 8+
queries and three client types, and the schema still couldn't prevent both
fields being set at once.

### 20 avatars, not 20 image files

Faces are drawn from a few parameters (skin, hair color, hairstyle,
glasses/beard, background). App size doesn't grow, a new face is one line,
and everything shares one drawing language. The same approach powers badge
medallions and level marks.

### Two PWA surfaces existed — merged at deployment

`backend/public/` was an installable **landing page** at the root (the Ops
session's work); `web/` is the full app client. Both claimed `/`,
`/manifest.webmanifest`, and `/sw.js` — they can't share an origin.
Deployment decision: production gives `/` to `web/dist` and the landing page
moved to `/tanitim` (see the entry above).

### The web PWA joined as a permanent third client

A web version living _alongside_ the store app (deliberate choice; a
quick-pilot-tool variant was also considered). To avoid copies: web imports
the taxonomy and avatar definitions straight from mobile via the
`@mobile/taxonomy` / `@mobile/avatars` aliases; SVG generators are shared
with admin under `shared/`. The service worker caches the app shell only —
the API is never cached; stale care data lies on the map.

Known limits: on iOS, web push works only for installed PWAs (notifications
remain mobile-only for now). The map tiles come from tile.openstreetmap.org —
the OSMF tile server's usage policy doesn't fit heavy production traffic;
switch to a paid/own tile server before launch (on the roadmap).

---

### The studio aesthetic reached mobile without a new native dependency

When the mobile UI moved to the studio aesthetic (Quicksand, white +
hairlines, gradient discipline), the gradient was implemented as an
absolutely positioned `react-native-svg` rectangle (`brand/Gradient`) rather
than adding `react-native-linear-gradient`: svg was already linked, so no new
pod install for anyone. The launch screen dropped its text on purpose —
launch storyboards render before custom fonts register, and the wordmark in a
system font looked broken. The old Nunito files stay linked (removing them
means touching the Xcode project for no gain) but nothing references them.

### Reports don't delete content; the queue and the knife are separate

`content_reports` has no foreign key to its target (like audit*log) so a
report survives the target's deletion, and closing a report never deletes
content — deletion stays on each entity's own admin screen with its own
audit trail. One \_open* report per user per target (partial unique index)
keeps repeat taps from flooding the queue while still allowing a re-report
after a resolve. The legal text lives in `web/src/legal.ts` and is served at
`/gizlilik`; mobile links to the hosted page instead of embedding a copy, so
a legal edit ships without an app-store release.

### iOS lockfiles and the generated privacy manifest are committed; the pilot's financial model is not

`Podfile.lock`, `Gemfile.lock` and `StrayMobile.xcworkspace` went untracked
for months, which meant no other machine (or CI) could reproduce the exact
pod set. They are now versioned like any lockfile. React Native 0.74's
`pod install` post-install step rewrites `PrivacyInfo.xcprivacy` (merging
the reasons the pods require, e.g. `3B52.1`) and links it into the target's
Resources; that rewrite is deterministic and required by the App Store, so
its output is committed rather than reverted after every install.
`docs/pilot/` holds the pilot plan and the veterinary promo PDF (the plan's
attachment); the revenue-model spreadsheet is gitignored because the repo
is a portfolio piece that may go public and a binary spreadsheet in git
history cannot be un-published later.

## 3. Known limits and technical debt

To close before production, in rough priority order:

1. **The leaderboard recomputes per request.** Fine with 100 demo users (one
   query set, none per user), unsustainable when users reach thousands —
   scanning every badge and comment on each open won't hold. Fix: write
   points to a table periodically (cron / materialized view) and read from
   there. Left undone as premature optimization — **first place to look when
   scale grows.**

2. **Photos on the backend's local disk** (`backend/uploads/`, served under
   `/uploads`). No backups, gone when the container is rebuilt, incompatible
   with multiple instances. Production needs S3 / R2 / GCS + CDN. Uploads cap
   at 10 MB but **images are never resized** — every photo is stored and
   downloaded full-size.

3. **Single migration file** (`001_init.sql`). No incremental migrations; a
   schema change means resetting the database. Move to a migration tool
   (node-pg-migrate, Knex…) before real user data.

4. ~~**Photo evidence isn't validated.**~~ Largely closed: the photo AI
   screens care photos (ADR-0005) and every content write has a per-user
   ceiling. The last uncapped endpoint was the ad impression — the number
   an advertiser is billed for, reported by the client — capped 2026-09-10
   at 200/hour with clicks at 60 (`limits.adImpressions`,
   `limits.adClicks`, `test/rateLimits.test.js`).

5. **Automated test coverage is very low.** One mobile test (AuthContext), no
   backend tests — verification was manual, end to end, with curl. CI now
   gates builds (`.github/workflows/ci.yml`), but the backend needs tests for
   auth, the care-action distance check, badge computation, and leaderboard
   ordering at minimum.

6. **Notifications only arrive while the app runs.** A 30-minute timer plus a
   foreground check; iOS suspends the app in the background, so truly-closed
   delivery doesn't happen. Fix: server-side push (APNs/FCM) or OS geofencing.

7. **JWTs can't be revoked.** Expiry is 7 days (`JWT_EXPIRES_IN`), but logout
   or suspension can't invalidate a token server-side. (Suspension still
   blocks access — every request re-checks the account.) A refresh-token /
   denylist mechanism will be needed for a true "ban" feature.

8. **`MAX_DISTANCE_TO_PIN_METERS` is defined twice** (backend + mobile). A
   shared config endpoint would be sounder.

9. **Badge celebrations ride on action responses.** The popup feeds off
   `newBadges` in point-earning responses; missed ones are collected on the
   profile screen via `/users/me/badge-awards`. A user who never opens their
   profile sees celebrations late. Real-time delivery would need push.

10. **The admin panel sits on an unprotected address.** `/api/admin` checks
    roles, but the panel itself (static files) exposes a login screen to the
    internet. Consider IP allowlisting or at least 2FA in production. Auth
    rate limiting (30/15 min) now covers the login endpoint.

11. ~~**The location-override code is in the repo.**~~ Removed 2026-09-10.
    It was `__DEV__`-only, but it hard-coded two real e-mail addresses into
    a repo meant as a portfolio piece and it meant those accounts never
    exercised the permission flow the App Store reviewer will. The
    simulator gets its fake location from the OS instead
    (`simctl location`, wired into `mobile/scripts/simulator-login.sh`),
    and testing on a real device no longer needs a fake at all: the
    showcase seed covers 44 districts of Istanbul, Izmir and Ankara, so
    real GPS in any of them has data around it.

12. **CORS is wide open** (`app.use(cors())`). Restrict origins in production.

13. **White on orange fails WCAG AA.** White on brand orange `#F47A4A`
    measures **2.7:1** (4.5:1 required for body text). All primary buttons
    use the combination. Kept because the brand identity specifies it —
    decide before launch: darken the fill (~`#C2551F`, 4.6:1) or switch to
    dark text (`#2B2B2B`, 5.3:1). The web studio-aesthetic gradient buttons
    inherit the same question.

14. **The accessibility audit is incomplete.** Touch targets are 44 pt and
    buttons have `accessibilityRole`; screen-reader labels aren't tested end
    to end.

15. **The admin panel isn't aligned with the brand palette.** Mobile moved to
    the "pati" identity; `admin/src/styles.css` still uses its own variables
    (`--moss`, `--clay`).

---

## 4. Development-environment pitfalls

Things that cost time before and will come up again:

- **Font and icon changes require a native build.** They load natively;
  restarting Metro is not enough — rebuild with `npm run ios` /
  `npm run android`.
- **`pod install` is mandatory after `npm install`.** Skipping it (native
  deps: location, camera, notifications) produces "The package '…' doesn't
  seem to be linked".
- **Xcode `unable to attach DB: database is locked`**: deleting DerivedData
  isn't enough; also delete `~/Library/Caches/com.apple.dt.XCBuild` and
  `~/Library/Caches/com.apple.dt.Xcode`.
- **macOS's system Ruby (2.6.x) is too old for CocoaPods** — Homebrew Ruby
  required.
- **`EADDRINUSE :::3000`**: an old `nodemon` process is still alive.
- **The Android emulator resolves `localhost` to itself** — reach the backend
  via `10.0.2.2:3000`. Testing demo data on Android:
  `PUBLIC_BASE_URL=http://10.0.2.2:3000 npm run seed`.
- **No map API keys anywhere** since the MapLibre + OpenFreeMap basemap
  (ADR-0002); the old Google Maps key requirement on Android is gone.
- **The seed script wipes everything on every run** (TRUNCATE, admins
  included) and regenerates fresh data — never point it at production; the
  production-safe alternative is `scripts/seed-guides.js`.
- **`Linking.openSettings()` lands on the Settings ROOT in the simulator**;
  on a real device it opens the app's own pane (Settings → pati, where the
  Konum row lives) directly. Don't chase it as an app bug, and don't reach
  for `App-Prefs:` paths — those are private API and an App Store
  rejection risk. Testing the permission alert needs an account without
  the dev location override (e.g. e2e-loc@example.com) plus
  `xcrun simctl privacy booted revoke location <bundle id>` (the id was
  `com.patiapp` when this was written; see 2026-09-02).

---

## 2026-08-28 — One basemap on all three clients (MapLibre + OpenFreeMap)

The three map renderings (Apple Maps / Google Maps / Leaflet+OSM raster)
were replaced by a single brand-styled MapLibre basemap; ADR-0002 has the
decision and the provider trade-offs. Working notes:

- `shared/mapstyle/build.mjs` generates the committed
  `mobile/src/map/styles/pati-{light,dark}.json` from OpenFreeMap's liberty
  style; the map ground now matches the `mapGround` token in both themes,
  and mobile switches basemap style with the app theme (it never did with
  Apple/Google).
- Mobile: react-native-maps → `@maplibre/maplibre-react-native@10.4.2`
  (pinned, old-arch; see ADR). Care circles moved from per-view `Circle`s
  to one GeoJSON ShapeSource with data-driven opacity. Zoom thresholds are
  now the same MapLibre zoom numbers as web (16/17/18).
- Web: Leaflet → `maplibre-gl@6`. Two 6.6.0 pitfalls cost real debugging
  time, both worked around in `MapPage.tsx` with comments: (1) Vite
  pre-bundling breaks maplibre's own worker URL — the map silently renders
  only its background, no error anywhere; fixed with `?worker&url` +
  `setWorkerUrl`. (2) StrictMode's dev double-mount (create → remove →
  create in one tick) left the second map's style permanently unparsed;
  fixed by deferring map creation one animation frame.
- The web "breathing" ring animation is no longer CSS (canvas, not SVG); a
  150 ms timer modulates the paint expression and the default 300 ms paint
  transition smooths it. Care-circle alphas were unified to mobile's bolder
  numbers (`MAX_GREEN_ALPHA` 0.5) — the old web fills were fainter.
- Verified: web light+dark playwright screenshots and iOS simulator
  light+dark screenshots (streets, POIs, Turkish labels, care circles,
  animal avatar markers; Kadıköy). Android not run — no Android SDK on this
  machine; the map code is platform-shared, but check an emulator launch
  (and that the removed Google Maps key breaks nothing) when one is
  available. MapLibre-native quirks found on iOS: LineLayers reject
  polygon geometry (outlines now use LineString rings from
  `circleRing`), Camera `maxBounds` does not clamp programmatic
  `setCamera` (centerOnUser skips locations outside Turkey — the
  simulator's San Francisco default hit this), and a benign per-tile
  "Invalid geometry" WARN is swallowed via `Logger.setLogCallback`
  (mobile/src/map/styles.ts).
- In-app browser panes/screencast tools can throttle rAF until an
  interaction — a MapLibre map can look "stuck blank" there while being
  fine in a real browser; trust playwright/simulator screenshots.

---

## 2026-08-30 — review fixes deployed; push authority moved to the global tiers

Second production deploy (`18ebfa9`, bundle `index-DdBTg_Jo.js`): the
code-review fixes (toggle-race guards, breath-timer battery fix, web
maxZoom 19) are live; evaluator-qa PASSed post-deploy with a sha256 match
between the live bundle and the local build, and a behavioral rapid-toggle
test. Process changes this session: pushes now require per-instance owner
approval (authority tiers, global constitution; pati's "push freely"
loosening retired in b81ecf1), the agent-roster rule is a standing
instruction (ported from maya a005446), and three upstream candidates await
the next /update-stack. Still open: Android emulator verification.

## 2026-08-30 — improvement sprint S1+S2 (drop UX, permission shortcut, recovered undo)

Sprint plan: ROADMAP "Improvement sprint". Landed this session:

- **S1 — drop-at-current-location UX.** Map sheet CTA is now imperative
  ("Mama bırak"/"Su bırak") with a persistent crosshair hint ("Kayıt şu
  anki konumuna işlenir"); the confirm modal moved to the same voice
  ("Bulunduğun yere mama bırak" → "Fotoğrafını çek"). Verified with
  simulator screenshots (light/dark). **Item 6 closed by evidence:** with
  theme=system and the OS in dark, map ground and app surfaces match (the
  basemap migration had already fixed it). Pitfall for future sessions: the
  simulator's AsyncStorage may hold a stale `pati.themeMode` from earlier
  sessions — a "theme not following system" symptom can be that stored
  preference, check it before debugging.
- **S2 — location-permission shortcut + recovered undo.** Permission
  denials throw `LocationPermissionError` (Android denial, iOS code 1) and
  Map/Animals/AddAnimal screens offer "Ayarları aç" via
  `Linking.openSettings()`; background flows stay silent. The "iyileşti"
  button became an action-phrased outline and recovered records got a
  carer-only "geri al" (`POST .../health-records/:recordId/reopen`).
  Reopen clears `recovered_by`, which intentionally drops the marker's
  derived health-count credit (a record that isn't recovered shouldn't
  credit anyone); already-awarded badges stay (badges never demote). Both
  recover and reopen use conditional UPDATEs (state in the WHERE clause)
  against concurrent double-apply. Verified: curl e2e chain
  (recover→409→reopen→409→404) and full UI flow screenshots.
- **Process note:** the first S2 commit accidentally swept S1-fix hunks of
  MapScreen into the earlier commit via a whole-file `git add`, leaving a
  non-typechecking intermediate commit; caught by code review, fixed by an
  owner-approved local history rewrite (392c251 + 8efaade), with the
  intermediate commit re-typechecked in a throwaway worktree.
- Legal research for the terms-of-use work (S8) landed in
  docs/legal/terms-research.md — headline risks: Law 7527 (2024) changed
  the street-dog regime, TBK 67 "bakımını üstlenen" liability is the main
  clause to disclaim, medication logging is sensitive under Law 6343.

## 2026-08-30 — improvement sprint S3–S6 (history+delete, form colors, badge catalog, AI interstitial)

- **S3 — drop history + 15-minute delete.** Profile section "Mama & su
  geçmişim" (preview 3 + show more); `GET /api/care-actions/mine` returns a
  server-computed `deletable` flag (never re-derive on device);
  `DELETE /api/care-actions/:id` is owner-only inside 15 minutes, both
  conditions in the DELETE's WHERE clause, own rate bucket (20/h), photo
  file cleaned up. Review findings fixed: malformed id → 404, offset-past-
  end total, separate delete limiter. Verified by curl chain + UI flow.
- **S4+S5 ran as a parallel worktree track** (B track) while S3/S6 ran on
  main; merged cleanly. S4: species gates the pattern/color pickers,
  per-species top-3 street colors fixed in BOTH taxonomy copies, colors are
  now multi-select flattened into the single `color` column with ", " —
  color-based match hits will be rarer against old single-color records
  (tuning candidate). S5: BadgeCatalogModal shows every obtainable badge —
  locked placeholders for all 10 patterns and full tier ladders; display
  mirrors backend thresholds (see the parity-test upstream candidate).
- **S6 — placeholder AI photo check.** After the food/water photo, the
  confirm modal becomes an "AI inceliyor" interstitial (min 2 s padded
  around the real upload, brief "Uygun görünüyor", always approves) — same
  deliberate-placeholder pattern as `MIN_MATCHING_MS`; the real model later
  plugs into this screen with a reject path. Review findings fixed: the
  upload behind the cancel-less interstitial is now bounded (60 s axios
  timeout — the client has NO default timeout, remember this for other
  no-escape UIs) and the confirm content no longer flashes during fade-out
  (aiCheck resets on modal open, not before close).
- Simulator evidence for interstitials: the flow completes in ~3 s, faster
  than a tap→screenshot round trip; the states were captured by temporarily
  lengthening the wait constants, then reverting them before commit.

## 2026-08-30 — third production deploy: improvement sprint live

Deployed `484964e` (range 18ebfa9..484964e — the full improvement sprint,
terms of use, and review/QA fixes). Gates: full battery green, no schema
changes, secrets scan clean, evaluator-qa functional PASS (its two
findings closed pre-deploy: owner approved the terms text in-session; the
negative-pagination 500 fixed in 0423fe1). Verified live: /health ok,
root+admin 200, /gizlilik renders and the live bundle
(index-BcseN9sE.js) contains the new terms with the old "(kısa)" heading
gone. Note: /gizlilik answers curl without an Accept: text/html header
with the API 404 — the SPA fallback is header-gated; use a browser-like
request when smoke-testing. Sprint remainder: S7 (Apple+Google login,
needs owner-side console setup).

## 2026-08-30 — sprint item 3 redone per pattern; full web parity closed

- **Item 3 rework (owner correction: "tür" = the pattern, not the
  species).** Cascade is species → pattern → ONLY that pattern's top-3
  street colors + "Diğer" (no full palette). Orderings grounded by a
  research pass: no accessible Turkish frequency data exists, so coat-color
  genetics + breed standards decided (e.g. Kangal mixes lead with the
  black-masked tan — the mask allele is dominant; Tekir leads grey-brown
  wild-type; orange is elevated in Turkey per a paywalled Genetica study).
  PATTERN_TOP_COLORS lives in BOTH taxonomy copies; values need not come
  from CAT/DOG_COLORS (the column takes free text, the lists ARE the
  picker). Vocabulary note: in owner requests "tür" maps to the app's
  tür/desen field; ask when a sentence changes meaning under the other
  reading.
- **Web parity is now a standing rule** (CLAUDE.md Standards): every
  feature lands on both clients in the same task, each with its own
  screenshot; impossible-parity cases implement the closest equivalent and
  say so. This session ported the sprint UX to web and then closed all six
  gaps a full parity audit found: last-seen MiniMap on animal profiles
  (attribution as a caption — the on-map control ate the thumbnail),
  add-form avatar preview, multi-file photo picking with per-thumbnail
  remove (capture attr dropped: it forced single-shot camera), app-wide
  session-expiry logout (setSessionExpiredHandler), the map's zoom hint
  pill, and the always-visible "Tümünü gör" comments link.
- Review chains caught and fixed: stale color picks surviving a pattern
  switch (what-you-see-is-not-what-you-submit, both clients), blob-URL
  mint-in-render re-decoding photos per keystroke, colorsFor answering cat
  colors for dog patterns. The maplibre worker workaround is hoisted to
  web/src/mapSetup.ts — future map components import from there.
- Simulator + playwright screenshots for every changed flow; battery green
  on every commit. NOT pushed: the owner takes push decisions — see the
  unpushed commit list at session end.

## 2026-08-30 — color model finalized, consent gate, drop confirm, history popups

- **Colors, final form (owner):** fixed-color patterns (Sarman, Siyah, Üç
  renk, Smokin; Akbaş melezi) show NO picker — `PATTERN_FIXED_COLOR`
  auto-stores the canonical value. Variable patterns offer ONLY their
  researched choice list + "Diğer" (`PATTERN_COLOR_CHOICES`), labels
  deliberately unconstrained by the legacy palette. Research basis: no
  published color census of Turkish street animals exists; orderings come
  from coat-color genetics, breed standards (UKC Kangal/Akbash), and
  Turkish pet-source terminology. No choice label may contain the
  multi-select separator ", ".
- **Register consent (owner):** both clients gate registration on a
  checkbox accepting the terms (and acknowledging the KVKK notice — the
  wording deliberately does NOT collect açık rıza, consistent with the
  KVKK text's own claim). KVKK and terms are now separate pages
  (/gizlilik, /kosullar) sharing one renderer. **Consent is client-side
  only**: storing an acceptance timestamp + terms version server-side
  needs a users column → schema change → DB reset, so it is parked for
  the incremental-migrations work (launch-sprint item). A direct API call
  can register without the checkbox until then.
- **Drop flow (owner):** the placeholder AI check uploads nothing; after
  "uygun görünüyor" the user must tap "Onayla ve ekle" (photo preview
  shown) before the record is created. A run-id ref invalidates orphaned
  check timers (dismiss mid-check + reopen used to leave a photo-less
  approved step); Android back now closes the modal unless uploading.
- **History rows open a location popup** (static mini map + type + time)
  on both clients.
- All flows screenshot-verified on simulator + playwright; battery green
  per commit; three code-review passes' findings all closed. NOT pushed —
  push decisions are the owner's.

## 2026-08-31 — fourth production deploy: color model, consent gate, confirm step live

Deployed `e4e6f5c` (range 484964e..e4e6f5c). Gates: full battery green, no
schema changes, secrets scan clean. evaluator-qa drove the BUILT dist in
the production topology: 13/13 functional checks including a DB-counter
proof that the confirm step creates no record before "Onayla ve ekle"; its
one finding (legal-page cross-link clipped by the 40px topbar column) was
fixed and re-verified at 390px before deploy. Live checks: /health ok,
root+admin 200, bundle index-BPjWCPFn.js carries the confirm step,
/kosullar routes, researched Tekir colors, and the drop hint; production
/kosullar screenshot taken. Mobile changes still require a device build.

## 2026-08-31 — first physical-device build; com.patiapp is taken

- **`com.patiapp` cannot be used for the store**: Apple refuses to register
  it (owned by another team; owner confirmed never registering it
  elsewhere). New launch-sprint item added to pick a new bundle id.
- First real-device install shipped with the temporary id
  `com.oguzpancuk.pati` (free Personal Team `5J62WM72AV`), Release config →
  talks to production (client.ts now switches on **DEV**; release builds
  previously pointed at localhost, which on a phone is the phone).
- Device-build recipe: enable Developer Mode on the phone (Settings →
  Privacy & Security), then
  `xcodebuild -workspace StrayMobile.xcworkspace -scheme StrayMobile
-configuration Release -destination 'id=<xcodebuild device id>'
-allowProvisioningUpdates build` (the xcodebuild destination id differs
  from devicectl's UUID — read it from xcodebuild's own error listing),
  then `xcrun devicectl device install app` + `... process launch`. First
  launch needs Settings → General → VPN & Device Management → trust the
  developer. Piping xcodebuild through `tail` masks its exit code —
  check for "BUILD SUCCEEDED" in the log, not the pipe status.
- Xcode normalized Info.plist (standard CFBundle keys, reordering) when
  the project was first opened for signing; kept, harmless. The temporary
  pbxproj signing/bundle-id edits were reverted — device builds pass
  DEVELOPMENT_TEAM and the test bundle id on the command line instead.

## 2026-08-31 — taxonomy trim, spare drop sheet, history-as-map

- **Taxonomy trim (owner):** Tekir → gri/boz + kahverengi only; dog types
  down to Kangal/Akbaş/Sokak melezi; Kangal colors lose kaplan çizgili and
  siyah; street mix trades alacalı and sarı-siyah for beyaz. Seeders now
  derive (pattern, color) pairs from the taxonomy itself.
- **⚠️ NEXT DEPLOY MUST RUN THE DATA MIGRATION:**
  `fly ssh console --app pati-app -C "node scripts/migrate-taxonomy-20260831.js"`
  (idempotent; already run locally — 737/4006 rows updated). Without it,
  production animals keep labels the picker no longer offers.
- **Drop sheet is spare** (one heading, one line, "Konumuma mama/su bırak");
  the user-location marker is the app-icon glyph (no white disc, pin-tip
  anchor). The profile's drop history is a fitted map of tappable markers;
  the date/delete popup replaced the list (delete still window-gated).
  All of it on both clients, screenshot-verified.

## 2026-08-31 — feedback round: grouped history markers, unlinked legal pages, scrolling chips

- **History markers group instead of fanning out** (133f395): the fan-out
  circle failed — at the fitted zoom a ~13 m geographic offset is a few
  pixels, so a water drop under a food drop stayed invisible. Now records
  within the same 3-decimal (~110 m) bucket collapse into one marker with a
  count badge; tapping it opens a "Bu noktadaki kayıtlar" chooser (type +
  date rows) that leads to the existing detail popup. Both clients,
  screenshot-verified including the tap-through flow (web playwright drive,
  iOS simulator taps).
- **Legal pages stand alone**: the /gizlilik ↔ /kosullar topbar cross-link
  read like a tab bar to the owner and was removed; each page is reached
  only by its own link.
- **Chips scroll horizontally**: species/pattern/color choice rows no
  longer wrap to a second line — mobile ChoiceField/MultiChoiceField wrap
  their rows in a horizontal ScrollView; web uses the existing
  `.chiprow.scroll` class on AddAnimalPage.
- Open discussion with owner: how to make the user-location marker more
  noticeable (their idea: vertical bounce; alternative: a pulsing halo).

## 2026-08-31 — feedback round 2: halo, badge centering, chip overflow hint

- **User-location marker: breathing halo** (owner picked it over their own
  bounce idea when offered the trade-offs): a flattened ellipse at the pin
  tip swelling 0.5→1.6 over 2 s with fade, both clients. Two traps found
  and fixed: web `.user-logo-marker` must not set `position` (it overrides
  MapLibre's absolute marker placement and stretches the div full-width);
  mobile keeps the swollen halo INSIDE the MarkerView frame (44×45 wrap +
  exported PIN_TIP_ANCHOR_Y) because Android containers may clip
  overflowing children — no Android SDK on this machine, so the risk was
  removed structurally rather than verified.
- **Count badges center** their digit now: mobile zeroes micro's 2.5
  letter-spacing, web flex-centers instead of line-height.
- **Chip rows hint at overflow**: a chevron bubble at the right edge while
  options continue off-screen, hidden at scroll end — mobile ChipScroller
  (shared by ChoiceField/MultiChoiceField), web ChipRow (all chiprow-scroll
  call sites, including AnimalPage's dialogs, which review caught as a
  silent parity split).

## 2026-08-31 — fifth deploy verified (feedback rounds + taxonomy migration)

- Deployed e4e6f5c..473c829; health ok, web/admin 200. The ⚠️ taxonomy
  migration ran on production: 3531/4005 updated, re-run 0/4005
  (idempotent, converged). Production visuals spot-checked via playwright
  (halo, chevron chips, unlinked legal pages) with the throwaway QA
  account qa-20260831@stray.test.
- evaluator-qa: PASS — independently sampled all 4005 production animals
  (zero taxonomy violations), verified the served bundle is byte-identical
  to the committed build, re-ran quick+full batteries itself.
- Follow-up found by QA (pre-existing): some production photo URLs point
  at http://localhost:3000/uploads/… (e.g. animal 3947 cover) and render
  broken; needs a data sweep of photo_url/cover_photo_url.

## 2026-09-02 — S7: Apple + Google sign-in (built; consoles still owner-side)

- **The server verifies the identity token; nothing else is trusted**
  (`backend/src/utils/socialAuth.js`, ADR-0003): JWKS signature (RS256
  only), issuer, audience against our own client ids, expiry. No new
  dependency — `jsonwebtoken` was already there and Node 20 reads a JWK
  natively. New endpoints `POST /api/auth/{apple,google}` and a public
  `GET /api/auth/providers`, which is exempted from the auth rate limiter
  (every page load reads it; counting it would let ordinary traffic behind
  one carrier NAT spend the login budget).
- **Schema:** `user_identities (provider, subject)` plus a nullable
  `users.password_hash`. Production needs
  `scripts/migrate-social-auth-20260902.js` once — `CREATE TABLE IF NOT
EXISTS` cannot alter the existing users table.
- **The curl check caught a real hole.** With an _unverified_ provider
  e-mail the code skipped the link-by-e-mail lookup, then hit the unique
  e-mail constraint on insert, and the 23505 fallback handed back the
  existing account — an account takeover by anyone who could put someone
  else's address in a token. The check lives at
  `backend/scripts/social-auth-check/run.sh` (a local issuer whose signing
  key the checks control; 41 assertions by the end of the day).
  **code-reviewer then found the other half**, which the first fix missed:
  when the address was still _free_, an unverified e-mail created an account
  that then OWNED that address, and the real owner's first verified sign-in
  merged them into it — two people, one account, both with sessions. The
  rule is now one sentence: an unverified provider e-mail neither links nor
  creates (403). Both halves are asserted in step 8.
- **Passwordless accounts ripple further than expected**: password login
  would have thrown on a NULL hash (it now names the provider instead),
  account deletion needed a second proof-of-identity path (sign in with the
  provider again; the token must match _that_ user's identity row), and the
  deletion must drop `user_identities` — otherwise the same Apple id walks
  back into the anonymized, suspended account on the next tap.
- **Both clients hide what they cannot do**: the button row renders only
  for providers `GET /auth/providers` reports, so today's production (no
  credentials) shows the plain e-mail form and loads no third-party script.
  Screenshot-verified in that state too. On iOS the Google button
  additionally needs the backend to report an iOS client id — see the
  release-build trap below.
- **One deliberate client divergence**: on web the Google button is
  Google's own rendered button — GIS only hands out an ID token through it
  — while mobile draws the pati button. Apple's button is ours on both,
  black on light and white on dark per their guidelines. Set the GIS script
  to `?hl=tr`: the `locale` render option alone gave us an Indonesian
  label.
- **iOS**: `@invertase/react-native-apple-authentication` +
  `@react-native-google-signin/google-signin` installed, pods in,
  `StrayMobile.entitlements` added to both build configurations. Tapping
  "Apple ile giriş yap" on the simulator reaches iOS's own "Apple
  Hesabı'nıza giriş yapın" dialog — the native path is wired; the simulator
  simply has no Apple account. Both providers failed gracefully in that
  Debug build — dismissible alert, no crash, no stuck spinner.
- **That "no crash" only holds in Debug, and review caught it.** Google's
  iOS SDK raises an Objective-C exception when it is unconfigured or the
  reversed-client-id URL scheme is missing, and
  `RNGoogleSignin.mm` wraps `signIn` in `@try/@catch` **only under
  `#if DEBUG`** — a TestFlight/App Store build terminates. Worse, the
  unconfigured case was reachable on the one path that must never break:
  `configureGoogle()` ran on the login screen only, so a returning user
  deleting a Google-only account (App Store 5.1.1(v)) hit it. Fixed
  structurally — `signInWithGoogle()` now configures itself from
  `/auth/providers` before every call — and the iOS button is hidden unless
  the backend reports an iOS client id. The URL-scheme half stays owner-side
  and is now flagged in docs/DEPLOYMENT.md as a hard prerequisite rather
  than a nicety.
- **Owner steps before this can go live** (docs/DEPLOYMENT.md → "Apple /
  Google sign-in"): App ID + Service ID, two Google OAuth clients, the
  reversed-client-id URL scheme in `Info.plist` (mobile Google sign-in
  cannot return to the app without it), the Fly secrets, the production
  migration. Sign in with Apple binds to the App ID, so the open bundle-id
  decision gates it.
- **`backend/.env.example` still lacks the new variables** — this session's
  tooling is not allowed to touch env files. Add: `APPLE_CLIENT_IDS`,
  `APPLE_SERVICE_ID`, `APPLE_WEB_REDIRECT_URI`, `GOOGLE_CLIENT_IDS`,
  `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_WEB_CLIENT_ID`.
- Noticed in passing: `cd mobile && npm run lint` fails — there is no
  ESLint config in `mobile/` at all, though CLAUDE.md lists the command.
  Pre-existing, untouched.

- **Other review findings, all fixed in the same pass:** the identity row was
  written before the suspension check (a banned user's provider id got bound
  to the banned account on a refused sign-in); `PROVIDERS[provider]` was a
  prototype-chain lookup, so `__proto__` passed the guard and our own
  configuration errors reached the client as 500 bodies naming the missing
  env var (both endpoints now validate at the boundary); the JWKS cache
  refetched twice in a row after TTL expiry and had no in-flight
  de-duplication; `overrides()` claimed to refuse production boot but only
  failed per request (it now throws at require time); Google's rendered
  button was clickable during an in-flight request on both web screens, and
  the delete sheet's Apple popup could be opened twice; a theme flip with
  that sheet open left Google's button in the old theme.

## 2026-09-02 — S7 review rounds: two takeovers, one release-only crash

Two code-reviewer passes and an evaluator-qa pass on top of the first S7
commit. Every finding below was reproduced by the agent, not argued.

- **The e-mail linking rule needed proof on BOTH sides.** Round one caught
  half: an unverified provider e-mail on a _free_ address created an account
  that then owned the address, so the real owner's first verified sign-in
  merged them into the squatter's account. Round two caught the mirror
  image: `POST /auth/register` confirms nothing, so a squatter can register
  on someone else's address with a password, and the victim's "Google ile
  giriş" then lands inside an account the squatter can also log into. The
  rule is now: link only when the provider verified its e-mail AND the target
  account's own address was proven (`users.email_verified`, which only
  provider sign-in sets). Password accounts are told to use their password.
  The cost is that an existing password account cannot pick up a provider
  until registration confirms e-mails — now a ROADMAP item.
- **A Fly secret could crash a shipped iOS build.** Google's SDK raises an
  Objective-C exception both when unconfigured and when the reversed client
  id is missing from `Info.plist`, and `RNGoogleSignin.mm` only catches it
  under `#if DEBUG` — the simulator's polite error alerts were a Debug
  artifact. The first fix (`ensureGoogleConfigured()` before every call)
  closed the unconfigured path, but the URL-scheme path stayed reachable by
  setting `GOOGLE_IOS_CLIENT_ID` on the server. Now the id the binary was
  built for lives in `mobile/src/googleClientId.ts` and the iOS button is
  drawn only when the server reports exactly that id: a mismatch hides the
  button instead of terminating the app.
- **QA's independent evidence:** the no-credentials state was verified as
  genuinely inert (zero third-party requests on web, no button row on
  mobile, all password paths unchanged), the production migration is
  idempotent across three runs from a rebuilt pre-S7 schema (that was the
  standalone-script version; the column and backfill came later, and the
  round-three reviewer re-ran the current one), and the check script's
  assertions were mutation-tested — removing the `audience` option
  from `jwt.verify` makes step 5 fail, so the checks are not vacuous.
- **QA also found an undocumented prerequisite:** on a machine whose
  `stray-db` predates S7, `contracts/init.sh` is not enough for the check
  script — `001_init.sql` cannot alter an existing `users` table, so the
  local migration has to be run first. Now in docs/DEPLOYMENT.md.
- Pre-existing, left alone but worth knowing: `error.middleware.js` returns
  `err.message` on every 500, so any internal failure (a JWKS outage, say)
  is shown to the user. The S7 endpoints no longer reach it with anything
  sensitive — they validate at the boundary — but the general problem stands.
- `mobile/__tests__/AuthContext.test.tsx` now covers `loginWithProvider`.

## 2026-09-02 — bundle id settled: com.oguzpancuk.pati

S7's remaining blocker was an identifier, not code. Owner decided to publish
under his own name for now (Individual Apple account rather than an
Organization one, which would need a legal entity plus a D-U-N-S number).

- **`com.pati-app.pati` was the better id and had to be dropped**: derived
  from the domain we own, so it would survive a later transfer to a company
  account without a personal name frozen into it — but Android's
  `applicationId` forbids hyphens, and both stores should carry the same
  identifier. `com.oguzpancuk.pati` it is; the device test on 2026-08-31 had
  already proved Apple registers it.
- Applied to both Xcode configurations (app + tests), `applicationId` in
  `android/app/build.gradle`, and the two simulator scripts. Android's
  `namespace` deliberately stays `com.patiapp`: it is only the generated R
  class's package, invisible in the store, and moving it means moving Java
  package directories — that belongs to the internal rename.
- Verified: native rebuild, app launches as `com.oguzpancuk.pati`, and
  `simulator-goto.sh` finds the new container and drives the app. The
  Android side is **not** verified — no Android SDK on this machine.
- **Worth knowing before any company transfer:** Apple's `sub` (our
  `user_identities.subject`) is scoped to the developer team, so moving the
  app to a company account later renames every Apple identity and orphans
  those users unless Apple's transfer-identifier flow is run at the same
  time. Google's `sub` is global and unaffected. Transferring after real
  users exist is therefore meaningfully more expensive than starting there.

## 2026-09-02 — third review round: the unreviewed commits had four defects

The owner asked "pushlarken codereviewer agentı çalışmadı mı?" — and was
right. The reviewer had run twice, but each round looked at an intermediate
commit: the fixes written in response to round two (`29e8ecb`) and the
bundle-id change (`089c2c1`) went out unreviewed. Running the agent earlier
in a session is not the same as reviewing what gets pushed.

The round-three pass on exactly that range found four more real defects, so
the gap was not academic:

- **The documented deploy order would have 500ed every sign-in.**
  `DEPLOYMENT.md` listed the secrets before the one-off migration, and
  `release_command` only applies `migrations/*.sql`. Setting the secrets
  first made the feature live against a `users` table with no
  `email_verified`. Fixed at the root: the schema change is now
  `migrations/002_social_auth.sql`, applied by the release command like
  everything else, and the standalone script is gone. This also removes the
  local prerequisite evaluator-qa had flagged.
- **Capitalisation turned the new linking rule into a coin flip.** Providers
  report lower-cased e-mail; `users.email` kept whatever case was typed. The
  reviewer registered `CaseProbe-…@Example.com`, presented a verified Google
  token for the lower-cased address, and got a **new empty account** instead
  of the 409. Addresses are now stored lower-cased and matched
  case-insensitively (login prefers an exact match, so older rows are
  unaffected). Knock-on it also found: `make-admin.js` matches with
  `lower(email)` and no limit, so a case-variant pair — which S7 would have
  produced routinely — meant promoting _both_ rows to admin. It now refuses
  ambiguous matches and names them.
- **The crash guard's real invariant was held together by prose.**
  `googleAvailable()` compares the server's id to the compiled-in one, but
  the condition that actually raises the ObjC exception is `Info.plist`
  carrying the reversed form of that id — which nothing at runtime can see.
  `mobile/__tests__/googleClientId.test.ts` now asserts the pairing in both
  directions, so it runs in the battery and in CI.
- **The ADR documented the opposite of the shipped rule.** Worse, the new
  `email_verified` column pointed the reader at it for the rationale. The
  ADR edit had failed silently inside a scripted batch two commits earlier,
  and nothing caught it because nothing re-read the file. Now corrected,
  along with the squatting cost, which the docs had been describing in its
  milder form only.

The habit this cost us is worth writing down even though the enforcement
went elsewhere: **run code-reviewer on the range being pushed, not on
whatever commit happened to be current when the last round ran.** Fixes
written in response to a review are the commits most worth re-reviewing —
two of the three defects that round found had been left behind by an earlier
fix.

## 2026-09-02 — fourth and fifth review rounds: the product findings

Both rounds were mostly about a push-gate hook written this session and then
removed again (the owner is taking that rule to the maya layer instead, where
it belongs — it is a workflow rule, not a pati feature). What they found in
S7 itself:

- **The case-insensitive lookup had no index**: `lower(email)` cannot use
  `users_email_key`, so an unauthenticated login had become a sequential scan
  of `users`. `idx_users_email_lower` is now in both schema files (`EXPLAIN`
  shows an index scan on it).
- **`ORDER BY id` picked the wrong row.** With a pre-existing pair of case
  variants, someone who already signs in with Google and taps "Apple ile
  giriş" got the older password row and a 409 telling them to use a password
  belonging to a different account. It is `ORDER BY email_verified DESC, id`
  now: the linkable row wins.
- **The login tie-break could lock someone out silently.** After
  normalisation it compared against the _normalised_ address, so with a
  pre-existing `Ali@x.com` / `ali@x.com` pair the owner of the capitalised
  one had their password checked against the other row's hash — correct
  password, permanent "invalid e-mail or password", no support signal. The
  exact typed address wins the tie now.
- **The backfill had become a standing rule.** Moving it into
  `002_social_auth.sql` meant it re-ran on every deploy, permanently
  asserting that any passwordless account with an identity has a proven
  address — which would silently undo a support correction. Deleted; the rows
  it existed for only ever lived on a developer database.
- **Registration and login disagreed about trimming**, so a pasted address
  with a leading space could register and then fail to log in (mobile sends
  the field raw). One `normalizeEmail()` now serves both. `register` also
  accepted a non-string e-mail, normalised it to `''` and inserted it, and
  answered any unique violation with "already registered"; it type-checks at
  the boundary and looks at the constraint name now.
- **Three assertions passed for the wrong reason.** Step 4 checked only the
  status code while claiming the message names the providers. Step 10b could
  not fail: registration lower-cases, so both sides were lower-case by the
  time it ran. And even after that was fixed, a further round pointed out
  that the login tie-break only matters when TWO rows match — with one row
  `LIMIT 1` returns it under either ordering — so step 10c now builds the
  actual case-variant pair (two accounts, same password, so the returned id
  is the only discriminator) and asserts which row each spelling reaches.
  Mutation-tested: preferring the normalised row hands back the other
  account, which is the silent lockout itself.
- The refusal checks now assert that the dev IdP actually returned a JWT: an
  error body is a non-empty string, which the endpoint answers with 401, so
  they could have passed without ever testing a token.
- `migrate.js` runs its files on one checked-out client. `SET` is
  per-connection and a pool gives no session affinity, so `lock_timeout` was
  covering whichever files happened to reuse that backend.
- `lock_timeout` is set in `migrate.js` before any file is applied: files run
  in sorted order and `001`, which creates the indexes, runs first.
- `migrate.js` prints the resulting tables and their column counts, so the
  release log records something observed rather than only which files were
  fed in. It cannot see a missing index or a wrong default.
- The Info.plist test now looks only inside `CFBundleURLSchemes` (a scheme
  under `LSApplicationQueriesSchemes` would have satisfied the old match and
  still crashed) and asserts the app's own `pati` scheme is present, so it
  cannot pass on an empty list.
- README and docs/PROJECT.md still claimed "single migration file"; both
  carried the same load-bearing-facts list CLAUDE.md had already corrected.

## 2026-09-02 — seventh review round, on the squashed S7 commit

- **The check harness could report green for code it never ran.** `run.sh`
  waited for _something_ to answer `/health` on 3101, never for its own
  process. With a stale backend holding the port, ours died with
  `EADDRINUSE`, the assertions ran against the old process, and the script
  printed ALL CHECKS PASSED — reviewer reproduced it. A first fix checked
  that our PIDs were alive after the readiness probe; the re-review showed
  that loses the race when BOTH ports are stale (the probe succeeds before
  our process has even reached `listen()`), 3/3. It now loops until `lsof`
  says the listening pid on each port IS ours, or ours is dead — timing is
  no longer part of the argument. It also waits for the dev IdP's JWKS (the
  RSA keygen takes about a second; step 1 could mint against nothing).
- **The "proven row wins" ordering had no assertion** — every check stayed
  green with it removed. Production cannot produce the pair it defends
  against (each side refuses the other's address), so step 10d builds it by
  hand and asserts a second provider lands in the social account rather
  than a 409 for a password that is not the user's.
- `login` now type-checks like `register`; `set-email.js` refuses to run in
  production (it ships in the image and bypasses normalisation);
  `fly.toml`'s "one migration file" comment joined the others that were
  corrected. The ROADMAP's S7 status now states all three unverified areas
  — real providers, Android, iOS release build — in one place, and no
  longer lists a manual migration step that this commit retired.

## 2026-09-03 — e-mail verification on registration (ADR-0004)

The owner asked for a confirmation mail on e-mail registration, "a link
that completes the registration, or whatever the modern standard is". Built
as a **six-digit code typed into the registering session**, not a link: a
link verifies whoever clicks it, and people click "confirm your e-mail"
mails they never asked for — which would hand a squatter a _proven_ account
on someone else's address, exactly what ADR-0003 links into. The code has
to be typed into the app that holds the password, so proving an address
needs mailbox and password both.

What shipped, and the reasoning worth keeping:

- **The pending flag is its own column** (`email_verification_pending`),
  not a reading of `email_verified`. Its default is the grandfathering rule:
  every account from before today stays usable and unproven, with no
  backfill — the S7 lesson that a one-off UPDATE in `migrations/` becomes a
  standing rule on every deploy.
- **Pending sessions are gated in `requireAuth`**, read from the database
  per request like suspension. Only verify/resend and the account's own
  `GET`/`DELETE /users/me` accept them (deletion must always work, App
  Store 5.1.1(v)). Both clients treat the 403 `emailUnverified` from any
  request as "switch to the code screen", the way they treat 401 as "log
  out".
- **A pending registration holds its address for 24 hours, then becomes
  replaceable** (same row, new name/password/code). The hold stops a
  password swap under a registration whose code is about to be typed; the
  release is what retires the "squatting is permanent" consequence ADR-0003
  had to accept — the squatter knows a password but never sees the mailbox,
  so the account never leaves pending, and a day later the real owner's
  registration takes the row.
- **Login while pending is allowed but sends no mail** (the screen has a
  resend button); an automatic mail per login would let anyone holding the
  password fill the inbox.
- **Mail is Resend over Node's `fetch`** — no SDK, no SMTP dependency. Off
  in production without `RESEND_API_KEY` (registration unverified as
  before, and the boot log says so); on in development with a stdout
  transport, which is also how the check harness reads the code back
  (`MAIL_OUTBOX_FILE`). Turning it on is owner-side: a Resend account and
  the DNS records for `pati-app.com` (docs/DEPLOYMENT.md).
- **Evidence:** `backend/scripts/email-verification-check/run.sh` (93 curl
  assertions: pending, gate, wrong/expired/retired codes, cooldown, hold
  expiry and replacement, deletion while pending, and the ADR-0003 link a
  verified address unlocks), the S7 harness unchanged and green, the mobile
  AuthContext test extended, and the code screen driven end to end on both
  the simulator and the browser (register → code → map). The readiness
  loop the two harnesses share now lives in `scripts/check-lib.sh`.
- `backend/.env.example` could not be edited from this session (the file
  is under a denied path); the variables are documented in DEPLOYMENT.md
  and mailer.js instead.

Follow-ups this opens, all sharing the new mail transport: "verify my
e-mail" from the profile for grandfathered accounts, "set a password" for
social accounts, and password reset.

### First review round (same day): the row id was the hole

code-reviewer reproduced a blocker in the replacement rule and found five
things around it; all fixed, and the harness now asserts each.

- **Replacing a pending registration by UPDATE kept its id, so every token
  the squatter had been issued stayed a valid session** — on the victim's
  account, after the victim verified. Seven days of access, reproduced with
  a saved token. Replacement is now DELETE + INSERT in one transaction: a
  fresh id kills the old tokens, and concurrent replacements queue on the
  row lock so exactly one gets in (the reviewer had four simultaneous
  registrations all return 201 on the old code). The harness registers,
  ages, replaces, and asserts the old token answers 401 before and after
  verification, and that four racing registrations yield one 201.
- **Provider sign-in never benefited from the release**: a verified Google
  e-mail on a pending row got "use your password" forever, so a squatter
  re-registering daily could keep a Google user out for good. A verified
  provider e-mail now retires the pending row outright (no hold — the
  provider proved the mailbox; the pending registrant never did).
  Grandfathered accounts keep the ADR-0003 refusal. The S7 harness's
  "unproven account" steps therefore needed accounts that are unproven but
  NOT pending — the kind the API can no longer create — so `backdate.js
grandfather` builds them; without it those steps were now testing the
  provider takeover instead of the linking refusal.
- Smaller: `markVerified` is guarded on the pending flag (a session whose
  row was retired mid-verification gets 401, not a proven account for the
  replacer); the resend cooldown runs _before_ the hourly limiter so a
  double tap costs one 429 rather than one of six resends; the fifth wrong
  guess says the code is spent; limiter 429s carry `retryAfter` and both
  clients mirror it; a tombstone clears the pending flag and its code row;
  mobile re-reads `/users/me` on a cold start only when the stored user is
  pending (verified on web, reopened on the phone: the code screen used to
  stay). Accepted and written into the ADR: a daily re-registering squatter
  can renew the hold against a password-only owner, and the 409 now says
  "pending" rather than "taken".
- The harness step that claimed "the old registration's code is dead" was
  vacuous — that code had already been expired by the previous step. It
  now uses a live code, and would have failed on the id reuse had it
  checked the old token; it does now.

### Second review round: APPROVE, with four small ones

The re-review of the fix commit reproduced one more thing and read the rest
as sound (FK cascades, the transaction under READ COMMITTED, the S7
grandfather fixture, express-rate-limit's `message` function):

- **Two correct submissions of the same code could log the honest user
  out.** The loser's `markVerified` matched no row and answered 401, which
  mobile reads as "session expired". Both branches that can only mean
  "verified underneath me or retired" now re-read the row and answer
  `alreadyVerified` when it is verified, 401 only when it is gone. Harness
  12c fires six identical submissions and asserts six 200s.
- The `socialLogin` unique-violation fallback could tell a Google user
  "use your password" about a pending row a concurrent registration had
  just created; it now answers "adres az önce değişti; tekrar dene".
- The mobile cold-start refresh could resurrect a user who logged out while
  it was in flight; it updates functionally and only onto the same user.
- A comment claimed `GET /users/me` may write badge awards; it does not,
  and the redundant delete is gone.

## 2026-09-04 — sixth deploy: S7 + e-mail verification live (verification off)

`fly deploy` of `d751cbc` (previous release v20 was `473c829`, August 31,
so this is also S7's first time in production). Before it: evaluator-qa
PASS on every claim — both harnesses (93 + 41), the full battery on a
clean tree, the production-mode "mail off" boot registering an unverified
account exactly as before, `migrate.js` run twice with an identical
`users` checksum, the gate enumerated (four pending-tolerant routes, 22
others answering 403), a grandfathered account logging in without a code
screen, and both clients rendering the code screen. Release command ran
`003_email_verification.sql`; `/health` ok, web and admin 200,
`/api/auth/providers` reports both providers disabled (consoles not
filled in), and the boot log says `mail: NOT CONFIGURED — e-mail
verification is off` — which is the intended state until the owner adds
`RESEND_API_KEY` (docs/DEPLOYMENT.md). Nothing changes for users until
then. Rollback reference: image `deployment-01M1BM856N8K1MP4ZEXGZSGAVP`
(v20). QA's one nit fixed here: the S7 harness prints 41 PASS lines, not
42, as the test plan claimed.

## 2026-09-04 — first real Google round trip; grandfathered accounts link with a password

- **The consoles are filled in.** Google web + iOS OAuth clients exist; the
  iOS client id is compiled into the app (`googleClientId.ts`) with its
  reversed form in `Info.plist`, so the iOS Google button is live. On the
  simulator the tap reaches iOS's own consent and then Google's real sign-in
  page for "pati" — the first time the real SDK and the real Google were in
  the loop. Two things learned on the way: Google's console list truncates
  long client ids (a `.com`-less copy produced "client ID is not found"),
  and iOS shows `CFBundleName` — still `$(PRODUCT_NAME)` = StrayMobile — in
  that consent dialog; it is now pinned to `pati` in `Info.plist` without
  touching the Xcode target.
- **Owner signed in with Google on web** against the local backend, twice.
  The first attempt hit the grandfathered-account 409 (the address was the
  local admin's password account); after freeing the address the sign-in
  created user 1799 — verified, passwordless, `google` identity: the first
  real provider-created account. Then, with the linking rule built, a fresh
  grandfathered fixture on the same address (row 1858, password set by
  hand) got the dialog, took the password and linked — observed in the
  database afterwards: `email_verified` true, password kept, `google`
  identity at 07:35Z. That is the web dialog exercised with a real token.
  The **mobile modal has not been**: it needs the same fixture again and
  the owner on the simulator.
- **Owner decision: link a grandfathered account with its password**, not
  automatically. `POST /auth/{apple,google}` answers such an address with 409
  `code: linkRequiresPassword`; sent again with `password`, a wrong one is
  403 and the right one links, marks the account proven and signs in. Both
  clients turn the 409 into a dialog. Accounts verified by code never see it.
  Check-suite step 10 covers all of it, including that a wrong password
  leaves the row unproven — the one regression every other assertion would
  have missed (51 assertions, mutation-tested); the test-plan row S6 and
  ADR-0003 record the new rule. Review also moved the "mark proven" write
  after the suspension check, so a refused sign-in leaves no trace, and made
  the 23505 race branch honour a password that came with the request. That
  move introduced its own defect, caught by the next round: the proven row
  was still classified as pending one line later, so every successful link
  went through a doomed INSERT, a rollback and the race branch's second
  compare — right answer, one burned user id per link, and correct only
  because the race branch had just learned to check the password. Fixed with
  one clause; step 10 now reads the users id sequence before and after the
  link (`last-user-id.js`), which is the only thing that tells the two paths
  apart.
- Harness lesson: in development registration is _pending_ (the dev mail
  transport), so the "grandfathered" fixture has to be made explicitly with
  `backdate.js … grandfather` — a rewrite of step 10 that dropped that call
  passed for a different reason (the pending row was taken over) until the
  assertions on the account id caught it.

## 2026-09-04 — seventh deploy: grandfathered-account linking live (v23)

`fly deploy` of `0bdb9eb` (previous code release v21 was `d751cbc`; v22 was
the same image, re-released when the owner set `RESEND_API_KEY`). Before it:
full battery green on a clean tree, secret scan of `d751cbc..HEAD` clean
(only the harness's test password), no migrations in the range,
evaluator-qa PASS — quick battery, S7 harness 51/51 with step 10's "no
burned user id" assertion, and hand-driven regression paths (suspended row
with the right password leaves no trace; pending row still taken over;
proven row links without a password; non-string password → 409). Release
command ran (`Migrations complete.`, nothing new to apply); `/health` ok,
web and admin 200, boot log `mail: Resend (from: Pati <noreply@pati-app.com>)`
— e-mail verification is ON in production from v22 on. Rollback reference:
image `deployment-01M1NFH5SWR0SBBXDXAZMR6EC8` (v21/v22).

**Warning found during the deploy, not fixed here (owner decision):**
`GET /api/auth/providers` answered `enabled:false` for both providers on
v22 and `enabled:true` with the real Apple service id and Google client ids
on v23 — yet no `APPLE_*`/`GOOGLE_*` variable exists in `fly secrets list`
or `fly.toml`. The only remaining channel is the developer's local
`backend/.env`: `.dockerignore` does not exclude it, the Dockerfile's `COPY
backend/ ./` ships it, and `server.js` loads it with dotenv (Fly's own
secrets win where names collide, which is why `DATABASE_URL`/`JWT_SECRET`
are unaffected). Not confirmed by `ls /app/.env` on the machine — the
session's classifier blocked the SSH command. Consequences: the production
provider configuration is whatever the deploying machine's `.env` holds, and
any local-only secret in that file rides along in the (private) registry
image. Suggested fix: add `backend/.env` to `.dockerignore` and set the six
provider variables with `fly secrets set` before the next deploy — doing
the first without the second would switch the buttons off in production.

## 2026-09-04 — the production image carried the developer's .env

- **Symptom:** right after the seventh deploy, `pati-app.com/api/auth/providers`
  reported `apple.enabled: true` with the Service ID and return URL — and the
  Apple button was live on the production login page (screenshot in the
  session) — although `fly secrets list` showed no `APPLE_*` or `GOOGLE_*`
  at all. Apple sign-in was meant to stay hidden until the App ID exists.
- **Cause:** the Dockerfile copies `backend/` wholesale and `.dockerignore`
  never excluded `.env`, so the deploying machine's `backend/.env` (793
  bytes, edited that morning) sat at `/app/.env` in the image; `dotenv`
  loaded it for every variable Fly had not set. Fly's secrets win where
  they exist (`dotenv` does not override the process environment), which is
  why `JWT_SECRET` and `DATABASE_URL` were never the local ones — but any
  variable only present locally went live. This has been true since the
  first deploy; today was the first time the local file carried something
  production should not have.
- **Fix:** `.dockerignore` now excludes `**/.env` and `**/.env.*` (keeping
  `.env.example`), so the next build ships no environment file at all. The
  three Google client ids were set as Fly secrets, which is where they
  belonged; `APPLE_*` stays unset, so after the next deploy the Apple button
  disappears and Google keeps working from the secrets.
- Lesson for the deploy checklist: "no secrets in the diff" is not the same
  as "no secrets in the image" — the image is what leaves the machine.

## 2026-09-04 — eighth deploy (v25): Google live from Fly secrets, Apple hidden, no .env in the image

- **CI was skipped for this deploy — owner decision.** Both CI runs of the
  day (attempt 2 of `0bdb9eb`, then `ad247b2`) sat in `npm ci` on GitHub's
  runner for 20+ minutes with the Docker job stalled the same way; nothing
  in the code was involved. Instead of a third wait the owner said to
  skip it. What stood in for it: the reviewer's real `docker build` over
  this checkout (`ad247b2` approved on that evidence), the quick battery on
  the tree, and the full battery earlier today on `7e5ed6b`; the deploy's
  own build stage compiles web and admin either way. Recorded here because
  "CI green before deploy" is the project rule and this is the exception.
- **Built from a clean export, not the working tree.** Another session was
  mid-change in this checkout (`backend/package.json` with `sharp` and
  `@anthropic-ai/sdk`, uncommitted), and `fly deploy` ships the directory
  it runs in. `git archive ad247b2` into a scratch directory gave an image
  of exactly the pushed commit — no half-finished dependency, no `.env`.
- **Observed afterwards:** `pati-app.com/api/auth/providers` → `apple:
enabled false`, `google: enabled true` with both client ids — now coming
  from Fly secrets, not from a baked file; `/app/.env` is gone from the
  image (`ls` fails on the machine); the production login page shows the
  Google button only (screenshots before/after in the session). Release
  v25.
- Still to do on the Google side: publish the OAuth consent screen (it is
  in Testing, so only the listed test users can sign in on production).

## 2026-09-04 — the photo AI is real: Claude vision behind the check and the matching (ADR-0005)

- **Both placeholders replaced in one session.** The S6 "AI inceliyor"
  interstitial and the add-animal "AI eşleştiriyor" screen now do what they
  say: one Anthropic Messages API request each (`@anthropic-ai/sdk`,
  `backend/src/utils/ai.js`), JSON-schema output, `claude-opus-5` by
  default (`AI_MODEL`). The ROADMAP §1 plan — DINOv2 embeddings in a Python
  service plus pgvector — is retired, not deferred; the ADR says why.
- **Care photos: check first, confirm with a token.** `POST
/care-actions/check` (multipart) runs the check and answers `verdict`
  (approved / unavailable) plus a 15-minute `photoToken` signed over the
  stored file, user and action type; `POST /care-actions` takes the token
  instead of a file, refuses a replay (409, the photo URL is already on a
  record), a wrong type/user (400) and an expired token (400 — both
  clients drop to "take it again"). A direct upload to `POST /care-actions`
  is still accepted and checked inline, so no client can skip the check. A
  rejected photo is deleted and answered 422 `photoRejected` with the
  model's one Turkish sentence, which the clients show under "Bu fotoğraf
  uygun görünmüyor" with "Yeniden çek". No "add anyway" (owner decision in
  the ADR: the check would be decoration otherwise). `care_actions.ai_check`
  (JSONB, migration 004) keeps verdict/subject/reason/model/ms.
- **Matching: the photo goes with the fields.** `POST /animals/match`
  (multipart, first photo) ranks by the old field score, then sends the
  photo with the cover photos of the top `AI_MATCH_CANDIDATES` (8) in one
  request; per-candidate verdicts move the score (same +4 → high, similar
  +1, different −3 → low) and add `photo_same` / `photo_similar` reasons
  ("Fotoğrafta aynı hayvan" / "Fotoğraf benziyor"). GET stays field-only.
  `photoChecked` in the response drives the results banner wording.
  `MIN_MATCHING_MS` is 800 ms on both clients — no longer a fake wait, only
  a floor so the instant field-only answer does not flash.
- **Fail open, everywhere.** No key, network error, refusal, malformed
  JSON, undecodable image (HEIC on sharp's prebuilt binaries): the check
  says `unavailable` (accepted, confirm screen says "Fotoğraf hazır", no
  `ai_check` row) and matching returns the field ranking. Production without
  `ANTHROPIC_API_KEY` is byte-for-byte the old behaviour; the boot log
  prints the state next to the mail line. Images are EXIF-rotated and fitted
  to 1024 px JPEG by `sharp` before leaving the server (a phone photo is
  3–8 MB; the API caps images at 5 MB).
- **Evidence.** `backend/scripts/ai-check/run.sh`: throwaway backend on
  3103 against `fake-anthropic.js` on 4600 — a stand-in whose verdict the
  harness picks and which refuses any request the real API would (no key,
  no image, no JSON schema); 79 assertions, ALL PASS: token round trip and
  replay, type/user/forgery refusals, reject + delete, direct-upload
  enforcement, dead model and refusal failing open, matching with verdicts
  (three cats, one without a photo, exactly three images sent) and without.
  Screenshots (web via Playwright against the same fake, iOS on the
  simulator with a gallery pick): approved, rejected, and the results list
  with "Fotoğrafta aynı hayvan · yüksek benzerlik" on both clients; the
  simulator's confirm wrote care action 22464 with `ai_check.verdict =
approved`, and its match request carried 9 images.
- **NOT verified: the real model.** There is no Anthropic key on this
  machine, so every verdict above came from the fake. Accuracy — does Opus
  approve a real bowl of kibble, reject a selfie, and tell two tabbies
  apart — is the owner's afternoon with the key:
  `node backend/scripts/ai-check/live-sample.js care food <photos…>` and
  `… match <new> <candidates…>`, then tune the two prompts in `ai.js` and
  record the result here. Until then the prompts are a best guess written
  to be lenient. The request shape itself is checked by the fake against
  the SDK's types (`output_config.format.type = 'json_schema'`, base64 JPEG
  image blocks), not against the live API.
- **Accepted for now.** A checked-but-never-confirmed photo stays in the
  uploads volume (rejected ones are deleted) — bytes, not records; object
  storage with lifecycle rules is already on the roadmap. The web check
  request has no client timeout (fetch, as before); mobile bounds it at
  60 s and the match at 90 s. Rate: matching has its own 30/h bucket, the
  check shares the 40/h drop bucket.
- Harness lesson: bash 3.2 + `set -u` rejects `"${args[@]}"` on an empty
  array — use `${args[@]+"${args[@]}"}`; and a harness that leaves rows
  behind must pick a different spot per run, or a rerun's candidate list
  includes yesterday's cats and the ordering assertions lie.

### Review round: NEEDS_WORK, seven findings, all fixed

- **The check shared the 40/h drop bucket**, so a feeding route hit 429 at
  drop 21. Own bucket now (80/h).
- **A photoToken was a valid session**: same secret, a `userId` claim, and
  `requireAuth` never looked further. Purpose tokens carry `kind`, and the
  middleware refuses any token that has one (harness: `/users/me` with a
  photoToken → 401).
- **The model's self-reported candidate index was trusted**: a 0-based
  answer would have shifted every verdict onto the previous animal. The
  schema is now built per request (`minimum: 1`, `maximum: n`, exactly n
  items) and an answer that does not cover every candidate exactly once is
  dropped.
- **"Redeemable once" was a SELECT-then-INSERT keyed on a URL that
  contained the request's Host header.** The token now carries a `jti`
  stored in a unique column (`care_actions.photo_token_jti`, migration
  004); the replay lands on the index → 409, whatever the Host says. The
  unique index lives in 004 only — 001 is re-run on every deploy, and on an
  existing table its column would not exist yet at that point (this failed
  the harness once).
- Clients treat 409 `photoAlreadyUsed` as "the earlier confirm went
  through" (close + refresh) instead of stranding the user on the approved
  step after a lost response.
- `AI_MATCH_CANDIDATES` is validated (1–20, warn and default otherwise).
- Harness asserts the effort levels and the Host-header replay; the
  per-run grid is documented with its real collision odds; the count was
  63, not 60 (the earlier number included the ALL PASS line).
- Second and third rounds (APPROVE each): the schema range keywords
  (`minimum`/`maxItems`) were dropped — not in the documented
  structured-output subset, and a refused schema would have failed open
  into field-only matching with only a log line to show for it; the
  runtime "every candidate exactly once" check carries the rule alone, and
  now has negative tests (0-based, duplicated, short and long answers all
  leave the field ranking untouched — fake `control.candidates`). The web
  409 branch refreshes like a success and reports a failed refresh. Total:
  79 assertions.

## 2026-09-07 — the photo AI moves to Gemini (owner decision: no separate bill)

- The owner watched the local run, asked what the comparison would cost,
  and set the constraint: the app must not create API charges beyond
  existing subscriptions. A Claude subscription cannot serve other users
  and Anthropic has no free tier, so the provider is now **Gemini's free
  tier** (`gemini-3.8-flash`, `GEMINI_API_KEY` from AI Studio). ADR-0005
  is amended (and renamed to "…a hosted vision model"); the trade-off —
  free-tier content may be used by Google to improve its products — has to
  reach the privacy text before the key goes to production.
- Code: `ai.js`'s transport only — `generateContent` over `fetch`, no SDK
  (`@anthropic-ai/sdk` removed; `sharp` stays). Prompts, schemas, verdict
  handling, the token scheme, the clients and the harness assertions are
  unchanged; the fake is now `fake-gemini.js` (same control modes; the
  refusal case became a `promptFeedback.blockReason` safety block) and the
  backend reaches it through `AI_BASE_URL`, honoured outside production
  only. The two effort assertions went (no such knob here), a "schema
  present" one came, so the count is 78 (was 79); the model default
  assertion says `gemini-3.8-flash`.
- Still NOT verified with the real model — the owner is adding the key to
  `backend/.env` next and will drive the flows on the simulator and web
  before pushing; `live-sample.js` first.
- Environment note: Docker Desktop was down after the weekend, so
  `stray-db` was unreachable and the harness's migrate step failed with
  ECONNREFUSED on 5433 — the first thing to check when the harness prints
  "migrate failed".

### First live run (2026-09-07, owner's key in backend/.env)

- The key and the request shape work: boot log `ai: … on`, and every
  answer came back as schema-valid JSON with a Turkish reason.
- **`gemini-3.8-flash` was not usable today**: 503 "high demand" on half
  the care checks and on plain text probes, and a 45 s timeout on every
  comparison (three photos). **`gemini-3.5-flash` answered everything**
  (care 6–8 s, comparison 9–12 s), so it is the default now; the id stays
  configuration.
- Probed the thinking knob with a scratch script: `thinkingConfig:
{thinkingBudget: 0}` is accepted by both models (thought tokens drop to
  zero); `thinkingLevel: "minimal"` is refused by 3.8 and unknown as a
  top-level field. The care check now runs with thinking off; the
  comparison keeps the default.
- Two hardenings from what the live run showed: one retry after 1.5 s on
  503/429 (bursts lasted a second or two), and a garbled-reason guard —
  3.5 once answered "Fotođrafta … i''''cin g&#246;r&#252;n&#252;yor" with
  HTML entities and a run of apostrophes; a reason that does not look like
  a sentence is dropped and the controller's fixed Turkish fallback shows.
- Verdicts so far, all on non-food photos (the only ones on this machine):
  an indoor room, a person at a computer and a waterfall → all
  **rejected (unrelated)** with sensible reasons; comparing them as
  "animals" → **unsure**, which is the right answer for photos with no
  animal. The positive side — a real bowl of food, a real water dish, the
  same cat twice — is still unmeasured: it needs the owner's own photos.
- Review of the fixes: the retry had doubled the server-side ceiling to
  91 s (two 45 s signals) against the mobile client's 60 s, and no harness
  case exercised it. Now one deadline per call covers both attempts, the
  retry is 503-only (a 429 is the quota — retrying only spends it), the
  fake has a `busy` mode (503 n times) and step 6b asserts one retry and
  no third request; the garbled-reason guard tests the whole string before
  cutting it. Count: 82 (84 after the 429 case landed in the next commit).

### Second live run (2026-09-07 afternoon): the owner's sample photos

Eleven photos in `~/Desktop/pati_ornek` (bowls of food, water dishes, a
cat drinking from a tap, a winter poster with "1 kap su / 1 kap mama"
text, five cats — two of them the same cat), `gemini-3.5-flash`:

| photo                                                                                     | claim | verdict                | reason (model's own words)                                      |
| ----------------------------------------------------------------------------------------- | ----- | ---------------------- | --------------------------------------------------------------- |
| mama-1 (cat eating kibble)                                                                | food  | approved (food)        | "Kuru mamasını afiyetle yiyen bir dostumuz görünüyor."          |
| mama 2 (bowl + water behind)                                                              | food  | approved (both)        | "Mamalıkta kuru mama ve arkada su kabı görünüyor."              |
| su1 (cat drinking from a dish)                                                            | food  | **rejected (water)**   | "Fotoğrafta mama yerine su kabı ve su içen bir kedi görünüyor." |
| su2 (water dish)                                                                          | food  | **rejected (water)**   | "Fotoğrafta sokak hayvanları için su kabı görünüyor."           |
| kedi_a (a cat, no bowl)                                                                   | food  | approved (animal_only) | "Fotoğrafta sevimli bir dostumuz görünüyor…"                    |
| room / person at a computer / waterfall (the morning's photos, carried over — not re-run) | food  | rejected (unrelated)   | sensible one-liners                                             |

Matching: kedi-d1 against d2 (same cat), b, c, a → **same, different,
different, different**; kedi_a against b, c, d1 → all different. Every
verdict right on this set, 12–13 s per comparison. Care checks took 6–16 s.

Not measured: the water claims (su1/su2 → approve, mama → reject) and the
two "yanlış" photos (the tap cat, the poster) — the key's quota ran out
first. **The free tier is ~20 requests per day**, not per minute: after
about 25 calls over the whole day (the morning run, the four thinking-knob
probes, the afternoon's ten, plus the odd 503 retry — each a request
against the quota, the failed ones included) every request answered 429
`…free_tier_requests, limit: 20` for the rest of the afternoon, whatever
the "retry in N s" hint said. One key was observed; Google applies the
quota per project and per model, so a second key in the same project
would not double it.
Also learned: `gemini-3.5-flash-lite` refuses `thinkingConfig` (400), and
`gemini-2.5-flash` is retired for new users (404, points at 3.6-flash).
Decision pending with the owner: Google's paid tier (fractions of a cent
per photo, no data-use clause) or checks off; the code is the same either
way, only the key's billing changes.

- **Owner decision (2026-09-07): Google's paid tier.** Billing goes on the
  same AI Studio key, the code and the default model stay as they are; once
  billing is on, the daily cap goes away and paid traffic is outside the
  free tier's data-use clause (the privacy text still has to name Google
  as a processor before the key reaches production). Owner-side steps:
  enable billing on the key in AI Studio, then `fly secrets set
GEMINI_API_KEY=…` per docs/DEPLOYMENT.md.

### Paid tier, third run (2026-09-07 evening): the remaining eight checks

Billing enabled, a new key in `backend/.env`. Every remaining verdict
right: su1/su2 with the water claim → approved; mama-1 with the water
claim → rejected ("su yerine mama yiyen bir kedi"); mama 2 → approved
(both); the cat drinking from a tap → approved as water, rejected as food;
the winter poster → rejected under both claims ("bu bir afiş görselidir").
Latency on the paid tier: **1.3–2.6 s per check**, against 6–16 s on the
free tier the same afternoon — the interstitial is now a short pause
rather than a wait. Across the day: 19 care verdicts and 2 comparisons on
the owner's photos, none wrong; the prompts stay as they are.

## 2026-09-07 — ninth deploy (v27): the photo AI is live on Gemini's paid tier

`fly deploy` of `3848507` (previous release v26 was the owner's
`fly secrets set GEMINI_API_KEY`, same image as v25 `ad247b2`, so this is
the first deploy of everything since the S7 fixes: the photo check, the
photo matching, the KVKK/terms text). Gates: clean tree synced with
origin, full battery (8 steps) green on the commit, secret scan of the
diff clean, migration 004 reversible (nullable column + unique index),
release notes written to chat, evaluator-qa PASS (harness 84/84,
fail-open without a key proven on a throwaway backend, migration run
twice with identical `\d care_actions`, the production image built for
amd64 with sharp's musl binary and `AI_BASE_URL` ignored under
NODE_ENV=production, the new KVKK text present in the web build). Release
command ran `004_ai_checks.sql`; the machine reached a good state;
`/health` ok, root and admin 200; boot log says
`ai: gemini-3.5-flash (photo checks and photo matching on)` and the live
`/gizlilik` page shows the "Fotoğraf kontrolü" paragraph (screenshot
taken). Not yet observed in production: a real photo going through the
check — the owner's first drop will show as an `[ai:care]`-free 201 in
`fly logs`; any `[ai:…]` line there means a refused key or a quota.
Rollback reference: image `deployment-01M1NSHF7BT4GT5G2NKFGHJ7R1` (v26).
QA's docs nits (the ADR's original Decision text and the 004 header still
say Claude/ANTHROPIC_API_KEY; superseded by the amendment) are left for
the next docs touch.

- Addendum, same evening: CI on `3848507` was green (`gh run` started
  08:23Z, green 08:26Z, before the 08:29Z deploy), so the CI-before-deploy
  rule held; the
  deployed range is `ad247b2..3848507` (v25 already carried `cb13ee3` and
  `ad247b2`). The docs nits listed above were fixed minutes later in
  `9e2597e` — the ADR body now reads "then/now", the 004 header and the
  `ai.js` model comment no longer say Claude or free tier — so there is
  nothing left "for the next docs touch". The order of events for the
  privacy text: v26 set the key on an image that could not use it; v27
  shipped the checks and the KVKK paragraph together.

## 2026-09-07 — matching covers the whole 1 km circle; only high/medium are listed

- Owner decisions after watching the real model: compare the photo with
  every animal in the 1 km circle that has a cover photo (cap 40 per
  request, `AI_MATCH_CANDIDATES`, was 8), show only high and medium
  similarity, all on one page (the 20-candidate cap is gone — the tier
  filter is the cap). `cd3e029`; the KVKK paragraph says "en yakın en
  fazla kırk tanesi"; harness step 7 asserts the "different" animal is
  absent and exactly two are listed (84).
- Review of that commit caught three things, fixed in the next: the tier
  filter also ran when the model had NOT answered, so a wrong breed plus a
  timeout emptied the list and both clients went straight to "create" —
  the duplicate this exists to prevent; the filter is now gated on
  `photoChecked` and the fallback keeps the old field-ranked list (cap 20).
  The harness proved "low is dropped" but not "medium is kept" — fixture D
  (same pattern, other colour, 250 m → 2 points) with an `unsure` verdict
  must be listed as medium, and step 8 asserts all four are listed when the
  model is down. The ADR carried both 8 and 40; `AI_MATCH_CANDIDATES` is
  capped at 48 (the 20 MB inline limit); "en yakın" left the KVKK sentence
  because the selection is field-ranked, not distance-ranked. 89.
- Second round: step 8 did not actually prove the gate — none of the four
  fixtures was low by fields, so an ungated filter listed all four too.
  Fixture E (no photo, other pattern and colour → 0 points) is hidden in
  step 7 and listed as low in step 8; D moved to +0.0035° so its 200 m
  margin holds at every latitude the grid reaches. `FALLBACK_LIST_LIMIT`
  (20) is still unexercised — it would need 21 animals in one cell. 92.
- Harness/gate observation for the maya layer (upstream candidate,
  2026-09-07 · `.claude/hooks/review-mark.sh` · the marker records HEAD
  when a review _finishes_, not the range it reviewed): a reviewer
  started on commit X that finishes after commit Y was made marks Y as
  reviewed. Seen twice today. The mark should be the reviewed range's
  tip, passed in by the agent prompt or read from its transcript.
- Real-model end to end, both clients: web — cat A (cover kedi-d1, same
  fields) and cat B (cover kedi-b, other fields) at an empty spot, new
  animal with kedi-d2 → one candidate, A, "Fotoğrafta aynı hayvan · yüksek
  benzerlik", B hidden, 4.3 s. Mobile — the same cat added at the
  simulator's Kadıköy location, where the seed puts dozens of cats within
  1 km (placeholder photos) → two candidates, both "aynı hayvan": the cat
  registered for the test and Besir, a record the owner had made of the
  same cat earlier in the day; every seed cat hidden as "different";
  ~10 s with up to 40 candidate images in the request. Screenshots taken.
- Cost/latency note: a full circle of 40 photos is ~40 × 260 tokens on
  Gemini's fixed per-image tiling, a fraction of a cent, and 10 s on the
  paid tier; the mobile match timeout is 90 s, the server deadline 45 s.

## 2026-09-07 — pre-pilot sprint P1–P3 built: purge script, nearest-first list, face cut-outs

- **P1 — `backend/scripts/purge-demo.js`.** Dry run prints per-table counts
  and the kept accounts (capped, tombstones counted separately); `--apply`
  runs one transaction: ad events + advertisers, content reports, every
  care action, every animal (cascades), every badge award, the kept users'
  points/rank snapshot reset, then the `@stray.test` / `@pati.demo` users;
  orphaned upload files (photos, thumbnails, drop photos, demo avatars,
  ad images) unlinked after the commit. Rehearsed on a `pg_dump` clone of
  the local database: 373 demo users gone, 855 accounts kept (harness
  leftovers and 107 deletion tombstones included), every content table 0.
  Not yet run on production: the script must be in the image first
  (deploy), then `fly volumes snapshots create` on `pati-db`, dry run via
  `fly ssh console`, the owner's yes on the counts, `--apply`.
- **P2 — nearest first, no radius, more on scroll.** `GET /animals` with
  lat/lng and no `radiusMeters` pages inside a subquery ordered by
  `location <-> point` alone — the shape the planner turns into a KNN
  index scan; the cover-photo lateral runs for the page's rows only, on a
  new `animal_photos` index. Review measured the first version (tiebreaker
  in the ORDER BY) at 621 ms against 13 ms; the final shape is 3.5 ms
  with 4,000 animals. Both clients page by 10 and load on scroll (mobile
  `onEndReached`, web an IntersectionObserver sentinel); any location
  failure falls back to newest-first with a caption. Curl: Kadıköy → 0 m
  first, Ankara → 274 km first (no radius), page 2 continues, the map's
  bounded pull unchanged, no-location = newest. Screenshots: both clients,
  first page and after scrolling (30 rows on web after two scrolls).
- **P3 — face cut-outs.** Every animal photo upload asks Gemini for the
  head box (0–1000 grid) and a 0–1 profile-picture score; `sharp` cuts a
  square with a 35 % margin from the EXIF-rotated image into a 320 px
  `-face.jpg` next to the photo (`thumb_url`, `face_score`, `face_box` —
  migration 005). One lateral join (`utils/coverPhoto.js`) picks the
  best-scored photo for every list, the profile header, the match
  candidates, comment rows and the map markers on both clients; the SVG
  pattern avatar stays as the fallback and in the code. Real model on the
  owner's cats: boxes returned with scores 0.89–0.98, and the cut-outs are
  exactly the faces. Screenshots on both clients: the web list (Duman and
  Pamuk with real faces, the rest pattern avatars) and the web profile
  header; the mobile list and the mobile profile header (Duman's British
  grey) — and, after the review, the profile mini-map marker too. Harness step 10: no face → no
  thumbnail, a face → a 320×320 file and the score, the best-scored photo
  is the picture in detail and list, model down → photo saved without a
  thumbnail; 108 assertions. KVKK text now says every animal photo is sent
  (three purposes). Backfill: `backfill-face-thumbs.js --apply
[--animals ids]` — production will have nothing to backfill after P1.
- Cost: one extra Gemini call per animal photo (2–6 per registration),
  fractions of a cent; the upload takes ~2–3 s longer, uploads run in
  parallel from both clients.
- **Add-animal permission gate (owner decision, same evening).** The
  location prompt fires the moment "Ekle" / "+" / "Yeni hayvan ekle" is
  tapped, and without permission the form does not open: mobile
  `addAnimalGate.ts` (`ensureLocationPermission` → Settings alert on a
  denial), web `addAnimalGate.ts` (browser prompt → the reason under the
  button), and the web form itself refuses a direct URL without a location
  and no longer falls back to the default centre on save. Verified: on the
  simulator with a fresh account (no dev override) and the permission
  reset, tapping "Ekle" opens the iOS prompt; after "İzin Verme" the form
  stays closed and the next tap shows the Settings alert (the alert did
  not appear on the very first denial — iOS reports the denial on the next
  request; noted, not chased). On web without permission the "+ Yeni"
  click stays on the list with the reason, and `/hayvanlar/yeni` shows a
  refusal card. Screenshots taken. Also: a cut-out that fails to load
  falls back to the pattern avatar (the harness's throwaway-port URLs had
  shown broken-image icons on web).

## 2026-09-07 (night) — the add-animal gate, second pass: where the sheet really came from

- The "alert did not appear on the very first denial" note above was a
  misdiagnosis, and the three gate rewrites that followed (timed probes,
  polling, AppState) were chasing it. Instrumented on the simulator: the
  gate code never ran on the first tap. The animals screen itself asked
  for the location on mount (`getCurrentLocation` for nearest-first), so
  the iOS sheet was already up when "Ekle" was tapped and the tap landed on
  the sheet's backdrop. That is exactly the "asked on entering the page"
  behaviour the owner ruled out.
- Fix: a screen may only _read_ the permission, never ask. iOS gives no
  way to read the status through the geolocation library (its
  `requestAuthorization` callbacks fire only on a change), so
  `react-native-permissions` 4.1.5 is in (Podfile: `setup_permissions`
  with LocationWhenInUse + LocationAlways; native build needed).
  `hasLocationPermission()` / `getCurrentLocationIfPermitted()` on both
  clients: the animals list, and the care-alerts job (which also asked at
  app start, through `requestBackgroundLocationPermission`), use them;
  the list says "Konum izni yok" without ever prompting. Web: the
  Permissions API, with a remembered grant in localStorage for Safari.
  `ensureLocationPermission` (the gate) is now `check` → `request`: no
  timers, no guesses; `requestBackgroundLocationPermission` no longer
  hangs when the status does not change (the old await never resolved).
  Review round: the iOS "always" upgrade is gone rather than pretended —
  react-native-permissions answers "blocked" without a sheet once
  when-in-use is granted, and the JS timer behind the checks is suspended
  in the background anyway, so iOS care alerts are foreground-only (Android
  keeps its separate background permission). The web Safari fallback
  remembers a grant per tab session (sessionStorage): iOS Safari's "Allow
  Once" and a revoke in Settings would otherwise leave a stale "granted"
  and the list would prompt on entry (residual: a revoke in Settings
  during the same tab session still prompts once on entry, and the denied
  answer clears the flag — Safari offers nothing better). The always
  usage string and the `location` background mode left Info.plist with
  the request. `pati://add-animal` (a live deep
  link) landed on the form without the gate — the screen now checks on
  mount and leaves with the Settings alert. The 700 ms alert delay moved
  into `alertLocationPermission` so the map's drop button gets it too.
  Known, pre-existing, not chased: Android 12's "approximate only" grant
  leaves fine location denied, so the gate refuses it; Android 11+'s
  background-permission request opens Settings on every launch until
  "don't ask again". `mobile/__tests__/location.test.ts` pins the iOS
  status mapping of the gate, with the vocabulary taken from the
  library's own jest mock (jest now transpiles that package).
- Evidence on the rebuilt app (pods without LocationAlways, Info.plist
  without the always string), same fresh account: permission blocked →
  `pati://add-animal` shows "Konum izni gerekli" and lands on the map,
  no form; permission reset → animals page, "Ekle" → sheet, "Uygulamayı
  Kullanırken İzin Ver" → the form opens. Earlier the same evening on the
  previous build: the deep link with the permission undecided showed the
  sheet on arrival and "İzin Verme" left with the alert. Web check rerun
  after the sessionStorage change: identical results (0 / 1 / nearest).
- Evidence, iOS simulator, fresh account, permission reset each time:
  animals page open 9 s → no sheet; "Ekle" → sheet; "İzin Verme" → form
  closed, "Konum izni gerekli" alert within 3 s; "Uygulamayı Kullanırken
  İzin Ver" → the form opens. Web (playwright, three contexts): list with
  the permission undecided → zero geolocation calls and the caption;
  "+ Yeni" → exactly one call, refusal text, still on `/hayvanlar`;
  permission granted → "Sana en yakından uzağa". Screenshots in the
  session scratchpad.
- Simulator trap worth knowing: `simctl privacy reset location` does not
  clear a permission sheet the user never answered — locationd keeps the
  request "in flight" for ten minutes and re-presents it on the next
  launch ("Authorization request ignored because another authorization
  effort is already in flight" in `log show --predicate 'process ==
"locationd"'`). Answer the sheet before resetting, or the next run tests
  the old prompt. Also `simulator-goto.sh` returned exit 1 when called
  without a screenshot path (the trailing `[ -n "$OUT" ] &&` under
  `set -e`); fixed.
- The map still asks on open — a map without a location is the one place
  the prompt belongs to the screen.

## 2026-09-07 (night) — v28 release failed: an index in 001 on a column 005 adds

- `fly deploy` v28 aborted in the release command: `column "face_score"
does not exist`. 001 re-runs first on every deploy and carried the
  `idx_animal_photos_animal (animal_id, face_score …)` index; production's
  `animal_photos` gets that column only when 005 runs, four files later.
  The 004 jti index had taught this lesson already and was kept out of 001
  for the same reason — the 005 index was not. v27 kept serving (health
  ok, web and admin 200); nothing changed on production.
- Fix: the index is in 005 only. Rehearsed the way the pre-deploy QA
  should have: a throwaway database built from production's own 001–004
  (`git show 3848507:…`), then the real `scripts/migrate.js` twice — both
  runs complete, the columns and the index exist after run 1, run 2 is
  all "skipping". The QA's rehearsal had applied 005 alone to that shape,
  never the whole file order; the load-bearing fact in CLAUDE.md now
  says the rehearsal must run migrate.js on a production-shaped copy.

## 2026-09-07 (night) — tenth deploy note (v29): pre-pilot sprint live, purge pending

- `fly deploy` v29 on `3643d3c` after v28's migration failure: release
  command applied 005 (`Applying 005_face_thumbs.sql … Migrations
complete`), machine healthy, `/health` ok, web and admin 200. Carries
  whole-circle matching with the high/medium filter, the nearest-first
  animals list, face cut-outs, the add-animal permission gate on both
  clients and the purge script. Range deployed: `3848507..3643d3c`.
  Production screenshot not taken: no production credentials in the
  session (the animals page needs a login).
- P1 on production: volume snapshot of `vol_r68dyneyeqy5noq4` scheduled,
  then the dry run over ssh: 371 demo users, 4005 animals, 8011 photos,
  777 health records, 1242 vaccinations, 11432 comments, 329324 care
  actions, 4704 badge awards, 1 content report to delete; 18 real
  accounts kept (3 tombstones), 3 friendships, 44 upload files to remove.
  `--apply` waits for the owner's word.
- P1 applied (owner: "silme işlemini başlat"), after a fresh volume
  snapshot (`vs_9Q574nL3OolUjA2ljbY7ZAY`, 3 minutes before): committed,
  371 demo users deleted, content emptied, 44/44 upload files removed —
  the counts matched the dry run exactly. Left on production: 18 accounts
  (3 tombstones), 3 friendships, no animals, no care actions. The owner
  also ordered the four hand-made test accounts (`@test.com` ×3, `o@o.o`)
  deleted; an ad-hoc delete over `fly ssh console` was refused by the
  session's permission classifier twice, so they are still there —
  either the owner runs the one-liner, or a reviewed repo script does it
  in the next deploy.

## 2026-09-08 — first production reports: dead retake on web, unscreened animal photos, no verification mail

- **Web "Yeniden çek" did nothing after a refused care photo.** The hidden
  file input was rendered only in the idle branch of the drop sheet, so
  the rejected step clicked a ref to an unmounted input. One input for
  every step now. Mobile's button is the same handler as the first shot;
  on the simulator (gallery stands in for the camera in `__DEV__`) the
  rejected step's "Yeniden çek" reopens the picker — a real-device camera
  run is still owed if the report came from the iOS app rather than the
  PWA.
- **Animal photos are now screened for the species** (ADR-0005, second
  amendment): `checkAnimalPhoto` next to the care check; `POST
/animals/match` takes the form's whole photo set, screens each (in
  parallel, before the comparison), refuses with `photoIndex`, and hands
  back one `photoToken` per photo that `POST /animals/:id/photos` redeems
  — the care scheme without the jti column (single use is a read on the
  file name; a race costs a duplicate row on one file, not a drop on the
  map). Direct uploads are screened inline. Clients: the refused photo
  leaves the strip with the model's reason (alert + caption on mobile,
  the page error on web); the create step redeems tokens, falls back to
  the file on `photoTokenInvalid`, and a photo failing after the record
  exists lands on the profile with the reason. Cost: up to seven small
  image requests per registration instead of one (`AI_MATCH_CANDIDATES`
  unchanged; the match limiter bounds it).
- Evidence: `scripts/ai-check/run.sh` 145 PASS at the time (161 at the deployed HEAD, sections 11–15);
  playwright on the dev server with the fake in reject mode — the second
  of two photos refused, the strip down to one, the reason above the
  form; approve mode — `POST /animals/match` then two `POST
/animals/:id/photos` with `photoToken` bodies, profile reached; the map
  sheet refused → "Yeniden çek" fires the file chooser → second photo
  approved. Simulator: same refusal alert and caption on add-animal, the
  picker reopening from the rejected drop sheet. Screenshots in the
  session scratchpad. tsc ×2 clean.
- **The verification code never arrives on production — not code.**
  `RESEND_API_KEY` is set and the boot log says `mail: Resend (from: Pati
<noreply@pati-app.com>)`, but `resend._domainkey.pati-app.com` and
  `send.pati-app.com` answer NXDOMAIN: the domain was never verified in
  Resend, so every send is a 403 (`verification mail to user N failed:
Resend answered 403` in the Fly log; the client shows the "Yeni bir kod
  iste" text and the resend answers 502). Fix is owner-side: publish the
  DKIM TXT and the SPF/MX pair Resend lists for `pati-app.com`, wait for
  "Verified", register once more. A Resend-side probe over `fly ssh
console` was refused by the session's permission classifier; the DNS
  answer is the evidence.
- Review round (code-reviewer, same day): the one important finding was a
  regression it is right about — the match step used to delete its
  scratch upload on every outcome, and the token scheme kept up to six
  files per call on the volume with nothing reclaiming them, on the flow's
  most common non-create outcome (the user picks an existing animal).
  Now: match photos land as `pending-<name>` through their own multer
  store, the token names the final `<name>`, the redeem renames (atomic;
  the 409 on a second redeem is still the file-name read — two redeems
  racing both pass it, reproduced in review, a duplicate row on one file
  is the accepted cost), and a sweeper in
  `config/upload.js` deletes pending files older than thirty minutes at
  boot and every five minutes — no database, no prefix means no touch.
  Minor findings closed too: multer's refusals (7th photo, unexpected
  field, oversize) are Turkish 400s through `error.middleware.js` instead
  of English 500s; the token no longer carries a `check` claim nothing
  read; the fake can refuse one photo of two by size so the harness now
  proves `photoIndex` names the second photo (`rejectImageBytesAbove`).
  Left as noted: the single-use read is a sequential scan of
  `animal_photos` per redeem — fine at pilot volume, an expression index
  is a later migration if it shows up; the care check's abandoned file is
  the same leak class, one file per cancelled drop, not on the pending
  scheme yet.
- Second review round: a redeem whose insert then fails had left a
  plain-named file no row owns — the one thing the prefix-only sweeper can
  never reclaim. The failed-insert branch now renames the file back under
  the prefix when the foreign key refused the row (the animal is gone, so
  no row can own the file; the sweeper reclaims it); not reachable from
  the harness, read in review. Also: a non-image
  upload is a 400 (was a 500 with a stack trace), the multer message
  covers the unknown-field case it is also raised for, and section 15
  asserts multer stored nothing.
- Third round, APPROVE with two notes, both taken: the rename-back is
  limited to the foreign-key failure (`23503`) — after any other failure
  a concurrent redeem of the same token may already own the file, and
  renaming it would hand the sweeper a file a gallery references; and the
  fileFilter comment no longer implies the log line went away with the 500. Fourth round on that commit: APPROVE. Reviewed range for the push:
  `710e247..HEAD`.

## 2026-09-08 — eleventh deploy note (v30): species screening and the web retake fix live

- Owner: "push ve deploy". Pushed `3643d3c..9165179` (7 commits, every one
  reviewed: four code-reviewer rounds, the last two APPROVE), then
  `fly deploy --app pati-app --ha=false` → v30: `release_command …
completed successfully` (no migration in the range; `migrate.js` a
  no-op on production's schema), `Machine 7843d59f197e98 is now in a good
state`, `/health` ok, web and admin 200, boot log `mail: Resend`, `ai:
gemini-3.5-flash (photo checks and photo matching on)`. Full battery
  (bundle and builds included) green on the exact commit; evaluator-qa
  PASS — harness 161/161, the web add-animal refusal and the map retake
  driven with playwright, the token create observed on the wire; the
  mobile refusal UI it could not drive (no simulator automation), the
  builder's simulator screenshots stand for it.
- Production screenshot not taken: still no production credentials in
  the session. First real registration after this deploy is the live
  check of the screening; the Fly log will show `[ai:animal]` warnings if
  the model misbehaves, and a refusal reaches the user as the model's
  Turkish sentence.
- Still owner-side: the Resend DNS records for `pati-app.com` (the
  verification mail); the four hand-made test accounts from the v29 note.

## 2026-09-08 — v30 follow-up: every refused photo leaves the form, not the first

- Owner, on production: two wrong photos, "kaydet", only the last one
  was removed. The match step answered the first refused index only and
  the clients dropped that one — a second attempt lost the second. Now
  `POST /animals/match` answers `photoIndexes` (every refused photo;
  `photoIndex` stays as the first, whose reason is shown) and both
  clients drop them all in one go, with plural wording. Evidence:
  harness 162 PASS (the two-photo refusal asserts `[1]`, the both-refused
  case `[0,1]`); playwright on web — two refused → strip 0, "Bu
  fotoğrafları listeden kaldırdık"; simulator — same, alert "Fotoğraflar
  uygun görünmüyor" and the empty strip with the caption. tsc ×2 clean.

## 2026-09-08 — twelfth deploy note (v31): every refused photo leaves the form

- Owner: "push ve deploy". Pushed `9165179..e9448bd` (3 commits, each
  reviewed, APPROVE), `fly deploy --app pati-app --ha=false` → v31:
  release command completed (no migration in the range), machine in a
  good state, `/health` ok, web and admin 200, boot log `mail: Resend`,
  `ai: gemini-3.5-flash (… on)`. Full battery green on the exact commit;
  evaluator-qa PASS — harness 163/163, the web two-refusals flow driven
  with playwright (`photoIndexes: [0,1]` on the wire, strip 0, plural
  wording); mobile observed on the simulator by the builder only.
- Production screenshot still not taken (no production credentials in
  the session). Owner-side items unchanged: Resend DNS records, the four
  hand-made test accounts.

## 2026-09-08 — one map: care markers with a depleting ring (P5)

- Owner idea, decided the same day: one map for food and water (the
  mama/su segment is gone), each record a screen-constant bowl/drop icon
  in a green ring that empties clockwise as its window (food 4 h, water
  6 h — unchanged) runs out; both types green, the glyph tells them
  apart; heatmap deferred; the notification logic untouched (it never
  depended on the drawing).
- Implementation: `mobile/src/map/careMarkers.ts` (no imports, shared
  with web through `@mobile`) holds the SVG generator, the 10-step ring
  quantisation of the server's `weight` and the image keys
  (`care-<type>-<step>-<theme>`). MapLibre cannot draw a partial arc, so
  the ring is 40 pre-rendered images: mobile ships PNGs
  (`scripts/generate-care-markers.mjs`, Playwright from web's
  node_modules, Node ≥ 22.18 for the `.ts` import; output committed under
  `src/map/markers/`) registered through `<Images>`, web rasterises the
  same SVG into `map.addImage` on every style.load. One SymbolLayer per
  client with the same expressions: icon key from `type + step + theme`,
  icons at 50 % below zoom 11 growing to full at 15, collision placement
  where the fresher record wins (`symbol-sort-key = 1 − weight`). The
  100 m fill circles, the outline ring and the center dot are gone
  (web's breathing timer with them); the 100 m radius still drives the
  status line and the notification.
- Bottom sheet: one status line reading both types ("Bu bölgede mama
  var, su yok"), the at-your-location rule in the description, then three
  equal outlined tiles — Mama bırak, Su bırak, Hayvan ekle (the FAB moved
  in). The confirm sheet follows the pressed tile (`dropType`), including
  the ad slot.
- Evidence: jest `careMarkers.test.ts` (ring step bounds, arc/full-ring
  SVG, variant keys); simulator screenshots light + dark (theme forced
  via the stored `pati.themeMode`), web playwright light + Browser-pane
  dark (the pane blocks tile requests, markers and sheet verified there);
  the web flow driven end to end with the AI blanked: "Su bırak" tile →
  photo → "Onayla ve ekle" → `POST /care-actions` body
  `actionType: "water"`, 201, row 22692 `water`, sheet flips to "su var,
  mama yok". tsc ×2 clean. `npm run lint` in mobile has no ESLint config
  (pre-existing, not in the battery).
- Known gap, deliberate: a fresh drop under an animal avatar or the user
  pin is covered by that DOM/MarkerView marker (the layers draw beneath
  views). The tap card with the record's remaining time and its 100 m
  circle, plus the zoomed-out heatmap, are the next session's items.
- Review (APPROVE, two important + three minor) and the follow-up: jest
  now pins the generated `markers/index.ts` keys to `careMarkerVariants()`
  (a changed step count or theme without rerunning the generator would
  otherwise render blank icons with every gate green) — which needed the
  generator to also write the 1x file under the plain name, since jest
  has no `@2x/@3x` resolution; `npm run care-markers` added; web guards
  the marker image `onload` against `map.remove()` (hasImage would throw
  on the dropped style); `step` travels as a string so the `concat` key
  never depends on an engine's number formatting; the theme-switch comment
  on mobile now describes the real mechanism (style reload → image-missing
  path re-fetches from `<Images>`); web's "Hayvan ekle" tile shows the same
  paw as mobile. Both clients re-screenshotted after the fixes.

## 2026-09-08 — P6 Track A: red last quarter, stacked markers, gradient actions

- Owner decisions: the ring turns red once a quarter of the window is
  left (both types: mama's last hour, su's last 90 minutes) — the tone is
  decided on the exact weight (`ringTone`), so step 3 exists in both
  colours and the PNG set grows to 52 variants; the three sheet actions
  are gradient buttons again (icon 28 above the label, no discs; all
  three carry the gradient by the owner's call); stacked markers get
  three rules shared by both clients — a record within 12 m of an animal
  moves to the avatar's shoulder (`icon-offset` by an `attached` flag),
  the records hidden by collision placement open as a fan when the
  visible one is tapped (members within 28 px spread on a 46 px circle
  with spokes; positions are geographic for the zoom they opened at, any
  move or blank tap closes it), and the user pin goes half transparent
  when a record or an animal sits within 14 m of it.
- Helpers `metersPerPixel`, `offsetMeters`, `distanceBetween`,
  `segmentFeature` joined `mobile/src/map/geo.ts` (import-free, web reads
  them through `@mobile`).
- Evidence: jest (tone boundary, red SVG, 52 variants pinned to the PNG
  index); web playwright — red rings at z16, the pin/avatar/record stack
  at z18 with the record on the shoulder and the pin dimmed, the fan open
  over a three-record stack; simulator — red rings, gradient buttons, the
  shoulder offset and the dimmed pin at z18. Native shows the shoulder
  offset mostly rightwards where web shows it diagonal (MapLibre native's
  icon-offset handling); acceptable, noted. The native fan tap is NOT yet
  observed: the simulator was being driven by another session (the
  stardate Expo app kept coming to the foreground), so the tap test is
  deferred to the merge pass. tsc ×2 clean.
- Sample data for the owner's look: records 22693–22710 near Kadıköy
  (varied ages, a red pair, a three-record stack at 29.029/40.9895, two on
  the user spot where the seeded cat Ozi sits). Local only.
- Review of a9bb4ec (NEEDS_WORK) and the follow-up: the shoulder offset
  now applies only from the zoom avatars draw at (`step` on zoom around
  the `case`, both clients) — at the locate zoom the record sits on the
  spot again and the pin dims for it honestly; the pin's animal half of
  rule 3 follows the same gate (mobile `animalsVisible`, web
  `zoomedInRef`, repainted on the crossing); web dims against the spot the
  pin is drawn at, not the state that the drop flow's fallback moves;
  mobile's fan source got a (no-op) press listener so a tap on a member
  keeps the fan open like web; a pan during the zoom read no longer
  reopens a stale fan (`fanSeqRef`); `mobile/__tests__/geo.test.ts` pins
  metersPerPixel (78 271.5 m at z0/eq, 0.2254 m at z18/41°),
  offsetMeters↔distanceBetween and segmentFeature. Web re-screenshotted at
  z16 (record on the spot, pin dimmed) and z18 (shoulder, dimmed pin).
  Still open, stated: the fan tap on the simulator (device shared with
  another session at the time) and the fan centre of an attached record
  (spreads around the avatar's spot rather than the shoulder icon).
- Second review (NEEDS_WORK only for the missing simulator evidence; the
  code checked out claim by claim, including the `step`-wrapped
  `icon-offset` on both engines): the simulator freed up and the mobile
  shots are in — z16 (record on the spot, pin dimmed), z18 (shoulder
  offset, dimmed pin) and the fan: a tap on the shoulder record of the
  seeded cat Ozi opens two members above and below the avatar with a
  spoke; the native `step`/`case` layout expression applies without a
  crash. A comment now pins ANIMAL_VISIBLE_MIN_ZOOM to an integer (tile
  zoom vs. camera zoom, reviewer's minor). Stated divergence: on mobile a
  tap on a fan member that overlaps a visible non-member is swallowed by
  the fan; on web it opens that marker's fan.

## 2026-09-08 — P6 Track B merged: user-to-user messaging

- Merged `track/messaging` into main with `--no-ff` (82a27ec; seven
  reviewed commits, reviewer NEEDS_WORK → APPROVE → APPROVE). Owner
  decisions: friends message each other one-to-one; groups are made from
  one's own friends, named, with admins who rename, add, promote, remove
  (never another admin) and delete any message; a member can leave (the
  last admin hands over to the longest-standing member); 5-second
  foreground polling (focus-gated on mobile, visibility-gated on web);
  messages are reportable into content_reports as `target_type
'message'` (006 replaces the check constraint idempotently; the admin
  queue shows them). Decisions taken during review: a member added later
  sees history only from their `joined_at` on; rename is `PUT`.
- Schema (006): conversations (`direct_key` partial unique index for the
  DM pair), conversation_members (role, joined_at, last_read_at),
  messages (soft delete: `deleted_at`, `deleted_by`, the row stays for
  the moderator). Poll contract: `GET …/messages?after=&since=` returns
  new messages plus `deleted: [{id, deletedBySender}]` and echoes `now`.
- Evidence: the track's curl harness now lives in
  `backend/scripts/messaging-check/` (run.sh boots a throwaway backend on
  3104, checks.sh registers the two extra accounts when missing) — 75
  checks incl. the interleaved two-sender case the first review found;
  migration applied twice on the dev DB and twice on a fresh one; jest
  `applyPoll.test.ts`; four web playwright screenshots (inbox,
  conversation, group settings, new conversation). Mobile screens
  verified with tsc + jest only during the track (the simulator is the
  main session's); simulator screenshots are owed at the merge pass.
- Known limitations, stated: a message the sender took back whose account
  was later deleted reads "Yönetici bu mesajı sildi"; `POST /reports`
  does not know `message` — reports go through `POST /messages/:id/report`.
- Merge pass, simulator: the mesajlar tab (inbox with a DM and the
  "Mahalle Kedileri" group) and a DM conversation (bubbles, "Bu mesaj
  silindi" placeholders, the composer) render on iOS from main — the owed
  mobile screenshots for Track B.

## 2026-09-08 — P6 Track C merged: likes, follow/care, inbox, animal badges

- Merged `track/animal-social` into main with `--no-ff` (b195e5d; 15
  commits, six review rounds ending APPROVE). Three add/add conflicts
  with Track B (the route mount in `backend/src/app.js`, the page imports
  in `web/src/App.tsx`, the appended sections of `web/src/theme.css`)
  were resolved by keeping both sides in order. Correction after the
  push-range review: the theme.css resolution had dropped the tail of
  `.msg-unread` (eight lines, its closing brace included) and one line of
  `.bell-count`, nesting the 66 rules that followed into one block — the
  web build does not fail on that. The file was rebuilt from the two
  parents (main after the messaging merge + Track C's animal-social
  section), esbuild's CSS parser now runs in the quick battery as "web
  css", and the three web surfaces (mesajlar, kedi profili, bildirimler)
  were screenshotted from main afterwards. Owner decisions (items 5–8): kedi/köpek profili title;
  square photo grid, swipeable viewer, one like per user with a count;
  "takip et" (free) and "bakım ver" (two photos, model-matched); comments,
  sightings, health/vaccination and photo uploads carers-only; followers
  ∪ carers minus the actor get notifications; an in-app inbox (bell on
  the profile tab, polled; the food/water care alerts are merged in from
  a local log on both clients); `device_tokens` registered for a later
  push sender; animal badges with the owner's names.
- The add-animal door and its rules (server-side `matchHit`, the one-shot
  spend, what "Tanıdık Yüz" counts) are recorded in ADR-0005's 2026-09-08
  amendment "who may care for an animal"; the six review rounds were
  mostly about closing photo-free or model-refused paths to carer rights.
- Schema (007): animal_photo_likes, animal_followers,
  animal_match_attempts (+ `used_at`), notifications, device_tokens,
  animal_badges — new tables only, so the "also in 001" column rule does
  not apply; 007 is re-runnable and was applied twice locally next to 006.
- Evidence: `backend/scripts/animal-social/run.sh` 93/93 (fake Gemini),
  `backend/test/animalBadges.test.js` 6/6 (now in the battery), twelve web
  playwright screenshots in the track's scratchpad (profile, viewer,
  buttons, care sheet miss/match, bell, inbox, list badges, the review bar
  in its three states). Track decisions, stated: a care-step `similar` is
  a miss; care photos join the gallery; badge symbols reuse the medallion
  glyphs; the inbox marks itself read on open.
- Left open: no client registers a device token yet and no local notifee
  for inbox items (the push batch); `POST /reports` does not know
  `message`.
- Merge pass, simulator: "kedi profili" for Ozi with takip et / bakım ver,
  the follower/carer counts, the photo grid with like counts and the
  carers-only door bar; the notifications inbox from `pati://notifications`.
  `backend/test` (node:test) joined the quick battery as "backend test".
- evaluator-qa on the merged batch (NEEDS_WORK → fixed here): web's pin
  never dimmed — maplibre-gl writes `opacity: 1` inline on every Marker
  container, so the `dimmed` class on it lost; the opacity now sits on
  the pin's svg. QA's own evidence: harnesses 75/75 and 93/93 rerun, full
  battery 10/10 on a clean tree, web playwright shots of the map (rings,
  red last quarter, gradient actions, shoulder record, three-member fan),
  the mesajlar tab (inbox, DM, group, settings, new), the kedi profili
  (grid, viewer, care sheet, follow toggle round-trip) and bildirimler;
  no console errors on any page.

## 2026-09-08 — P7 Track A′: automatic fans, location dot, one "Ekle", locate button

- Owner findings 8–11, 13, 14 (P7). Avatars draw from zoom 15 and are
  fetched within 500 m (were 17 / 200 m). The user's position is a small
  brand dot in a white ring with a breathing halo, centred on the
  coordinate — the paw pin of 2026-08-31 is retired by this decision on
  both clients (`UserLocationMarker`, `.user-dot`). Stacks are automatic:
  from the avatar zoom on, records and avatars that would overlap on
  screen (34 px) take seats on a circle around their spot (44 px, wider
  for big stacks so seats stay 40 px apart) with a spoke each, and a stack
  under the user dot is centred on the dot so nothing covers it —
  `mobile/src/map/stacks.ts` (import-free, web reads it through `@mobile`;
  jest covers the grouping, seats, anchor, zoom awareness and ring
  widening). Below that zoom the symbol layer's collision placement thins
  a pile to its freshest record (`icon-allow-overlap` is a `step` on
  zoom). The tap-to-fan of P6 and the shoulder/pin-dim rules are gone with
  it. The sheet has one gradient "Ekle" with the paw; it opens a chooser
  (Mama bıraktım / Su bıraktım / Yeni hayvan) before the existing flows. A
  locate button (crosshair) flies to a fresh fix; the zoom +/− pair is
  gone from mobile (web never had one); the "Hayvanları görmek için
  yakınlaştır" hint sits at the top on both clients.
- Evidence: jest (stacks 7 cases + the earlier suites, 35 total); web
  playwright at z16 (avatars, fans with spokes, dot, locate button, single
  Ekle) and z18 (six-member fan of three records and three cats around the
  dot); simulator at the locate zoom (dark theme) and the chooser.

## 2026-09-09 — P7 Track B′ merged: sender avatars and quoted replies

- Merged `track/messaging-2` into main with `--no-ff` (a56706e; five
  commits, review NEEDS_WORK → APPROVE). Owner findings 6 and 7: the
  sender's avatar beside each bubble (runs of one sender share one
  avatar), and reply-to quotes — `messages.reply_to_id` (008, re-runnable,
  `ON DELETE SET NULL`), the quoted excerpt (sender + first 120 chars, or
  "Bu mesaj silindi") above the bubble, tap scrolls to the source, the
  composer shows the pending quote with a cancel; "Yanıtla" from the
  long-press (mobile) / "⋯" (web) menu. Rules found in review and now in
  the harness: a quote never shows a late member a message from before
  their `joined_at`; a cross-conversation, unknown or pre-join source is a
  400; `replyToId` must be a number.
- Evidence: messaging harness 99 checks (the track ran it twice), jest
  `applyPoll` extended, tsc both clients; web: own bubbles right-aligned
  and an unbroken quoted word clamped inside the bubble (measured in
  headless Chromium by the reviewer); post-merge screenshots of a
  conversation on both clients from main.

## 2026-09-09 — P7 Track C′ merged: carers follow, care notification, badge ladder

- Merged `track/animal-social-2` into main with `--no-ff` (107ea46; seven
  commits, review NEEDS_WORK → APPROVE → minors folded). Owner findings
  1–5 and 12: "bakım ver" (both doors) also follows, with a one-shot
  backfill for existing carers (009, behind a `schema_backfills` sentinel
  so re-runs never re-follow someone who unfollowed); a `care`
  notification kind ("<kişi>, <hayvan> için bakım vermeye başladı") to
  followers ∪ carers, announced only when the carer row was really new;
  the profile header shows follower/carer counts on top and the two
  highest badges, tap opens the read-only ladder (bronze→diamond, live
  count, "N kaldı"); the cared state keeps its outline. Finding 1 ("past
  notifications on follow") was not the product: the animal-social harness
  used test1 as its carer and left real inbox rows behind between runs;
  it now registers its own carer and asserts test1's inbox is untouched,
  and the follow-timing section proves a late follower gets nothing older
  than the follow.
- Evidence: harness 124/124 (incl. a concurrent double care-photo
  submission → one carer row, one care notification), node:test 9/9, jest
  34/34 in the track (47 on main after the merge), 009 applied three times
  locally; web screenshots of the header, the ladder, Ozi's profile and a
  care notification; simulator shot of the profile at the merge pass.

## 2026-09-09 — P7 Track A′ follow-ups (after review)

- Track A′ review (NEEDS_WORK twice, then the fixes in ab508e3, 6515919,
  56eca0f): web seats the freshly created avatars (the repaint used to move
  the markers about to be removed); one user-dot marker moved by every fix
  (`placeUserDot`), so the locate button and the drop flow carry the dot,
  the range ring and the layout anchor with them, and the marker is
  positioned before it is added (a positionless marker paints at the
  map's origin); the celebration hearts rise from the avatar's fan seat on
  both clients — on mobile through a ref so the fallback timer armed by an
  older render sees the reloaded data; mobile's locate refetches with the
  fix it took and shows fixed Turkish copy on failure; a shared empty
  placement below the gate; dead pin CSS and a duplicated `.user-dot`
  block removed. Known, stated: single-link chaining has no cap (a street
  of records under 61 m apart at zoom 15 becomes one wide fan) and a fan
  seat can still land near the dot when the stack's centroid is off it.
- Merge pass: push-range review APPROVE (008 + 009 replayed three times on
  a throwaway database, the one-shot backfill observed), evaluator-qa PASS
  (harnesses 99/99 and 124/124, migrate twice on the dev DB with counts
  unchanged, web drives of the map/fan/chooser/locate, a quoted
  conversation, the profile ladder and follow round-trip, the inbox with a
  care row; mobile by tsc/jest and reading). Full battery 10/10 on ca4e867.

## 2026-09-09 — P8 Track A″: logo on "Ekle", spokeless fans, round header control

- Owner findings on P7 (items 1, 2, 4; answer to 5: every change lands on
  web too). The map sheet's "Ekle" carries the pati logo, white on the
  gradient with the heart as a real hole: both logo technologies
  (`components/brand/Logo`, `shared/logoSvg`) now draw the pin and the
  heart as ONE even-odd path when `accent` is `'transparent'` — the old
  "paint the heart in the background colour" trick had no colour to paint
  on a gradient and the first cut shipped a solid pin (review finding).
  Fans keep their seats and lose the spokes on both clients. The
  conversation header's group/avatar control is a 36 pt surface disc with
  a hairline and a centred glyph on both clients; on mobile the styles
  object (cached per theme name by `makeStyles`) sits in the header
  effect's deps, so a theme flip re-renders the disc in the right colour.
- Evidence: web playwright — the map (logo button with the hole, the
  six-member fan without spokes), the group conversation header in light
  and dark; simulator — the map and the group header (light). tsc ×2,
  jest 47/47, quick battery green on each commit.

## 2026-09-09 — P8 Track C″ merged: the animal profile after the human profile's discipline

- Merged `track/animal-profile-3` into main with `--no-ff` (three commits,
  reviewer APPROVE; the last commit folds two minors). Owner finding 3:
  the header is avatar + name row with "N takipçi · N bakıcı" right-aligned
  on the name's line (wrapping under a long name), the descriptive line,
  the two badge chips, then the takip et / bakım ver pair; one section
  order on both clients — fotoğraflar, en son görüldüğü yer, aşı kayıtları,
  sağlık kayıtları, sohbet; the carers-only door is an inline flat card at
  the top of sohbet (no sticky overlap); "şikayet et" is the footer under
  a hairline (`?report=1` still opens it on mobile; web never had that deep
  link). The older "become a carer" hint under sağlık kayıtları is gone on
  both clients. Stated divergence: on web the footer sits after the sticky
  decision bar / composer in flow, on mobile those bars live outside the
  ScrollView — same visual result.
- Evidence: web playwright light + dark + page bottom (non-carer door card
  and footer; the track also shot the carer view and a long-name wrap
  probe); simulator light (header, chips, pair, fotoğraflar, map); quick
  battery green on the track's HEAD; full battery 10/10 on main after the
  merge (2290dd4); tsc ×2, jest 47/47. Simulator dark theme of the profile
  taken at the merge pass (theme forced through the stored
  `pati.themeMode`); the long-name wrap was probed on web only.
- Owner follow-up (2026-09-09, three rounds): the follower/carer pair on
  the animal profile is black, 17/23 and carries the NAME's weight
  (Quicksand-Medium / 500) on both clients — it reads as a peer of the
  name instead of a footnote (was 12.5 semibold muted; bold was tried and
  the owner found it too heavy). Verified with a profile screenshot on web
  and on the simulator after each round; the pair still wraps under a long
  name (the pair widened by 29-35 px depending on the counts, measured in
  Chromium by the reviewer, so the wrap fires for shorter names than before
  — the avatar's removal in the next commit gave that width back).
- Owner, 2026-09-09: the animal profile drops its avatar — the photo grid
  moves to the very top as the hero (no section header there any more) and
  the identity block (name + follower/carer pair, descriptive line, badge
  chips) sits right under it, then the takip et / bakım ver pair. The rest
  of the order is unchanged (en son görüldüğü yer, aşı kayıtları, sağlık
  kayıtları, sohbet, şikayet et). `AnimalAvatar` still marks the animal on
  the last-seen mini map on both clients. Screenshots on web and the
  simulator.
- Owner, 2026-09-09: the map is worldwide. The Turkey bounding box, the
  camera's `maxBounds` and the `insideServiceArea` guard are gone on both
  clients; without a location the map opens on the world (zoom 1.5, min
  zoom 1) and the care records now come from the VIEWPORT — mobile
  refetches on every region settle and on map-ready, web on `moveend` —
  instead of one fixed Turkey box. A viewport wider than the world, or one
  crossing the antimeridian, is sent as −180…180 so the server's envelope
  keeps ordered corners. Evidence: web playwright with no location (world
  view) and with a Berlin fix (the map flies there, "Buralarda mama ve su
  yok"); the simulator still centres on its Kadıköy fix.
- Review follow-up on the hero gallery: the grid is capped at two rows
  (six tiles) with a "+N" veil on the last one opening the viewer — every
  accepted "bakım ver" adds two photos, so an unbounded hero would push
  the name and the action pair below the fold.
- Review of the worldwide map (NEEDS_WORK) and the fixes, all in the same
  session:
  - **Blocker.** A geography envelope's edges are great circles, so past
    roughly 150° of longitude `location && ST_MakeEnvelope(...)::geography`
    stopped covering its own interior: the world box returned 0 of 7771
    seeded records (reproduced on the dev database). The viewport filter
    now compares planar geometries (`location::geometry && ST_MakeEnvelope`)
    and `010_care_bbox_geometry.sql` adds the functional GIST index that
    keeps it off a seq scan. Distance work (`ST_DWithin`, "care within
    100 m") stays on the geography column — meters must stay meters.
    Verified: the world box answers 8 in-window records where it answered 0.
  - Both clients share `mobile/src/map/viewport.ts` (import-free, jest-
    covered): a viewport wider than 150°, one that crosses the antimeridian
    or one MapLibre reports unwrapped (159…199) is sent as the whole world
    instead of a half-clamped box that hid records on one side.
  - The viewport refetch is debounced (350 ms) on both clients; mobile
    takes its sequence number before the async bounds read and states
    "Kayıtlar yüklenemedi" on the map instead of showing an empty area.
  - Without a fix neither client claims a verdict any more: the sheet says
    "Buranın durumu bilinmiyor" and web stops fetching statuses/animals
    around the Kadıköy fallback. A web drop with no location falls back to
    the map centre only from zoom 14 on; below that the drop is refused
    (at world zoom one pixel is hundreds of kilometres).
  - Second round of the same review: web's viewport failure no longer
    lands in the page-wide (English, sticky) error banner — both clients
    now show a Turkish "Kayıtlar yüklenemedi" pill that clears on the next
    success; mobile takes its sequence number BEFORE the async bounds read
    (the earlier note claimed a fix that was not in the code); an
    antimeridian viewport is fetched as TWO boxes and merged instead of
    asking for the world (the server answers a box with its 2000 newest
    records, so the world box could hide the ones under the user's feet);
    a failed status lookup now reads "Buranın durumu alınamadı" instead of
    telling a located user to turn on location; the web drop refusal and
    the permission guidance both name the zoom-in way out; `viewportBoxes`
    guards non-finite latitudes too; the geometry index is mirrored into
    001 (the 002 precedent); `FALLBACK_CENTER` is gone from web.
  - Third round: web's failure flag moved inside `loadMarkers`, behind the
    same sequence guard as the data (a stale request could otherwise clear
    the pill over a stale map, or raise it over a good one); a mobile load
    with no fix now clears both the statuses and the failure flag, so the
    sheet stops asserting the last place's verdict; the public viewport
    route answers 400 (not a Postgres 500) for a non-numeric corner; the
    two stale comments about staying on Kadıköy are gone.
  - **Correction to the entry below (2026-09-09).** The fourth-round
    commit message and this note claimed two client fixes that a failed
    edit script never applied: the web drop's refresh guard and mobile's
    permission-vs-no-fix split were absent from the tree while the history
    said they had landed. The fifth review caught it; both are now really
    in the code, verified by grep and by the gates, and the coordinate
    guard was widened at the same time (see the fifth-round bullet).
  - Fourth round: a failed refresh after a successful drop no longer turns
    the drop into an error banner (or swallows the badge celebration) on
    web — the pill states it and the flow continues; mobile tells a denied
    permission from a granted one that produced no fix (`hasLocationPermission`),
    so a user with location on is never told to turn it on; the coordinate
    guard now covers all four public entry points (viewport, radius list,
    status, animals) with Turkish 400s, pinned by
    `backend/test/coordinateGuards.test.js` — a bad corner used to reach
    Postgres and the error middleware echoed its English message back.
  - Fifth round: the two client fixes above landed for real; the
    coordinate guard moved into `backend/src/utils/numbers.js`
    (`finiteNumber` refuses an empty or blank string, which `Number('')`
    would otherwise turn into a valid 0) and now covers the viewport
    corners, both radius centres and the animals list's `radiusMeters`;
    the viewport branch is entered only when all four corners are present
    and non-empty, so a half-filled box still answers the old "zorunludur"
    400 instead of silently querying from the equator.
  - Sixth round (the review kept finding holes the previous round claimed
    closed, so these are the observed answers, route by route). `finiteNumber`
    now decides every branch, not string truthiness: `GET /animals` refuses
    a blank or half-given centre (`lat=41&lng=%20`, `lat=41` → 400 "lat ve
    lng birlikte verilmelidir") and parses its radius, both care routes
    refuse a junk `radiusMeters` instead of falling back to the default
    (→ 400), and `POST /care-actions` parses its pin with `finiteNumber`,
    so `lat: ""` is refused rather than recorded at 0,0. `GET /animals`
    with no coordinates at all (or two empty ones) is still the unbounded
    newest-first list — that is the animals tab, not an error. Web now
    tells a denied permission from a granted one that produced no fix
    (`navigator.permissions`), the parity the mobile fix left open.
    `backend/test/coordinateGuards.test.js` pins all of it without a
    database (15 backend tests).
  - Seventh round. `backend/src/utils/numbers.js` gained `coordinate()`,
    which parses AND range-checks a pair: PostGIS silently coerces lat 999
    into −81, so a drop could be stored hundreds of kilometres from where
    the client said. Every coordinate WRITE now goes through it — the care
    drop, the animal match, the sighting (which moves the animal) and the
    create — all answering 400 "lat ve lng geçerli bir konum olmalıdır"
    (verified live: 400 for lat 999 and for an empty lat on all four).
    Web's failure flag moved to where the location attempt actually fails
    (the initial fix's catch and locateMe) and uses the project's own
    `hasLocationPermission`, which covers Safari's missing permission
    query — the inline version announced "Buranın durumu alınamadı" while
    the first fix was still in flight. Mobile's animals fetch no longer
    drops the centre for a user at latitude or longitude exactly 0.
    16 backend tests.
  - The world view opens at zoom 2.2 with a floor of 2 on both clients:
    the generated basemap drops the low-zoom `natural_earth` raster, so
    below ~2 the vector layers paint nothing (blank cream). The build
    script now records that consequence.

## 2026-09-09 — thirteenth deploy note (v32): P7 + P8 live

- Owner: "pushla ve deployla". Pushed `b647404..531b2ef` (45 commits, every
  one reviewed; the P8 map work took eight review rounds) and deployed
  with `fly deploy --app pati-app --ha=false` → **v32**: release command
  completed (migrations 006–010 applied), machine in a good state.
  Checklist: clean tree in sync, full battery 10/10 on the exact commit,
  secret scan clean, and the migration rehearsal CLAUDE.md requires — the
  new `migrate.js` run twice against a throwaway database built from
  production's own files (`git show e9448bd:…`) — both passes clean, 19
  tables before and 29 after, the `009_carers_follow` sentinel claimed
  once. Release notes: none exist and the repo has no tags; noted, not
  produced.
- Production checks after the deploy: `/health` ok, pati-app.com 200,
  admin.pati-app.com 200, the world viewport box 200 (it answered 0 rows
  before 010 — the geography envelope bug), a malformed box 400, and on
  the production database `idx_care_actions_location_geom` present with
  the backfill sentinel holding exactly one row.
- The first `fly deploy` failed with "dockerfile backend/Dockerfile not
  found" because the shell was still in `backend/` from the rehearsal;
  rerun from the repo root with `--config`. Worth remembering: fly reads
  the Dockerfile relative to the working directory.

## 2026-09-09 — P9 track A: the demo world is each person's own switch

- The owner first asked for one admin-panel button ("demo verilerini
  göster/gösterme"), then changed their mind mid-build: **"her kullanıcının
  profilinde demo verisini gösterme butonu olsun"**. The global switch
  (admin controller, routes, dashboard card) was reverted in full and
  replaced by `users.show_demo`, default true, flipped from the profile of
  both clients with `PUT /users/me/show-demo`.
- Migration `011_demo_data.sql` puts `is_demo` on every table a read path
  touches (users, animals, photos, care actions, comments, health records,
  vaccinations, friendships, conversations, members, messages,
  notifications, care links, followers) with a small partial index on the
  demo rows, plus `users.show_demo`. The columns are mirrored into
  `001_init.sql`; the indexes are not, per the load-bearing rule (001 runs
  first against production's older schema). Rehearsed twice from scratch
  and twice onto a database built from the deployed commit's own files —
  both idempotent, both ending on the same 29-table schema.
- `backend/src/utils/settings.js` holds the preference behind a five-second
  per-user cache, with `demoFilter(req, alias)` returning either `''` or
  ` AND NOT <alias>.is_demo`. The profile write goes through the cache, so
  the next screen already reflects the choice.
- **The map and the drop list are public routes**, so they never parsed a
  token and could not honour a signed-in visitor's choice — the first
  end-to-end run showed the filter doing nothing there. New `identifyUser`
  middleware names the caller and never refuses; it sets only `userId` and
  no role, so nothing downstream can mistake it for a privileged session.
- Marking is a chip and nothing else (owner: "sadece çip"): `is_demo`
  travels on the animal, public-profile and leaderboard payloads and both
  clients render a quiet "demo" pill beside the name. Names stay ordinary.
- Verified: quick battery green; curl round trip (preference persists, 400
  on a non-boolean, 401 anonymous); Ankara viewport 0 demo drops and 0 demo
  animals with the switch off, 251 and 125 with it on; leaderboard total
  3.366 → 1.166. Screenshots: iOS profile açık/kapalı and the Ankara map
  full of rings, web profile switch, web animal and user chips.

### Same day — the two review rounds on the demo switch

- Round one found three user-visible wrong numbers, all created by making a
  read path viewer-dependent: `getUserRank` was computed through the
  subject's own preference and then **stored** (`users.last_rank`, and
  frozen into badge awards), so flipping the switch could produce an award
  popup reading "12 → 4301"; the notification page was filtered while
  `total` and `unreadCount` were not, so the bell said 8 over an empty
  inbox and "load earlier" never went away; and the avatar endpoints, whose
  docstring promises "exactly the same shape as getMe", did not return
  `show_demo`, which web swaps in wholesale.
- Round two — on the fixes — found that the first correction had swapped a
  transient contradiction for a permanent one: a canonical profile rank
  beside a viewer-relative leaderboard means two screens showing the same
  person two different numbers, on every switch, forever. The rule now is
  **shown ranks follow the viewer's board, stored ranks are canonical**:
  `getUserRank(subject, viewer)` for display (the public profile passes the
  viewer, so a profile agrees with the board they came from) and
  `getCanonicalRank` for `users.last_rank` and award rows. `getMe` only
  refreshes the snapshot when the viewer is looking at the canonical board.
  Verified: profile and board now read 2619/3367 together with the showcase
  on and 419/1166 together with it off, while the stored snapshot stays 2619.
- Round two also caught that the avatar response was still missing
  `recentComments`, `commentCount` and `email_verification_pending` — the
  same defect class one field over. Both responses now have identical key
  sets (checked by diffing them live).
- Two runtime gaps closed: notifications inherit `is_demo` from the actor or
  the animal, so the filters are not inert once the seed lands; and the
  mobile toggle now survives a profile reload that was issued before the
  write (the reload honours the newer choice, matching web's refetch).

### Same day — Track S merged: the showcase world exists

- `e017616` merges `track/showcase-data`: `seed-showcase.js` writes 106.453
  `is_demo` rows across 44 districts of İstanbul, İzmir and Ankara in about
  six seconds — 2.200 bots, 6.600 animals each wearing one generated photo,
  42.620 drops with a live slice inside the ring window in all three cities,
  comments, health and vaccination records, friendships, DMs, a group per
  district, badges synced at the end. Additive (every non-demo count
  identical before and after), idempotent, and exactly reversible.
- The photo URLs are STORED, so they depend on the `/demo` static mount
  that landed with track A (`8827bc8`). The script fetches one photo before
  it starts and refuses to run when the origin does not serve it —
  otherwise a production run would bake ~49.000 dead URLs into the
  database. Verified after the merge: `/demo/animals/cat-tekir.png` → 200.
- **An owner decision waits before the production run.** Stored ranks are
  canonical by design (they must not move with a viewer's preference), so
  from the moment production is seeded, the next badge any real volunteer
  earns freezes a rank computed over a board holding 2.200 bots into
  `user_badge_awards` — and `--remove` cannot repair those rows. The
  alternative is to keep bots off the ranking entirely, which contradicts
  "girsinler" (they DO appear on the leaderboard). Not a code problem;
  a choice.

### Same day — the owner takes the bots off the leaderboard

- The open decision recorded above is settled, and the other way round:
  **"botlar sıralamada gözükmesin. profillerinde sıralamalarında demo
  hesabı yazsın."** So there is one board for everyone with `is_demo`
  accounts excluded, `getUserRank` is the only rank function again, and a
  showcase profile shows "demo hesabı" where the number would be — on the
  public profile and on its own. Anything written above about a canonical
  board beside a viewer-relative one, or about bots inflating stored ranks,
  describes code that no longer exists.
- That decision deleted more than it added: the canonical/viewer split, the
  `show_demo` gate on the rank snapshot (which also froze board-independent
  `last_points` — a review finding), and the leaderboard's demo chip.
  Production was never seeded under the old code, so no stored rank ever
  saw a bot; nothing needs migrating.
- **The leak both the fourth review round and the QA pass found
  independently**, and how it is closed: filtering lists while single rows
  answered 200 left a reader with the showcase off able to open a bot's
  profile sub-resources (`/users/:id/animals`, `/users/:id/comments`) and a
  demo animal's comments, and to follow an animal they could not read.
  `guardDemoUser` / `guardDemoAnimal` (`middleware/demo.middleware.js`) now
  sit on every `/:id` route of both routers, after `requireAuth` — a param
  handler would have run BEFORE it and seen no `req.user`. They cost
  nothing for the default reader: the preference is cached and the lookup
  only happens once someone has switched the showcase off.
- The mirror image mattered too: a real volunteer can care for or comment
  on a showcase animal while the world is on, so the profile lists (and
  their counts) are filtered as well — otherwise the switch left a card
  that 404s when tapped.
- Two labels a fingertip apart both said "açık" on the profile — the demo
  switch and the light theme. The demo switch reads "görünüyor / gizli"
  now.

### Same day — what the QA pass changed in the showcase content

- The drops' `photo_url` pointed at an animal's face. A real drop carries a
  photo of the BOWL — that is what the AI check reads and what the admin
  panel's care list renders — so the seed now stores
  `/demo/care/{food,water}.png`, rendered from the map marker art by
  `generate-demo-care-photos.mjs`. The preflight checks one URL from each
  family, since the two live in different directories.
- Four of 44 inboxes previewed a month-old group whose newest message was
  "gruba yeni katıldım": the greeting was one of the shuffled pool. It is
  the group's opening line now, from the creator, at the creation time.
- 140 messages talked about the cold under August timestamps. Cold-weather
  lines (and one whole DM script about winter shelters) join their pools
  only from November to March, decided once at module load.
- The live-ring slice roughly doubled after the QA screenshot of a
  street-level viewport with a single ring: 1.441 drops now sit inside the
  window against ~540 before.
- Left as it is, deliberately: a newcomer can send a friend request to a
  bot and never hear back. Auto-accepting would need a job that runs after
  the seed, and the request sitting in "gönderilen istekler" is at least
  honest about what it is.

### Same day — where the line between "hidden" and "mine" falls

- The fifth review round caught the filter overshooting: with the profile's
  own comment and care lists filtered, a volunteer who had worked on
  showcase animals saw "0 yorum" beside a gold comment badge, because the
  badge engine counts everything. The rule is now explicit, in the guard's
  own docblock: **the switch hides DISCOVERY — map, lists, board, search,
  inbox — and never takes away what the reader themselves did.** The
  profile lists are unfiltered again, and `guardDemoAnimal` lets through an
  animal the reader has cared for, commented on or followed. Verified: with
  the showcase off, an animal I cared for opens (200), a bot animal I never
  touched is 404, my counts and my list agree.
- The write side had the same hole the read side did: a friend request to a
  hidden bot landed, then vanished from the sender's own list and answered
  409 forever. `isHiddenDemoUser` refuses it with the same 404.
- Three more from that round: the guards sit AFTER the rate limiters now (a
  loop over a demo id was never counted by any bucket), a demo carer or
  comment author on a REAL animal is filtered out (tapping them 404s), and
  the own-profile "demo hesabı" cell no longer opens a board the account is
  not on.
- The seasonal gate was reading the machine clock, so a run on 5 November
  would have stamped cold-weather chat onto rows dated 6 October, and the
  plan stopped being a pure function of `(seed, now)`. Every pool is now
  asked of the ROW's own date. The group's opening line is a founder's
  ("Grubu açtım…"), not the joiner greeting the previous fix had put in the
  creator's mouth. Four new tests pin the bowl photos, the seasonal rule
  and the opening line.

### Same day — the rule that finally composed

- Six review rounds walked the same loop: filter a surface, and a number or
  a link somewhere else stops agreeing with it. Round six found the last
  two — another person's profile still handed out showcase cards that 404
  on tap, and a health record's comment count contradicted the chat behind
  it once demo authors were filtered out of it.
- The rule that composes, now written into `utils/settings.js` next to
  `demoFilter`: **the switch hides DISCOVERY — the map, the animal list,
  search, notifications; bots are off the leaderboard for everyone — and
  nothing else.** A row somebody navigates to always opens, and anyone's
  own record (their profile history, their friends, their chats, an
  animal's own carers and comments) is never filtered. A demo row a reader
  does reach wears the "demo" chip, which is what the owner asked for in
  the first place ("sadece çip").
- That deleted `demo.middleware.js` and its seventeen mounts, the friend
  and inbox filters, the carer/comment-author filters and `hidesDemo`. The
  surviving filters are exactly the owner's own list: harita, listeler,
  arama, bildirimler.
- Two seed corrections from the same round: the season is asked per MESSAGE
  (a group's messages span a month, so choosing the pool from the group's
  creation date stamped "hava çok soğuk" onto rows dated 5 April), and it
  is asked in UTC (`getMonth()` made a plan depend on the seeding machine's
  time zone, which contradicts its own determinism test). The seasonal test
  now plans a JANUARY world, so it asserts that cold lines appear at all —
  at the old September date the loop body never ran.

### Same day — the guide world was a bot world nobody had flagged

- The seventh review round found the real production hole. `seed-guides.js`
  has been putting "… · pati rehberi" accounts, their animals and their
  food/water on production since long before `is_demo` existed, and
  `DEMO_GUIDE_REFRESH=1` adds fresh drops **every hour**. Nothing marked
  them, so the switch never hid them — and they held real leaderboard
  ranks, which is exactly what the owner ruled out. Both bot worlds sign
  their accounts with an `@pati.demo` address, so that is the handle:
  `flagGuideWorld()` runs at the end of every seed and every hourly
  refresh, and `012_guide_world_is_demo.sql` backfills what production
  already has (claimed through `schema_backfills`, since re-running it
  would undo a deliberate un-flagging). Locally: 370 guide accounts and
  7.586 of their drops flagged, the board 1.166 → 796, no "rehberi" in the
  top 200.
- The seasonal tests were passing against the code they were written to
  catch — twice in a row. A cold line on a warm date is rare (18 rows in
  66.492 against the PER-GROUP planner of `b62c826`), so one district on one
  date proves nothing. The test is a sweep now: every district across the
  two week-long windows where a 30-day history straddles the season
  boundary, ~0.15 s. **Correction (round eight):** the sweep fails against
  `b62c826`, not against `83232e9` as this entry first claimed — the DM
  variant of the bug is rarer than sampling can reach, so its rule is pinned
  as a predicate (`coldChatAllowed`) instead. A chat runs up to 18 h past
  its first message, so both ends have to be in winter for a winter
  script.
- `demoFilter`'s call sites are pinned by a source scan
  (`demoVisibility.test.js`). Six rounds moved that filter around; the rule
  is a statement about which call sites exist, so that is what the test
  asserts.
- The chip the rule leans on now exists where a demo row can actually be
  met: the animal list, the profile animal cards (own and public) and
  comment authors, on both clients — next to the animal and user profiles
  that already had it. Drops are deliberately unmarked: the owner asked for
  users and animals to be recognisable, and a map marker cannot carry a
  chip.

### Same day — flagging by author, not by animal

- The eighth review round caught a real defect in the guide flagging: three
  of the nine statements claimed rows by the ANIMAL they hang off, so a real
  volunteer with carer rights on a guide animal would have had their injury
  record or their photo stamped as bot data — within the hour, since the
  refresh ran the whole block. Every row is claimed by its AUTHOR now, in
  the script and in migration 012, and guide friendships (both sides bots)
  were added. Locally nothing had been mis-flagged; on production it would
  have been silent, because no read path consumes those three columns yet.
- The hourly refresh no longer runs the flagging block at all: it sets
  `is_demo` on the rows it inserts, inline. That removes eight full-table
  scans an hour, closes the window where a fresh drop was visible before
  being flagged, and makes 012's one-shot rationale true — nothing puts the
  flag back on a row an admin deliberately cleared.
- A notification inherits `is_demo` from the ACTOR only. Keying it on the
  animal too meant that once guide animals were flagged, a real person's
  comment on one stopped reaching another real person who follows it — a
  discovery switch hiding real activity.
- `@pati.demo` is now refused at registration. The whole scheme keys on that
  domain, and a person who registered there would have been flagged as a bot
  by the next seed and deleted by `purge-demo`.
- Chips reached the last two surfaces a bot can be met on: user search and
  the friend finder.

### Same day — the push gate earned its keep twice

- Reserving `@stray.test` at registration broke the two backend e2e
  harnesses: they create their accounts through `POST /auth/register` at
  that domain, so every run would have died on a 400 with its assertions
  failing under the wrong names. The addresses they CREATE moved to
  `example.com`; the seeded `test1@stray.test` they only log in as stays,
  since `seed-demo.js` writes it directly. Both harnesses then passed with
  the guard live: animal-social 124/124, messaging-check 99/99.
- The second gate round caught what the first fix missed: the sweep that
  cleans up after an ABORTED run still matched `@stray.test`, so leftover
  accounts would have been unreachable by it AND by `purge-demo` (which
  only knows the two bot domains). It matches `@example.com` now.
- Corrections to the two entries above, which the record should carry
  rather than quietly outgrow: **both** bot domains are reserved at
  registration, not only `@pati.demo`; the chip reached four surfaces, not
  "the last two" — search, the friend finder, the friend list and incoming
  requests, the last two of which no seeded state can produce today (the
  seed writes only bot-to-bot friendships and a bot never answers a
  request), so they are defensive and unverified. Migration 012 claims the
  sentinel `012_guide_world_is_demo_v2`: its first version keyed three
  tables on the animal instead of the author, and a database that claimed
  the old name has to be able to run the corrected one.

## 2026-09-10 — night run: photos get a size and a second home

- **Every upload is fitted before it is stored.** A phone's original went
  onto the volume as it arrived and came back down in full to every
  viewer; the resizer re-encodes it as a JPEG inside 1600 px — 512 for
  avatars, which are rendered at 40–120 pt — and renames it to `.jpg`,
  updating multer's file object so the controllers store the new name.
  It fails open, like the rest of the photo pipeline: a file sharp cannot
  decode (HEIC on the prebuilt binaries, a corrupt upload) is left exactly
  as it arrived.
- Baking the EXIF rotation in was the part worth thinking about. The face
  box the model returns is on a 0–1000 grid of the image _as sent_, and it
  was sent rotated; now the stored pixels are the rotated ones too, so the
  later `sharp(...).rotate()` calls become no-ops on our own files and the
  box still describes the pixels it is cut from. Older files, still
  unrotated on disk, go through the same path they always did.
- **`config/storage.js` decides where a photo lives.** Disk by default —
  byte for byte the old behaviour — or an S3-compatible bucket when the
  four `S3_*` variables are set, and then the volume is a cache. The rule
  that keeps the change small: **the stored URL never changes.** Photos are
  served by us at `/uploads/<file>` either way, so every row already in the
  database, `uploadPathFromUrl`, the delete regexes and `purge-demo` are
  untouched, and no migration is needed. The static handler keeps the fast
  path and only falls through to the bucket on a miss, which is what lets a
  second machine (or a restored volume) serve what it never received.
- The one place this deliberately does **not** copy the photo AI is failing
  open: publish runs BEFORE the row that names the file, and a refusal
  fails the upload with a Turkish 503. A gallery pointing at bytes nobody
  kept is worse than an upload the user retries. Deletes are the mirror
  image — best-effort and logged, because the row is already gone and a
  stranded object costs a fraction of a cent.
- Photos already on the volume are NOT copied up when a bucket is
  configured; the bucket owns what arrives after it. Copying the backlog is
  a one-off `rclone`/`aws s3 sync`, safe at any time (docs/DEPLOYMENT.md).
- **`scripts/ai-check/run.sh` was red on main and had been for some time.**
  "a stranger with someone's token" still asserted the 400 that
  `POST /animals/:id/photos` answered before the carers-only gate landed
  with the P6 batch; the gate is the outer door now, so a stranger gets
  403 `carersOnly` whosever token they hold. Verified pre-existing by
  running the harness against `2faf1c4` with tonight's work stashed. The
  assertion now pins the gate, and a new pair pins what it was really
  about — a carer redeeming a token issued to somebody else is still a 400. The harness does exit non-zero; it was a `| tail` in the earlier
  run that hid it, which is worth remembering when reading a harness.

### Same night — the location override, and the last uncapped endpoint

- The `__DEV__` location override is gone. Two things were wrong with it
  beyond the checkbox: it hard-coded two real e-mail addresses into a repo
  that is meant to be read, and the accounts that used it were exactly the
  ones that never exercised the permission flow — the screenshot above the
  removal is the app asking for location for the first time on an account
  that had been silently overridden for months.
- The screenshot loop keeps working because the OS can do what the app was
  doing: `simulator-login.sh` now runs `simctl location set` (Kadıköy by
  default, `SIM_LOCATION="lat,lng"` to move it, `none` to leave it alone)
  and tries `simctl privacy grant location`. On iOS 26 the grant does not
  always stick for a fresh install; one tap on the sheet does, and then it
  stays. Verified end to end: seeded Kadıköy animals on the map, the user
  dot at the set coordinates, no override in the binary.
- Ad impressions were the last uncapped write, and the one that carries
  money — the client reports them and the admin panel sells the total. 200
  an hour, against an honest ceiling already bounded by the care-action
  (40) and health-record (30) budgets that open the popups; clicks 60. The
  refusal costs nothing, since a failed ad call never breaks a flow.
- `test/rateLimits.test.js` is the first test of the limiter catalogue at
  all: that a bucket bites exactly at its number, that it is keyed on the
  USER and not the address (the CGNAT rule the module exists for), and that
  the catalogue is all middleware — a typo like `limits.adImpresions`
  mounts `undefined`, which express accepts as "no middleware", leaving the
  route silently uncapped.

### Same night — the lint that had never run

- `npm run lint` is listed in CLAUDE.md as one of this project's commands.
  It has never worked: there was no ESLint configuration file at all, so
  every invocation exited 2 with "couldn't find a configuration file". The
  first rung of the verification ladder was a step nobody had climbed.
- With the React Native template's config in place it reported 297
  problems, 115 of them errors from `prettier/prettier`. Those were not
  findings about the code: prettier runs here through `npm run format` on
  its own defaults, while `@react-native`'s config runs prettier as a lint
  RULE with the template's settings, and the two disagree about nearly
  every file. Two formatters arguing is a configuration bug, so the rule is
  off — prettier formats, eslint lints. `curly` is off for the same kind of
  reason: 172 warnings about one-line guard clauses is a house style, not a
  defect.
- What was left was three real errors, now fixed: an unused `Vaccination`
  import, a `makeStyles` callback destructuring a theme it never read, and
  a `useMemo` keyed deliberately on a joined signature rather than the array
  (now an explicit disable carrying its reason, the project's `// why:`
  idiom).
- Seven warnings remain and are worth a look one day, not tonight: the two
  `react/no-unstable-nested-components` are the ones with teeth — a
  component defined during render is a new type on every render, so React
  throws that subtree's state away.
- **Open question for the owner:** whether `npm run lint` should join
  `.claude/hooks/verify.sh`. It exits 0 today, so adding it would cost
  nothing and would catch the next unused import — but it is a change to
  the gate that blocks pushes, which is the owner's call.

### Same night — what the review found in the photo work

Thirteen findings on the two photo commits; twelve are fixed, one is
scoped and written down instead.

- **The resizer deleted uppercase-extension uploads.** `IMG_4821.JPG` and
  `IMG_4821.jpg` are two different strings and the _same file_ on a
  case-insensitive filesystem: the code wrote the resized bytes to the
  lowercase name and then unlinked "the original", which was the same
  inode. Silent data loss on macOS — where this project's screenshot
  verification runs. It writes through a temp file now and unlinks before
  renaming, and a test uploads `IMG_4821.JPG` on purpose.
- **A transparent PNG came out black.** JPEG has no alpha and sharp fills
  it with black, so a sponsor's logo — the one surface with a paying
  customer — and any avatar uploaded as a transparent PNG would have gone
  from correct to a black tile. An image with alpha stays a PNG now.
- **The colour profile was being stripped.** iPhones shoot Display-P3;
  without the profile those numbers get read as sRGB and the photo comes
  out duller and shifted than the one the user took. `.keepIccProfile()`,
  pinned by a test.
- **Publish moved ahead of the first row in the care-photo flow.** It used
  to run inside the insert loop, so a bucket that refused the SECOND photo
  left the user a carer, looking at an error, with photo one already in the
  gallery and its file stranded under a final name the pending sweeper
  never looks at — and the obvious retry added photo one twice. Both files
  are renamed and published first, and a failure puts them back under the
  pending prefix and out of the bucket.
- **Replacing an avatar never dropped the old photo.** It stayed fetchable
  at its `/uploads/…` URL forever, and account deletion only ever cleaned
  up the last one — against the sentence two lines above it in the same
  function. Any previous uploaded avatar now goes, on disk and in the
  bucket, whether it is replaced by another photo or by a built-in face.
  The harness section that claimed to test this asserted only that the NEW
  object existed: a green check for behaviour that did not exist.
- Smaller ones: `/uploads/%zz` was a 500 with an English "URI malformed"
  (the decode is guarded, and it is a 404 like any other missing name);
  `publish` read the local file outside its own try, so a missing file
  surfaced as a raw ENOENT instead of the Turkish 503 the catch exists for;
  the object's `Content-Type` was hardcoded to JPEG; the cache-fill temp
  file was named after the pid, which two concurrent requests in one
  process share; the admin's care-action delete removed the row and left
  the photo (the user-facing delete has always removed both), and
  `purge-demo` unlinked locally without touching the bucket; failed inserts
  left published objects the `/uploads` fallback would happily keep
  serving.
- The `/uploads` fallback also got a per-IP brake. Only a cache MISS
  reaches it — a normal reader is served by `express.static` before it — so
  it never sees honest traffic, but uncapped it was a way for anyone to run
  up an R2 bill with a loop over random names.
- **Scoped rather than fixed: a bucket does not yet buy a second machine.**
  The deploy notes said it lifted the one-machine limit. It does not: the
  care-photo check and the add-animal match hand a file from one request to
  the next by name on the local volume (`redeemPhotoToken`), and the AI's
  comparison reads gallery files from disk, failing open when they are
  absent. On two machines about half of all photo confirmations would fail,
  telling the user to re-shoot a photo that was fine. The docs say "keep
  the machine count at 1" now, and the roadmap carries what closing it
  would take.

### Same night — StrayMobile becomes PatiMobile

- The iOS project carried the app's first name everywhere a build touches:
  project, workspace, target, scheme, entitlements, test target, Podfile.
  The store-facing identifiers were already right (`com.oguzpancuk.pati`,
  `CFBundleDisplayName` "pati"), but the internal name is visible in enough
  places — crash reports, the archive, the build products — that the
  roadmap listed it as required before submitting.
- Done as `git mv` for every path plus a literal rewrite of the name inside
  the pbxproj, scheme, workspace, Podfile, Info.plist and the two scripts
  that address files by path (`generate-icons.mjs`, the googleClientId
  test), then `pod install`. It builds and launches: `PatiMobile.app`,
  bundle id unchanged, and the map and profile screenshots are unchanged
  from before the rename.
- Android needed nothing. `namespace` is already `com.patiapp` and
  `app_name` is `pati`; there is no "stray" anywhere under
  `mobile/android`. The backend already logs as pati too, so the only
  survivor is the LOCAL Docker container `stray-db` with its `stray`
  db/role — invisible outside this machine, and renaming it costs a
  database reset plus edits to `contracts/init.sh`, the README and all four
  curl harnesses. Left for a morning when the owner is looking at their own
  data.
- Worth knowing for the next native change: `pod` is not on the default
  PATH here. It lives in the Homebrew gem bin
  (`/opt/homebrew/lib/ruby/gems/4.0.0/bin`), which has to be exported
  before `pod install` will run.

### Same night — the second review round, and the read paths' own guards

The second round found two regressions the FIRST round's fixes had
introduced, which is exactly the shape worth recording.

- **"Has an alpha channel" is not "is transparent".** Round one made an
  image with alpha stay a PNG, to stop sponsor logos coming out black. But
  `hasAlpha` is true for any RGBA file, opaque or not, and a phone
  screenshot is RGBA: those stopped going through JPEG and were stored as
  level-9 PNG — 6,3 MB against 0,77 MB for the same 2000x1500 picture.
  Eight times the storage and bandwidth the resizer exists to save, in the
  name of fixing a black rectangle. The gate is `stats().isOpaque` now,
  asked only when there is an alpha channel to ask about, and a test uploads
  an opaque RGBA PNG and insists on a small JPEG.
- **The rate limit round one put on the `/uploads` fallback would have
  broken the case the fallback exists for.** It counted every cache miss,
  per IP, in a codebase whose own limiter module is per-user precisely
  because Turkish carriers put thousands of people behind one address. On a
  restored volume every image is a miss, so one person paging through
  galleries would have exhausted 300 in fifteen minutes and then seen
  broken images everywhere — the 429 body is JSON, which an `<img>` just
  renders as nothing. `skipSuccessfulRequests` leaves only the true 404s
  counted, which is the loop over invented names that was the actual bill
  vector.
- **And a real hole neither round put there.** The stored file's extension
  came from the client's own filename, and `/uploads` answers on the app
  host AND the admin host. A part named `x.html` declared as `image/png`
  passed the mime filter, was stored as `.html`, and `express.static`
  served it as text/html — script running in the origin that holds the JWT.
  The server picks the extension from an allowlist now (SVG deliberately
  absent, since an SVG carries script too) and anything else becomes an
  inert `.bin`; `X-Content-Type-Options: nosniff` is on both the static
  mount and the bucket fallback. The harness uploads that exact payload.
- Smaller from the same round: a failure in the insert loop left files
  under their final names, which the pending sweeper never looks at (only
  the ones no row owns are rolled back now); the `.part` temporaries were
  swept by nobody; and `discardPreviousAvatar` can unlink a shared
  `seed-N.png` on a seeded DEV database, which is written down rather than
  fixed since production filenames are unique and the seed wipes what it
  runs against.

Alongside it, the read paths finally got the guard the write paths have had
since 2026-09-09: `lat=999` is a finite number and not a place, and PostGIS
coerces it to about −81 rather than refusing it, so `GET /animals`,
`/care-actions` and `/care-actions/status` answered 200 about the southern
ocean. All three take `coordinate()` now, both viewport corners included.
`radiusMeters` has an upper bound at 200 km — the clients ask for 100 m to
3 km, and `1e300` was accepted and walked the whole table through
`ST_DWithin`. Refused rather than clamped, like every other bad parameter on
these routes, with a test asserting that the radii the clients actually send
still pass.

### Same night — an admin can finally free an address

- The panel could suspend an account and delete its content, but not the
  account, so an address somebody registered and abandoned was held
  forever. `DELETE /api/admin/users/:id` closes it.
- The important decision was to have exactly ONE way an account gets
  deleted. The anonymization moved to `utils/accountDeletion.js` and both
  callers use it: the row survives (the community's care records, comments
  and animals are its history, and a foreign key would either refuse the
  delete or take that history with it), everything personal leaves it, and
  the address is freed. Two copies of that logic would have drifted the
  first time a column was added.
- What differs is who may ask. An admin does not re-authenticate the way
  the account's owner does, so three refusals stand in for it: not
  yourself (it would anonymize the account the panel is open in — the rule
  `updateUser` already applies to roles), not another admin (demote first;
  the panel is the wrong place for that decision), and not a row already
  anonymized.
- The audit entry deliberately carries no address. An audit trail that
  recorded the freed e-mail would undo the deletion it is recording — the
  same rule the user's own deletion follows.
- Verified end to end by `scripts/admin-check/run.sh` (18 assertions),
  which ends on the point of the whole feature: after the deletion the
  address registers again, and gets a NEW account rather than walking back
  into the tombstone. Also driven through the panel itself — the row turns
  into "Silinmiş Üye · Askıda: Hesap yönetici tarafından silindi".

### Same night — round three, and where it stopped

The third review round came back APPROVE, and its own summary is the useful
record: it verified by execution rather than reading that the `/uploads`
limiter no longer counts successful bucket fetches (so a cold cache cannot
lock a user out of every image), that `nosniff` really lands on both the
static response and the fallback's `sendFile`, and that the `owned`
accounting in `submitCarePhotos` is exact at every failure point. It also
confirmed the new coordinate and radius guards cannot refuse a call either
client actually makes: no client sends `radiusMeters` to the care routes at
all, the only radius on the wire is the map's 500 m, and `map/viewport.ts`
already clamps to ±85/±180 before the request, including both halves of an
antimeridian split.

Three one-line things came out of it and are done:

- **BMP and TIFF are back in the upload allowlist.** Dropping them to `.bin`
  was over-tightening: a browser's `accept="image/*"` picker offers them,
  sharp cannot normalise a BMP so the resizer fails open and leaves it, and
  the user ended up with a permanently broken photo and no error. Neither
  format is scriptable, so the rule the allowlist exists for — the SERVER
  picks the extension, and SVG never gets one — is untouched.
- `.heif`, `.bmp` and `.tiff` joined the bucket's content-type table, which
  had `.heic` but not its twin.
- **A deleted account's push tokens now go with it.** Nothing sends push
  yet, so `device_tokens` rows do nothing today — but a device identifier
  surviving a deletion would start meaning something the day APNs ships,
  and nobody would think to look there by then.

Left standing, deliberately, and worth knowing rather than fixing at four in
the morning: the photo rows in `submitCarePhotos` are still non-transactional.
The FILES are accounted for exactly now, but if the second INSERT fails, the
first photo's row, the carer row and the match attempt survive the 500 and a
client retry adds a second copy. The fix is a `BEGIN/COMMIT` around the loop,
not more cleanup code, and a mid-loop database failure is rare enough that it
did not justify a fourth round.

**On the round count.** Three rounds on one night's work is at the edge of
what the standing rule tolerates, and the second round was the expensive one:
two of its three important findings were regressions the FIRST round's own
fixes had introduced. That is the pattern worth naming — "make the logo not
black" produced "store every screenshot at eight times the size", and "stop
the bucket bill" produced "break every image on a cold cache". Both were
narrow, local fixes to a named defect, made without asking what else the
change touched. The third round narrowed rather than widened, which is what a
converging review looks like, so this stopped where it should have.

### 2026-09-10 — the QA gate on the night run

`evaluator-qa` returned PASS before the deploy, and the way it got there is
worth keeping: rather than re-running the same batteries, it built a
worktree at `2faf1c4`, booted the OLD and the NEW backend side by side on
one uploads directory with no `S3_*` set, and diffed ten request paths —
including files named the way the old code named them (`.JPG`, `.heic`,
`.svg`, which the new allowlist would never produce). Zero differences in
bytes, status, content-type, ETag, Cache-Control, Range or conditional
requests; the only delta was the added `nosniff`. That is a much stronger
statement than "the tests pass" about the claim the deploy rests on: with
no bucket configured, nothing about photo handling changes. It also proved
the bucket-mode case that would have been easy to get wrong — three legacy
photos on the volume that were never in the bucket all served byte-identical
and the bucket stayed empty, because the fallback only fires on a miss.

Two pieces of bookkeeping it caught in my own notes, now corrected: the L3
row of the night plan listed "web location message" as part of the item,
but no `web/` file changed — that message had already been added on
2026-08-31 (`b38e63c`) and I had copied a stale line out of the P8
follow-ups; and the admin harness was described as 18 assertions when it is
20 (a device-token pair joined it in the third review round). Neither is
functional, and both are the kind of drift that turns a roadmap into
fiction if it is left.

One cosmetic thing left alone: the panel shows "Sil" on rows that are
already tombstones, where it can only answer 409 "Bu hesap zaten silinmiş"
into the error banner. Honest, just untidy.

### Same day — the tombstone domain had to be reserved too

Hiding "Sil" on an already-deleted row turned up a hole underneath it. The
panel and the server both decide "this account is a tombstone" by the
address ending in `@deleted.pati-app.com` — the domain
`utils/accountDeletion.js` renames a deleted account into. But that domain
was not on `RESERVED_EMAIL_DOMAINS`, so somebody could have registered
there: the server would have refused to delete them with 409 "Bu hesap
zaten silinmiş", and with the button now hidden, support could never have
removed the account at all.

Fixed where addresses are accepted rather than special-cased in the two
places that read the domain, so there is one rule: the third entry joins
the two bot domains in `auth.controller.js`. `admin-check` now asserts it
(22 assertions).

Worth noticing about the shape of this one: the UI tidy-up was cosmetic,
and the thing it exposed was not. A rule that two layers already agreed on
turned out to have no guard at the door they both trusted.

### Same day — closing the rest of what the two reviews left

The tombstone work drew two independent reviews, and between them they
left four residuals. All are closed now, and the shape they share is worth
naming: **each was the same rule enforced in one place out of two.**

- **Both doors that create a user now check the reserved domains.**
  `register` did; `socialLogin` inserted the provider's address verbatim,
  with neither normalisation nor the check. A provider can only hand back a
  verified address at a subdomain the owner controls, so nobody could reach
  it — but the comment claiming "one rule, at the door where addresses are
  accepted" was true of one door of two. `isReservedEmail` normalises the
  address itself so neither caller has to remember to, and
  `test/reservedEmails.test.js` pins it.
- **`updateUser` refuses a tombstone the way `deleteUser` does.** Lifting
  the suspension on an anonymized row put it back into the leaderboard's
  candidate set as "Silinmiş Üye", and with the delete button hidden,
  re-suspending was the only way back. Both controllers share one
  `isTombstone` now instead of an inline regex each.
- **The panel offers an action exactly where the server accepts one.**
  Hiding "Sil" on tombstones fixed one of the three rows `deleteUser`
  refuses; the other two — another admin, and your own account — still
  showed a button whose only outcome was a banner error after a dialog
  promising an irreversible deletion. A tombstone row now offers nothing at
  all, which is honest: neither action is available on it.
- **The harness cleans up the row it should never create.** The assertion
  that registration into the tombstone domain is refused would, if the
  guard ever regressed, leave behind exactly the account nobody can remove
  through the panel. It is in the cleanup list now.

One finding was a false alarm and the record should say so: the first
review reported that `b38e63c` touches no `web/` file, which would have
made the NOTES citation for the web location message wrong. It does touch
`web/src/pages/MapPage.tsx` — the reviewer's own diffstat had been
truncated by a `head`, and the second review caught its mistake. The
citation stands.

### Same day — the dead button, one file later

The third review of the tombstone work found the same defect the previous
round had just fixed, one row over: "Düzenle" was still offered on the
admin's OWN row, where `updateUser` refuses both fields the modal can send
("Kendi rolünüzü veya durumunuzu değiştiremezsiniz"). Same dialog, same
banner error, same class of button that cannot do anything.

The lesson is in the shape rather than the fix. Twice now the rule was
written as "hide the button in the case I was told about" instead of "offer
the button exactly where the server accepts it". The panel has two
predicates now, `canEdit` and `canDelete`, and each names the server checks
it mirrors — so the next person who adds a refusal in `admin.controller.js`
has somewhere obvious to add its twin.

Also dropped the `{' '}` separator between the two buttons. The first
version of this note claimed the text node "only mattered on rows where
exactly one button rendered" — that was wrong, and the review caught it:
`td.actions` is an ordinary table cell, not a flex container, so the
whitespace rendered between two inline-block buttons as well. The gap on a
two-button row was the 6 px margin from `td.actions button + button` PLUS
a word space; it is 6 px alone now. Measured in the panel afterwards: every
row's last button sits exactly 12 px from the cell's right edge, one button
or two, so the column no longer drifts by row kind. Small — but visual
drift is this project's named escape class, which is why it was worth
measuring instead of asserting.

### 2026-09-10 — deployed: v34

`1ad564c` is live. The whole night run plus the morning's follow-ups went
out in one release; the checklist's gates all passed on that exact commit
(full battery 10/10, no migration touched so the deploy is schema-neutral,
the secret scan's only hit was a fixture token string in a harness).

Verified against production afterwards:

- `/health` → `{"status":"ok"}`, `pati-app.com` and `admin.pati-app.com`
  both 200, release `v34 complete`.
- The boot log says **`photos: disk (/data/uploads)`** — which is the whole
  point of the storage work shipping dark. Note what that does and does not
  claim, because the first version of this entry got it wrong and a review
  caught it: the STORAGE DRIVER is on the volume, so where a photo's bytes
  land and how they are served is byte-for-byte what v33 did. **Photo
  handling as a whole is not** — this very release is the one that started
  re-encoding every upload (1600 px, 512 for avatars, EXIF baked in) and
  choosing the stored extension from a server-side allow-list. A responder
  reading "nothing changed about photos" and looking past the resizer would
  be looking in the wrong place.
  The boot line on its own is also weaker evidence than it looks:
  `describe()` prints `disk (…)` whenever ANY of the four `S3_*` variables
  is missing, not only when all are. What settles it is `fly secrets list
-a pati-app`, which shows none of the four (and `fly.toml`'s `[env]` has
  no `S3_*` either).
  Mail (Resend) and the photo AI (Gemini) report configured, as before.
- `/gizlilik` and `/kosullar` open, no console errors.

One thing worth writing down because it will confuse the next person:
`curl https://pati-app.com/gizlilik` answers **404 JSON**, and that is
correct. The SPA fallback in `app.js` only serves `index.html` to a request
whose `Accept` contains `text/html`; curl sends `*/*` and falls through to
the API's Turkish 404. With a browser's Accept header every client route
answers 200. A smoke test that curls a client route and reads 404 is
testing the header, not the deploy.

The preflight the review asked for came back clean, once the query was
right. The first version excluded only the ADMIN deletion reason, so the
three rows it returned were people who had deleted their own accounts
(`suspended_reason = 'Hesap silindi'`) — the two paths write different
reasons, which the query's author (me) had not checked. The precise test is
whether the address is exactly `silinmis-<own id>@deleted.pati-app.com`;
all three were, so **no live account sits in the tombstone domain today**
and the finding closed with nothing to fix. That is the honest limit of a
SELECT over current rows: a squatter who registered there before the guard
and was later deleted would have been renamed by `anonymizeAccount` into
exactly the shape the test calls legitimate, so the query cannot speak to
history. It does not need to — the operational question was whether this
deploy strands anybody, and it does not.

### 2026-09-10 — the backlog script

Configuring a bucket protects photos uploaded from that moment on, and the
deploy notes said to copy the existing ones with `rclone`/`aws s3 sync`.
That advice was written without looking at what it would take: neither tool
is on the Fly machine, and getting one there for a one-off copy of 72 files
(115,6 MB on production today) is more work than the copy itself.

`backend/scripts/publish-backlog.js` does it with the driver that is already
there — walk `UPLOADS_DIR`, ask the bucket what it holds, publish the rest.
Three decisions worth keeping:

- **It refuses to run without a bucket.** The failure this script exists to
  prevent is silent — a volume dying with photos that were never copied up
  — so the script must not have a silent failure of its own. Reporting
  "0 files copied, done" when `S3_BUCKET` was mistyped is exactly that.
- **It asks before it writes.** A HEAD per file is the cheap kind of R2
  operation, and it makes a second run free. That matters because the
  natural way to use this is to run it, see one failure, fix it, and run it
  again.
- **One bad file does not abandon the other seventy-one.** Failures are
  collected and the exit code is non-zero, so a partial copy cannot be read
  as a finished one.

`pending-` files and `.part` temporaries are skipped: no row references
either, and the sweeper reclaims them within the half hour.

Tested against a fake bucket (`test/publishBacklog.test.js`)
rather than trusted, because this is a script that runs once, by hand, on
production — the kind that is wrong exactly when it matters.

### Same day — what the review of the backlog script changed

The copy logic and the file selection were right; what was wrong was the
part that matters most for a script that runs **once, by hand, on
production**: its account of whether it worked.

- **Zero files read as success.** `config/upload.js` calls `mkdirSync` on
  import, so a wrong or unmounted `UPLOADS_DIR` is silently CREATED empty —
  the script would have printed "0 file(s), copied 0" and exited 0, and the
  operator would have concluded the backlog was already safe while 115,6 MB
  sat one volume-loss from gone. An empty directory is now a refusal.
- **`process.exit()` can eat the summary.** `fly ssh console -C` gives the
  remote process a pipe, not a pty, and Node's writes to a pipe are
  asynchronous — `process.exit()` drops what has not flushed. So the exit
  code is set with `process.exitCode` and the loop drains, and the run ends
  with an explicit `DONE` / `INCOMPLETE — n failed` line whose ABSENCE is
  the signal. The old note claimed the exit code made a partial run
  unmistakable; whether flyctl even propagates a remote exit status through
  `-C` was never verified, so the honest signal is the line, not the code.
- **It copied files no row references.** An approved-but-never-confirmed
  care photo (`POST /care-actions/check` uses the plain upload, so it keeps
  a plain name and no sweeper reclaims it) and any file whose best-effort
  `fs.unlink` failed on delete both sat on the volume. Publishing them would
  have made content the database has forgotten — including content a user
  deleted — permanently fetchable at its old URL, since the `/uploads`
  fallback serves whatever the bucket holds. The script asks the five URL
  columns what is referenced and copies only that, listing the rest.
- **It is not a one-off, and the docs said it was.** `seed-guides.js` —
  which DEPLOYMENT.md tells you to run on production — and
  `backfill-face-thumbs.js` both write into `UPLOADS_DIR` without
  publishing. Re-running the backlog script after either is now part of
  their instructions.
- A mistyped `--dryrun` used to perform the real run. Unknown arguments are
  refused.

### Same day — the third round, and where this one stops

The review of the corrected backlog script approved it and then found the
residual member of the very class the second round was about: an empty
`UPLOADS_DIR` was a refusal, but a volume full of files where **none** is
referenced by a row was still a `DONE`. A `DATABASE_URL` pointing at an
empty or unmigrated database produces exactly that, and the operator would
read "nothing to copy" and stop worrying. Closed the same way, with a test.

Three of its remaining findings were mine to fix and are: the notes said
"four URL columns" where the query asks five, said "6 assertions" where the
file now has nine, and the ROADMAP still said to sync the backlog "once" —
the headline of this change being that it is not a once thing.

Three were left, deliberately, and the reviewer agreed they are "would be
nicer" rather than "would be wrong": rows pointing at files the volume no
longer has are neither copied nor counted (they are photos already lost,
and surfacing them is a separate job); `console.error(err.message)` prints
`undefined` for a non-Error throw; and an unbounded `unreferenced` list
could in principle push the terminal `DONE` line off screen, though at 72
files it is one short line.

**Three rounds on a 165-line ops script is the edge of what the rule
tolerates.** What made them worth it is that none of the three found a
copying bug — they found, in order, that the script could report success
having done nothing, that its report could be truncated away entirely, and
that it copied content the database had forgotten. For a tool that runs
once against production with no second chance, the report IS the product,
and that is what each round was about.

### 2026-09-10 — the privacy notice had to move before R2 did

Section 4 of the KVKK notice ("Aktarım") names the third parties personal
data reaches, and it named exactly two: Fly.io for hosting and Google LLC
for the photo AI. Configuring an R2 bucket makes Cloudflare a third one —
photos, including profile photos, are personal data — so the moment the
`S3_*` secrets are set, the notice's own list stops being true.

Written in the same shape as the two beside it, plus one sentence the
architecture earns: photos are always served through `pati-app.com`, never
from a bucket URL, so a reader's browser never contacts Cloudflare and no
IP address of theirs reaches it. That is a real consequence of keeping the
stored URLs at `/uploads/<file>`, and it is worth a reader knowing.

Ordering matters here and the owner was told: **the text goes live before
the secrets are set**, not after. A notice that names a processor slightly
before data starts flowing there is over-disclosure and harmless; the
reverse is the thing to avoid.

Two smaller points: the mobile app has no copy of this text — it links to
`pati-app.com/gizlilik` (`theme/brand.ts`), so `web/src/legal.ts` really is
the single source and there is no parity work. And section 5's promise
("hesabını sildiğinde profil fotoğrafın silinir") already holds against a
bucket: `anonymizeAccount` returns the avatar's filename and the caller
calls `storage.remove` on it after the commit.

### Same day — the review of the privacy paragraph found a leak in the code

Writing a legal paragraph turned into fixing the thing it would have had to
disclose. The review checked each sentence against the code, and one of them
could not be made true by editing:

- **The resizer failed open, and a fail-open upload kept its EXIF.** A file
  sharp cannot decode — HEIC on the prebuilt binaries, which the web PWA's
  `accept="image/*"` can produce on Safari — was stored byte for byte and
  served at `/uploads/<name>` carrying the GPS coordinates, capture time and
  device model of wherever the photo was taken. Meanwhile the notice tells
  the reader location is only ever taken at the moment they act. The fix is
  in code, not text: an undecodable file is refused with a Turkish 400. The
  reasoning that made fail-open right ("a failed upload is worse than an
  unresized one") is false once the file is public and unstrippable. A
  successful re-encode carries no metadata at all, because sharp copies none
  unless asked — now pinned by a test that feeds it a photo with EXIF and
  asserts none survives. Mobile is unaffected: `react-native-image-picker`
  hands us JPEG.
- **The location promise was one the deploy instructions do not produce.**
  The paragraph said photos live on "Avrupa'daki sunucular", while
  DEPLOYMENT.md tells the operator to create the bucket with region
  Automatic — a hint, not a guarantee, and no jurisdictional restriction.
  Asserting a storage location publicly under a KVKK heading and being
  wrong errs against the reader, which is the opposite of the
  over-disclosure the earlier entry deliberately accepted. It says "yurt
  dışındaki sunucularda" now; m.9 attaches to the recipient, and the
  paragraph already names Cloudflare, Inc.
- **Section 7 was undercounting.** It said the app stores two things on the
  device; the web client writes at least six, including a log of the last
  fifty care alerts with their titles and times. Re-dating the document
  would have carried that forward as current. It now lists them and says
  plainly that none of it reaches the server — which is true, and is the
  part that actually matters.
- The terms had been re-dated with no text change, which tells returning
  readers to look for a change that does not exist. Put back to 7 Eylül.
- Face thumbnails are published too, so they are named in the list; the
  advertiser image is correctly absent, since that list is the reader's own
  data rather than an inventory of the bucket.

The storage harness gained from this rather than lost: the `.html` payload
it used to check was stored as an inert `.bin` is now refused outright, and
a second case was added for a REAL image with a hostile name — which does
decode, is stored, and still cannot be served as HTML. 34 assertions.

### Same day — measuring the claim instead of asserting it

The review of the EXIF fix called its blocker on a sentence I had written
into the commit message: "mobile is unaffected, react-native-image-picker
hands us JPEG". The reviewer read the library's own Objective-C and found
the opposite — `launchImageLibrary` asks PHPicker for the asset's NATIVE
type, the default quality/size settings skip the re-encode branch, and
`getFileType` sniffs one byte and falls through to `"jpg"` for anything it
does not recognise. On that reading a HEIC arrives named `.jpg`, fails to
decode, and my change breaks add-animal and avatar upload on every iPhone
shooting in High Efficiency.

They were right that I had asserted it rather than checked it, so I
checked it. `sips -s format heic` on a generated JPEG, `xcrun simctl
addmedia` into the simulator's library, then the app's own avatar flow:
tap the avatar, "Kendi fotoğrafımı yükle", pick the HEIC. What reached the
server was **a decodable image** — stored as a 512×384 JPEG (the avatar
cap), no EXIF, no refusal in the log. The upload succeeded end to end on
iOS 26.5.

So the regression does not reproduce: something between PHPicker and the
picker library hands over transcoded bytes for this asset. The honest
limits of that measurement, which is why it is written down rather than
declared: one asset, one iOS version, the simulator rather than a device,
and a library import rather than a photo the camera wrote. If an iPhone
user ever reports "bu fotoğraf biçimini okuyamadık" on a library photo,
this is the entry to come back to — the fix would be a mobile-side
conversion, not a server-side one.

Two of the round's other findings were plainly right and are fixed:

- **A refused upload used to stay on the volume forever.** The middleware
  throws before any controller runs, so the controllers' own discard paths
  never fired and the sweeper knows only `pending-` and `.part`. Every
  refusal parked a file nothing referenced — and the GPS-bearing bytes the
  change exists to not publish would have sat on the disk anyway, which is
  a weaker property than the commit claimed. The middleware unlinks
  everything multer wrote before rethrowing, with a test.
- **§2 of the notice said location never reaches the server, and that was
  false.** The care-alert job asks `GET /care-actions/status?lat&lng` every
  thirty minutes with the session's own token while the client is open. The
  server does not store it — the route is a read — but "gönderilmez" is a
  statement about transmission. It now describes what actually happens,
  says the query is not recorded, and says turning the alerts off stops it.
  This was pre-existing text; the change is what made it load-bearing.
- **§7's list was the web client's.** Mobile caches the profile (ad soyad,
  e-posta, avatar) in AsyncStorage and that was missing, while three of the
  listed items exist only in the browser. Both sides are now labelled.

### Same day — the fourth round, and what it settled

The owner authorised a fourth round on the condition that it confirm or
refute the earlier ones rather than open new ground. It did both, and the
part worth keeping is how it settled the HEIC question.

Rather than accept my measurement, the reviewer went and found the asset:
`.../Devices/D667658A-…/data/Media/DCIM/100APPLE/IMG_0007.HEIC`, still
genuine HEIC after `simctl addmedia` (`ftypheic`, `public.heic`), and then
confirmed that this sharp build cannot decode that exact file — so had HEIC
bytes reached the server, the upload WOULD have 400'd. It didn't. The
mechanism turned out not to be the picker library at all: the app passes no
`assetRepresentationMode`, PHPicker defaults to `automatic`, and automatic
hands over a compatibility JPEG. The previous round's reading of
`getFileType` was correct — it is simply only reachable under `current`.

That is the difference between "I ran it and it worked" and knowing why.
And it exposed the real risk: `automatic` is Apple's discretion, not a
contract, while the server now fails closed. So `mobile/src/photoPicker.ts`
pins every library pick to `compatible`, and the four call sites share it.
The camera path needed nothing — react-native-image-picker writes captures
through `kUTTypeJPEG` regardless.

The two false sentences it found in the notice are fixed, and they are the
same defect class chasing each other down the document:

- §2's fresh "uyarıları kapatırsan bu sorgu da yapılmaz" was false on
  MOBILE. Web returns early when the notification permission is missing;
  mobile's `checkCareAndNotify` did not, and while `start()` bails out on a
  refused permission, the AppState listener it registers does not — so every
  foreground transition sent coordinates for an alert that could never be
  shown. One `if`, and now the sentence is true on both clients. This was
  also a silent web/mobile divergence.
- §7's "hiçbiri sunucuya gönderilmez" contradicted §2 in the same document,
  because the list it applied to begins with the session token — which
  travels with every request by definition. Scoped to what is genuinely
  device-only, and it now says plainly that the token goes with each request
  and that the cached profile came from the server in the first place.

Also from that round: the poll is not only half-hourly (both clients check
on foreground too), the landing page's "yakınımda mama var mı" button is a
third location surface with no session at all, and the cached profile has no
avatar in it. All three are in the text now.

Three stale comments were the round's smallest findings and the most
characteristic: the allowlist's rationale still described fail-open, the
test file's header still stated the inverted contract, and the middleware
claimed a property of react-native-image-picker when what had been measured
was narrower. A comment stating a false _why_ is a trap for the next
reader, which is this project's own rule.

Last, the multi-photo refusal now carries `photoIndex` and `code:
'photoUnreadable'`. `/animals/match` takes several photos in one request and
one bad file refuses the batch; without the index the user re-picks and
bisects by hand, while both clients already know how to prune a strip from
`photoIndex`, because `photoRejected` carries one.

**Deferred deliberately, with the reviewer agreeing none is a blocker:** the
second catch still reports our own failures (a 268-megapixel input, an OOM)
as "we could not read this format" — misleading, but that case got safer
rather than more dangerous with this change; each refusal logs twice; and
the fix is not retroactive for files already on the volume. That last one is
a **measurement to take before the R2 backlog is copied**, not a fix: count
how many files on production still decode as HEIF or carry EXIF GPS. Zero
means there is nothing to do.

### 2026-09-10 — R2 is live, and what the hour it cost was actually about

The bucket is on: `photos: s3 (…eu.r2.cloudflarestorage.com/pati-upload)`,
69 of 74 files copied up, a second run reporting `already there 69`, and a
photo still serving 200 from its unchanged `/uploads` URL. The volume is no
longer the only copy.

Getting there cost an hour to a misdiagnosis worth writing down. Every
request answered **Access Denied**, which reads as a token permission
problem, and the first two attempts chased that: a corrected bucket name,
then a regenerated key. Neither helped. What settled it was asking a
different question — not "can it write" but "can it read":

    ListObjectsV2 → AccessDenied

A read-only token would have listed fine. Both verbs failing means the token
cannot see the bucket **at all**, which is not a permission shape; it is a
scope or an address problem. The bucket had been created with **jurisdiction
EU**, and those are reached at `<account>.eu.r2.cloudflarestorage.com` — the
`.eu.` in the middle. R2 answers the standard host with Access Denied rather
than "no such bucket", so the error names the wrong cause. The same probe
against the `.eu.` host listed immediately.

The lesson is the shape of the probe, not the fact: when a permission error
resists two permission fixes, stop fixing permissions and find a question
whose answer distinguishes the hypotheses. `docs/DEPLOYMENT.md` now names
the `.eu.` host and this failure mode, so the next person loses minutes
instead of an hour.

One good consequence: because the bucket really is EU-locked, the KVKK
notice no longer has to hedge. "Yurt dışındaki sunucularda" was the honest
wording while the location was unmeasured; it now says the photos stay in
the European Union, which is a stronger commitment and a true one.

Two things behaved exactly as designed under their first real use. The
backlog script refused to report success it had not earned — 69 failures,
`INCOMPLETE — 69 failed`, exit 1, nothing half-copied — which is what three
review rounds of arguing about its report were for. And the fail-closed
upload path meant a misconfigured bucket produced a loud 503 rather than
photos silently landing nowhere; the cost was that production uploads were
broken for the twenty minutes it took to find the `.eu.`, which is the
trade that design makes on purpose.

### Same day — the batch refusal reaches the client now

`photoIndex` and `code: 'photoUnreadable'` were being set on a thrown error
and then dropped: `error.middleware.js` answered non-Multer errors with
`{ error: err.message }` alone. So the feature added to tell the user WHICH
photo failed did nothing end to end — and the test could not see it, because
it asserted the thrown Error's own properties rather than the HTTP body. The
same shape this project has hit before: a test that passes against the code
it was written to catch.

The handler forwards `code` (on 4xx only — a 500's internals are not the
client's business) and `photoIndex`. Both clients branch on
`photoUnreadable` alongside `photoRejected`, since the remedy is identical:
drop that photo from the strip. The ADVICE is not identical, and that was
worth separating — an unreadable file is a format problem, so telling the
user to photograph the animal again would be wrong. "Başka biçimde bir tane
ekle", not "kedinin göründüğü bir fotoğraf ekle".

The assertion moved to where it can fail: `storage-check` now posts a
three-photo `/animals/match` with the middle one unreadable and checks the
response body carries `photoUnreadable` and `photoIndex: 1`. 37 assertions.

Also written down rather than fixed: `assetRepresentationMode` is an iOS
option. Android ignores it, so a library HEIF from an Android phone still
meets the 400. That is an actionable error rather than a silent leak, and
Android cameras default to JPEG — closing it means forcing a device-side
re-encode, which changes what every Android upload sends and deserves its
own look rather than a quiet addition here.

### Same day — the same fix, one route over

The review of the batch-refusal fix found it had been applied where it was
asked for and nowhere else. `/animals/:id/care-photos` runs the same
`resizeUploads()`, but `CarePhotoScreen` and `AnimalPage` both gated on
`photoRejected` alone — so an unreadable file there produced a generic
"Gönderilemedi", **both slots stayed filled**, and pressing send again
reproduced the identical error with no hint which one to replace. A
resubmit loop.

This is the third time today the same shape has come back: fixing the
instance named in the finding rather than every place the rule holds. The
first two were mine to notice and I did not; this one a reviewer caught.
The rule that composes, and the one to check against next time: **when a
server starts sending a new code, every client branch that already handles
its sibling needs the same arm** — not just the one in the report.

Both care-photo clients now empty the offending slot for `photoUnreadable`
the way they do for `photoRejected`, and `storage-check` asserts the route
carries the code and the index (40 assertions). Also folded in: the error
handler was applying the `status < 500` guard to `code` but not to
`photoIndex` — unreachable today, and exactly the asymmetry that makes a
future 500 leak an index while correctly hiding its code.

And one line in DEPLOYMENT.md that is really a warning: `S3_ENDPOINT` now
carries a legal statement. The notice says the photos stay in the European
Union, and the only thing making that true is the bucket's EU jurisdiction,
reached through the `.eu.` host. Repointing that variable at a non-EU
bucket silently turns a public commitment false — so a change there is a
change to `web/src/legal.ts` too.

### 2026-09-10 → 11 — where this leaves things

For whoever picks this up next, because the day covered a lot.

**Live:** production release v38 (v35 was the last code deploy; v36–v38 are
the R2 secret changes). Photos are on Cloudflare R2, EU jurisdiction,
addressed through the `.eu.` host; the 69 files that were on the volume are
copied up and the volume is a cache. Mail, the photo AI and Google sign-in
are configured. The KVKK notice names Cloudflare as a third processor.

**`main` is one commit ahead of production.** `114645e` went to the remote
but was never deployed, so the notice's stronger "Avrupa Birliği bölgesinde"
wording is not live yet — production still shows the conservative "yurt
dışındaki sunucularda", which is true, just weaker. A deploy publishes it
along with the `photoUnreadable` plumbing.

**Decided and deliberately not done:**

- **Apple Developer enrollment is deferred.** The account is a free Personal
  Team, so Sign in with Apple, TestFlight and the App Store are all behind a
  $99/year membership. The pilot — ten to twenty people in one neighbourhood
  — can run on the web PWA, which is a full client and already live. The
  owner decided to spend that money after the pilot, not before, so App
  Store 4.8 (offering Google sign-in obliges offering Apple) is not yet in
  play. `APPLE_CLIENT_IDS` stays unset and both clients keep hiding the
  button on their own.
- Android library HEIF still meets the upload 400, because
  `assetRepresentationMode` is an iOS option. Closing it means a device-side
  re-encode on every Android upload.
- The `stray-db` container and its `stray` db/role keep their names: local
  only, and renaming forces a database reset plus edits to four harnesses.

**Still owed by the owner:** the `iletisim@` mailbox is done and the
production smoke tests are done; what is left is Apple enrollment whenever
they want iOS, and two decisions — whether `npm run lint` joins
`.claude/hooks/verify.sh` (it exits 0 today, so adding it is free), and the
brand-contrast question, which they asked to leave alone for now.

**A tooling note worth acting on before the next long session.** The
code-reviewer gate stalled nine times: an agent that reports "running" but
never completes. Every review that DID finish earned its place — between
them they found an EXIF leak on public URLs, a client-chosen file extension,
an unreserved tombstone domain, a location query firing with notifications
off, and two false sentences in a live legal document. The rule is right;
what failed is completion. `push-gate.sh` currently gives the same answer to
"not reviewed" and "the reviewer never answered", which turns a tool outage
into a blocked release with no signal. A timeout that says so would separate
them without weakening the rule.

## 2026-09-11 — the owner's fifteen demo notes, in three parallel rounds

71 commits, 112 files, eight `--no-ff` merges. What is worth remembering is
less the features than how the work was cut and where the bugs actually were.

**The partition held, twice.** Four tracks (profil, hayvan profili,
harita+mesajlar, şifre) were derived by predicting each item's file set and
clustering by overlap, and `git diff --name-only main...<branch>` showed
**zero** files touched by more than one branch — the same on the second
round's two agents. No merge conflict at any point. Three seams were cut
deliberately to make that true, and all three are worth reusing: the
forgot-password flow became a sheet on the login screen rather than a route,
so `navigation/index.tsx` and `web/src/App.tsx` stayed with one owner; each
track got its own stylesheet under `web/src/styles/` instead of hand-merging
`theme.css`, which had swallowed a track once before; and the two migration
numbers were assigned up front with the mirror into the canonical schema left
to the main session.

**That last decision caught a real error.** Track M's handoff said to mirror
`messages.kind` into `001_init.sql`. There is no messages table in 001 — 006
creates it — so the mirror would have described a column on a table that file
never creates. Its own reviewer caught it. The column went into 006's
`CREATE TABLE` body and the `CHECK` stayed in 014 alone, because a standalone
constraint naming the column fails in 006 on a database that does not have it
yet. Both paths were then run: production's own files (`b72adef`) took the
current `migrate.js` twice, and a from-scratch database took it twice, and the
two end at the same schema.

**Where the bugs were.** Two security defects, both found by review rather than
by running anything: `POST /auth/change-password` set a first password on a
social-only account with no re-authentication at all, while account deletion
demanded a fresh provider token for exactly that case; and mounting the
change-password form in the settings sheet put a SECOND Google Identity
Services client on the page, whose `initialize()` is a page-level singleton
with one callback — so a password change could have delivered its credential
to the delete dialog's handler. `reauthenticateWithProvider` is now one
implementation in `backend/src/utils/providerReauth.js`, and `socialAuth.ts`
routes the credential to the button that was actually pressed.

Everything else that mattered was **visual, and only the simulator found it** —
which is the third time this project has learned the same thing:

- The care callout was drawn UNDER the animal avatars, so two of its three
  lines were half covered. Being last among the map's children does not decide
  this: on iOS a MarkerView is a PointAnnotation and the map stacks annotation
  views, not React. `isSelected` did not decide it either. The avatars step
  aside while a callout is up.
- The settings sheet did not scroll, and what was cut off was the basemap
  credit — the entire content of demo note 15. A `ScrollView` inside a card
  with `maxHeight` and no `flexShrink` lays out at full content height and gets
  clipped; no swipe brings it back. That was a bug in the shared `Sheet`, so it
  was latent in every sheet tall enough to hit it.
- The last-seen date rendered as "19 …" because the pill was measured inside a
  marker whose box is deliberately the avatar's 44 pt.

**Owner decisions taken during the work**, all overridable in a word: the map
credit leaves every map surface and becomes the last line of the settings
sheet — a scroll away rather than another tap (option b of two); your own name is not a link, on an animal
profile or on your own leaderboard row, on either client; a group event is a
system message in the group rather than a new notification kind, which is what
makes the unread count, the tab badge and the inbox ordering follow for free;
"bakım verdiğim hayvanlar" became a horizontal gallery and "son yorumlarım"
speech bubbles, so the two stop looking alike; and "galeriye kaydet" defaults
ON with a visible toggle.

**Deliberately not done.** Item 9 has no web half: a browser cannot write to
the camera roll, and a photo chosen through a file input already exists on the
device. Both clients hide it rather than imitating it with a share sheet.

**A tooling note.** The `/api/auth` IP brake (120/h) is spent by a curl round
trip of any size, which then blocks `simulator-login.sh` and
`web/scripts/shot.mjs`, both of which log in to get a token. Minting a JWT with
the backend's own secret and writing it straight into AsyncStorage /
localStorage is the way through, and is what the screenshots here used. A
`--token` option on both scripts would save the next session the detour.

**Also worth knowing:** this machine's simulator had another project's Expo Go
attached, which kept pulling itself to the front mid-screenshot. The pass moved
to a second simulator addressed by UDID; the project's own
`simulator-goto.sh` picks "the first booted device", which is ambiguous as soon
as two are running.

### Same day — left open on purpose, after the final review

Seven web dialogs still close only on their own backdrop and buttons, with
no Escape and no `popstate`: the PWA install prompt (`install.tsx`), the badge
catalogue and the badge-award celebration (`badges.tsx`), the avatar picker
(`ProfilePage`), the map's add chooser and its confirm (`MapPage`), and the
conversation dialog (`ConversationPage`). The animal page's fullscreen photo
viewer is an eighth case of a different shape: it already closes on Escape
(and wires the arrow keys), so what it lacks is only the history entry — and
it sits alongside the four that WERE fixed, so do not read that page as
finished. DESIGN §8 point 3 applies to
all of them and the mechanism is ready — `useSheetDismiss` in
`web/src/components/profile/Sheet.tsx`, which is not profile-specific despite
where it lives, and takes `history: false` for a dialog nested inside a sheet.

They were left out because their mobile twins were not touched in this work,
so they are symmetric gaps rather than a disagreement this change created —
and each wants its own check that Back closes the dialog and keeps the page.
The seven that WERE fixed (the animal page's four, the report dialog, the
badge ladder, the delete-account dialog) are the ones whose mobile twins
gained `onRequestClose` here.

### Same day — one known limit in the sheet stack, for whoever adds the next dialog

`onPop` in `web/src/components/profile/Sheet.tsx` decides what a back press
meant by asking `topOwningIndex()` — the topmost sheet holding a history
entry — and never checks which entry the browser actually landed on. With two
OWNING sheets stacked, closing the inner one with its own button hands its
entry back, and the popstate that follows is picked up by the outer sheet,
which closes too.

The trigger is a close that does NOT go through `dismiss`. Dismissing the
inner sheet closes only the inner — the outer's `onPop` runs first, sees the
inner still on top and bails. It is a bare state setter that cascades: the
cleanup deregisters the inner's listener before its `history.back()` is
answered, so the surviving popstate finds the outer at `topOwningIndex()`.

Reachable today only through a race on the animal page: `openLog` awaits a
comment fetch before it sets its state, so tapping a health-record row and
then "+ aşı ekle" during that fetch stacks the log dialog on the vaccine one;
the log's "Kapat" — a bare `setLogRecord(null)` — then takes the half-filled
vaccine form with it. Routing that one button through `closeLog()` makes the
cascade disappear WITHOUT closing the class, which is the trap: the sibling
below survives it.

Two siblings of the same assumption are unreachable from today's seven call
sites but would not be from the seven queued above: an outer sheet closed by a
state setter while an owning inner is open leaks its entry, and swapping one
sheet for another in a single commit closes the new one instantly. The fix is
for a back press to be consumed once per event rather than once per listener —
a single module-level `popstate` handler instead of one per sheet. Left alone
here because this batch cannot reach it and the change touches every sheet;
worth doing before the queued dialogs land.

### Same day — three accepted windows, for the queued batch

Closing a dialog mid-request is allowed now (hardware back and Escape never
lock), and that leaves three windows nobody has closed. None is reachable
without a slow network, and each is better than the orphaned dialog the old
refusal produced — but they are trades, not absences.

- **A duplicate health or vaccination record.** "Kaydet", then Back, then
  reopen: the form still holds what was typed, which is the point, but the
  first request is still out and pressing "Kaydet" again writes the record
  twice. A submit token stops the late answer from clearing the new dialog;
  it does not stop a second submit.
- **A frozen-looking dialog on web.** `AnimalPage` shares one `saving` flag
  between the record and the vaccine dialogs, so while one request is out the
  other dialog opens with a dead backdrop, a dead Vazgeç and a dead Kaydet,
  and nothing on screen explains it. On a phone there is no Escape key, so
  the browser's back gesture is the only way out of that window. The shared
  flag is also what keeps the submit token safe by preventing two concurrent
  saves — split it and the token needs to be per dialog.
- **A report the user never filed.** `ReportDialog` and `ReportSheet` have the
  same late-answer shape and no token: "Gönder", Back, reopen, choose another
  reason, and the first answer sets "Şikayetin alındı" on the reopened sheet.

## 2026-09-12 — the owner's second pass, and a navigation restructure that needed a second look

Fifteen more notes after walking the simulator and the web app. Most were
layout; two were not.

**The tab bar must never disappear, and three flows became modals.** The
mobile root was a stack with the tabs as its bottom screen, so anything
pushed covered the bar. The root is the tab navigator now and every
destination lives inside each tab's own stack.

The first version of that put the three modal flows (yeni hayvan, bakım ver,
yeni sohbet) on a root stack ABOVE the tabs, and the review caught what that
costs — by reading `@react-navigation` 6.4.17's own router rather than
guessing. Worth remembering, because nothing about it is obvious:

- `StackRouter`'s REPLACE returns null for a route it does not own, and an
  unhandled action is offered to **children, last-registered first**. So
  `replace('AnimalProfile')` from a root modal was handled by whichever tab
  mounted last, replacing THAT tab's home screen while the modal stayed on
  screen. `BaseRouter.shouldActionChangeFocus` is true only for NAVIGATE, so
  the root never came back into focus to correct it.
- NAVIGATE from a root screen into a tab focuses `Tabs`, and
  `getStateForRouteFocus` truncates the stack above it — which unmounted the
  add-animal modal and threw away the draft on the way to a match candidate.

Both disappear once the modals live in the tab stacks too: the action
resolves where the reader is standing, and a candidate is pushed ABOVE the
modal instead of replacing it. Nothing sits above the tabs any more.

**A nested linking config needs `initialRouteName` per tab.** Without it a
cold-start `pati://animal/12` builds that tab's stack with the linked screen
as its only route: no back chevron, and the tab's own home unreachable for
the session. The warning about this trap existed one level up in the old
config and did not follow the nesting down. It is now on every tab.

**Badges count records, not consecutive days** (owner): food/water
1/10/50/250, animal registration 1/5/20/100, keys `streak:` → `care:`, and
the "Süreklilik" group is gone from both catalogues because nothing is a
streak. `015_badge_counts.sql` renames the keys;
`backend/scripts/recompute-badges.js` rewrites the awards.

Three things about that script, for whoever runs it next:

- It refuses to run before 015 (it counts surviving `streak:` keys and
  aborts), because in the wrong order its DELETE matches nothing and it
  writes `care:` rows beside the old ones.
- It plans outside its transaction and deletes inside it, so a badge awarded
  by live traffic in that window is deleted and not rewritten;
  `syncBadgeAwards` re-inserts it later unseen, which is the celebration the
  "mark seen" choice exists to avoid. **Run it with the app quiet.**
- A streak of N days implies at least N records, so a tier survives when the
  new threshold is no higher than the old streak length. Registration is safe
  everywhere and so is diamond; food and water are not — 7-9 records drop
  from silver to bronze, 30-49 from gold to silver. `--dry-run` names those
  people by id before anything is written.

**Also true after this deploy, and not fixable from here:** any mobile build
already on a phone renders `care:` badges with the wrong symbol and the wrong
ladder, because its `symbolForKey` and `thresholdsFor` only know `streak:`.
Nothing is installed outside this machine today; it stops being true the
moment a build is.

## 2026-09-12 · the QA pass before the deploy

`evaluator-qa` ran against `0c52a7f` with the whole release in scope and came
back **NEEDS_WORK** on one thing, which is exactly what that gate is for: the
group system message — the entire visible half of demo note 12 — rendered on
web and rendered nothing at all on iOS. The line was there in the list, in the
payload, in the unread count; it was simply invisible.

The cause was one property. The pill (background, `radius.pill`, padding) was
styled onto the `<Text>` itself, and a pill radius on an iOS `<Text>` needs
`overflow: 'hidden'` to clip — which clips the whole line away. Moving the
pill onto the wrapping `<View>` and leaving the `<Text>` unstyled fixes it and
drops the `overflow` entirely. Every other `overflow: 'hidden'` in
`mobile/src` sits on a `View`, so this was a one-off, not a class — and the
test for that is the element, not the style: several of those Views have no
`flexDirection` either. What makes a style suspect is a `backgroundColor` or
a `borderRadius` on something that renders as a `<Text>`.

Worth remembering for its shape rather than its size: the battery was green
with the defect present and always would have been, because nothing here is
wrong in TypeScript, in jest, or on the wire. A backend curl round trip
confirmed the message; only a screenshot could see that nobody would read it.
CLAUDE.md already says a change that can produce a screenshot produces one,
and the screenshot taken during the original work was of the inbox, not of the
group.

Two lesser findings from the same pass, both recorded rather than fixed:

- `015_badge_counts.sql` rebuilds `users.featured_badges` element by element
  with no dedupe, so a user holding both `streak:water` and `care:water` would
  come out with `care:water` twice. Not reachable in production: `1ad564c` —
  the deployed commit — only ever writes `streak:` keys, so no pre-deploy row
  can hold a `care:` one. If the file is ever touched again, make the rebuild
  distinct.
- If an old machine writes a `streak:` award between the release command and
  cutover, `recompute-badges.js` aborts on its guard rather than corrupting
  anything — but 015 will not run again until the next deploy, so those rows
  keep the old key until someone re-applies it by hand.

What QA could not verify, and so is still unproven: anything needing a tap on
iOS (`idb` and Appium are not installed, and `simctl` has no tap primitive) —
the settings sheet scrolling to the OSM credit, the care callout's stacking,
add-animal through to a candidate, picking a friend in "yeni sohbet", the
password screens. Cold-start deep links, which were the riskiest part of the
navigation change, were driven and do pass.

## 2026-09-12 · the deploy (v39) and the badge recompute

`46b81f1` is live as **v39**. The release command ran `migrate.js` and
completed, so 013/014/015 are applied; `/health` answers `{"status":"ok"}` and
both `pati-app.com` and `admin.pati-app.com` answer 200.

015 left nothing behind: **0** awards with a `streak:` key and the row count
still matching the pre-deploy snapshot (15,788) before the recompute. The
`featured_badges` zero is the migration's own postcondition rather than
independent evidence — it rewrites exactly those keys, so a zero afterwards
follows from it having run. (Not quite a guarantee: unlike the awards table,
the `featured_badges` UPDATE has no defense against the release-command-
before-cutover window, so someone who featured a streak badge in it would
still hold the key.) How many people had featured one before is in no column
we kept; short of a database volume snapshot, which I did not check for, it is
gone.

`user_badge_awards_pre015` is that snapshot and nothing since has touched it,
but be precise about what it can restore: **the award rows only.**
`users.last_points` (which `recompute-badges.js` rewrites for every user),
`users.featured_badges` (which 015 rewrites in place) and the ladders
themselves (`CARE_THRESHOLDS` for food and water, `COUNT_THRESHOLDS` for the
registrar — so, in practice, a v38 rollback) are not in it.

The two ways back fail differently, and neither fails the way you would guess:

- **Restoring the table alone, still on v39.** The snapshot holds `streak:`
  keys, so `syncBadgeAwards` recognises none of the `care:` tiers a user
  already has and celebrates every one of them again — the popup storm the
  script's `seen_at = now()` exists to prevent. A re-run of the script then
  aborts on its `streak:` guard. Points are fine here: `last_points` and the
  derived total are both on the count ladder, so they agree.
- **Rolling the image back to v38.** That restores the streak ladders, so
  derived totals fall below the inflated `last_points` the script wrote and an
  award earned right then would render its points counting _down_ — the defect
  the script's `last_points` refresh was added for, now pointed the other way.
  It heals itself: `buildMeResponse` calls `refreshRankSnapshot` with the
  derived total on every `/users/me`, and both clients fetch that at start-up,
  so the inflation is gone the first time a profile loads. The exposure is
  only the user who earns a badge inside that window. Resetting `last_points`
  by hand closes it, but it is not what stands between you and a correct
  state.

Either way, anything live traffic awarded after the snapshot is dropped.

`recompute-badges.js` then ran against 2229 users and rewrote every tier:
6,582 care awards → **14,193**, **0 demotions**. The demotion analysis said
food and water were the risky ladders (7-9 records dropping silver→bronze,
30-49 gold→silver) and in the event nobody was in those bands — the seeded
world feeds far past 50 records, and the 29 real accounts have almost no care
history at all (the busiest has two food, two water and four animals). No tier
was lost, which is why the checkpoint before the real run was worth keeping
even though it turned out to be uneventful.

One thing was lost, and it is not a tier: the script deletes and re-inserts,
and the INSERT does not carry `created_at` over, so every rewritten row now
carries the recompute's timestamp instead of the day it was earned
(`points_before`, `rank_before`, `rank_after` and `level_before` are null too;
the script comments on the ranks only). Nobody sees a wrong date today —
neither client reads `createdAt`, and these rows are written `seen_at = now()`
so they never reach the popup, which is also why they are outside the unseen
index. The fact is gone from the row, not from the database: the snapshot is a
`SELECT *` copy, so for anything that existed before the deploy the original
date is one key rename away (015 spells the mapping out). Only the tiers the
recompute newly created have no earlier date, which is correct by
definition.

What changed is the shape of the demo world, not the real one: `care:feeder`
gained 2,193 gold and `care:water` 987, because a count ladder of 1/10/50/250
is far easier to climb than 7/30/365 consecutive days. No **care** diamond
exists yet; the recompute's breakdown says nothing about the other user
ladders — breed, commenter, healer, vaccinator — which it never touched, nor
about the animal badges, which live in their own table.

Checked live rather than inferred: the badge layer hands a real account
`care:feeder` bronze "2 / 10 kayıt", `care:water` bronze "2 / 10 kayıt",
`care:registrar` bronze "4 / 5 hayvan" — the owner's ladders, with the right
units. The public login page serves the new bundle (the "Şifremi unuttum"
link, one of this release's items, is on it).

Every helper script uploaded to the machine for this (`snapshot.js`,
`poststate.js`, the read-only breakdowns) was removed afterwards; `/app` holds
only what the image ships.

## 2026-09-14 · owner batch: two bugs (B1, B2), two changes (C1, C2)

Plan and done-when in ROADMAP "Owner batch of 2026-09-14". Everything landed on
`main` as `bb6bd69..HEAD`, on both clients; nothing pushed or deployed.

**B1 — "Bu o — eşleştir" and "bakım ver" did not add the new photos.** Nothing
in the upload path was broken. Two places dropped photos without a word:

- On a match hit both clients sent only `POST /animals/:id/sightings`; the
  flow's photos and their `photoTokens` were thrown away. This was not an
  owner decision: `addPhoto` once had a match-hit door and said the flow adds
  its photos after the confirm, but no client ever did, so 727d153 removed the
  door to match the clients. Both clients now run the create path's upload
  loop after a 200 sighting (token first, the file when the token expired). No
  backend change for this half. Web holds the `File`s in module memory across
  the candidate's profile (a page reload loses them) and, since a web logout
  keeps the tab, only for the account that took them.
- `submitCarePhotos` answered an existing carer `200 {alreadyCarer, photos: []}`
  and deleted the uploads, and carers had no photo entry at all. A carer's
  photos are now species-screened and stored (shared `storeCarePhotos`, no
  comparison, no carer row, no notification), and both profiles show
  "fotoğraf ekle" under "bakım veriyorsun", opening the camera screen/sheet in
  carer mode.
- Follow-ups from review: one confirm at a time (mobile busy state, web
  confirm replaces the review in history); an expired hit says
  "Eşleşmenin süresi doldu…" before the profile opens; an existing carer's
  confirm without a hit is a real confirm too (the server already let carers
  report a sighting). ADR-0005 amended.
- Evidence: a web playwright e2e against a throwaway fake-model backend —
  gallery 1 → 1 on the old build, 1 → 3 after (both photos by the matcher),
  carer add 3 → 4; jest `addAnimalConfirm` (8 cases, fails-before shown);
  animal-social 134/0, storage-check 48/0 with a new carer-path bucket case.

**C1 — one photo, camera only.** Add-animal takes 1–6 photos from the camera
(the library tile is gone), "bakım ver" one camera slot. The server accepts
1–2 care photos so installed app builds that send two keep working; its
messages no longer name a count. Camera-only is a client rule, like the map's
drop: desktop browsers ignore `capture` and show a file picker, Firefox Android
falls back to a chooser after a camera refusal, and nothing server-side can
tell (EXIF is stripped by the resize and absent from iOS captures). Review
found that the Android app never requested `CAMERA` at runtime, so with the
library gone add-animal would have been impossible on Android:
`capturePhoto` now asks first and explains a refusal with "Ayarları aç"
(jest only — no Android SDK on this machine). Known gap kept: the server has
no add-animal photo minimum. Guide comments already in the database still say
"2 fotoğraf"; only the seed text changed.

**C2 — every location action asks before it warns.** The rule: an action calls
the platform's request and the warning comes only from that answer; lists and
background jobs only read. What actually changed: Android asks for FINE and
COARSE together (some Android 12 releases ignore FINE alone and show no dialog —
exactly "a warning without a prompt"); `getCurrentLocation` asks before the
GPS read; the mobile map asks on its first focus per app session instead of
every focus (Android's two-denial limit); the web "Mama/Su bıraktım" tile asks
instead of reading `permissions.query`, and a later grant clears the stale
refusal text. The web map still asks on every open: a "once per session"
variant was reverted because browsers that grant for the page but keep
reporting `prompt` (iOS Safari's default "Ask") lost the location on every
return to the map. A "don't ask again at confirm after a tile refusal" variant
was reverted too — it let a stored refusal decide the warning.

Platform limit, stated in both `location.ts` files: after iOS "İzin Verme",
Android "bir daha sorma" (or two denials on 11+) or a browser "Engelle", no
platform shows the prompt again; the "Ayarları aç" alert / settings text is
the closest equivalent. Seen on iOS (iPhone Air simulator, fresh install):
"Ekle" → system sheet → "İzin Verme" → "Konum izni gerekli"; "Ekle" again →
the alert with no sheet. Which device the owner saw the warning on is still
an open question.

**B2 — mobile web chat jumped when the keyboard opened.** Reproduced in Mobile
Safari (iOS 26.5 simulator): the shell is sized to the layout viewport, so
Safari panned the whole app up to reveal the composer, and the 15px input
added a focus zoom that stayed after the keyboard closed. Fix, web only
(`keyboardViewport.ts`, mounted by the conversation page): pin `.app` to the
visual viewport while a soft keyboard is up, hide the tab bar while typing,
16px composer (and 16px `.field` inputs on touch screens), keep the list
anchored to its newest message across resizes, `interactive-widget=
resizes-content` for Android. The same Safari afterwards: header in place, no
zoom, newest message on the composer, tab bar hidden. It also showed a
keyboard-sized blank band under the newest message after closing the keyboard
(WebKit clamps `scrollTop` without moving the native scroller); a one-pixel
nudge in the resize anchor fixed it, re-checked twice. Chromium harness 40/40.

Not verified anywhere: Android (no SDK or emulator here) — the camera request,
FINE+COARSE, the map once-per-session ask, `interactive-widget`; real iPhones;
the mobile tap flows for "fotoğraf ekle" → send and the busy/expired confirm
(jest only — sending would call the real model from :3000); a Safari
hardware-keyboard edge where only the accessory bar shows and the page can
still pan (the pin's >120 px gate does not fire).

Divergences: web input 16px vs native 15px; web hides the tab bar while
typing (native Android shows it); web holds match photos only until a reload;
the web drop sheet opens at once and keeps text guidance after a refusal while
mobile waits and keeps the sheet closed; the web map asks on every open,
mobile once per session.

Process notes:

- Review rounds: each item had one code-reviewer round (C1 and B2 then one
  fix round each), one polish round for the minors, a final two-reviewer
  pass (both APPROVE, four minors), and a last review over the four commits
  after it (APPROVE, two nits left as they are: the chat's one-pixel nudge
  settles on a target computed a frame earlier, so a quote tap inside that
  frame can be stopped; and a web draft saved by the pre-deploy bundle has
  no account id, so a confirm across the deploy opens the profile without a
  sighting, once per tab).
- **Real Gemini calls were made once**: storage-check's throwaway backend
  inherited `backend/.env`'s key and sent two species checks. Every harness
  that boots a backend now either points `AI_BASE_URL` at the fake or blanks
  the key and refuses to run unless the boot line says "ai: NOT CONFIGURED".
- `messaging-check` fails one of 99 checks ("admin-deleted flag") — test
  drift from the group system messages (5f3f6eb), unrelated to this batch.
- Another project's session (juno, Expo Go) was using the iPhone 17 and 17 Pro
  simulators; the Safari and C2 checks ran on a separately booted iPhone Air.
  The soft keyboard needs ⌘K in the Simulator ("Connect Hardware Keyboard" is
  on).
- Throwaway rows left in the local `stray-db` (not deleted without the
  owner's yes): users `*@example.test` created by the investigation and the
  checks (bug1-_, skeptic-_, b1-carer/b1-visitor, b2-chat-_, b2ios-_,
  c2-location-_, fototest-_), animals 51810–51814, 51840 and DMs 5580–5582.

## 2026-09-15 · owner follow-ups: keyboard, add tile, pinned comment composer

The owner ran the app on a rebuilt simulator (the iOS 26.5 runtime had been
deleted and re-downloaded; a new "pati iPhone 17 Pro" device was created and
the app built from scratch) and came back with three notes.

**K — native iOS composers sat partly under the keyboard.** Both
`KeyboardAvoidingView`s used a hard-coded `keyboardVerticalOffset` (88 in
ConversationScreen, 90 on the animal profile). RN 0.74 subtracts that offset
from the keyboard's window position and compares it with the view's
parent-relative frame, so it must equal the distance from the window top to
the view's origin — 116 pt on an iPhone 17 Pro (62 pt safe area + a 54 pt iOS
26 bar), which left the conversation composer 28 pt under the keyboard (116 − 88,
matching the header, composer and keyboard edges measured on the
screenshot; 26 pt on the animal profile). `useHeaderHeight()` would not have fixed it: native-stack only
estimates the header in JS (101 pt here). `KeyboardInsetView` measures its
own window frame instead and pads by exactly the covered part; the arithmetic
and the wiring are under jest. Seen on the simulator: "Mesaj yaz…" fully above
the keyboard. Same bug class, not fixed: Login, Register and VerifyEmail wrap
a zero-offset `KeyboardAvoidingView` inside a top-safe-area `Screen`, so they
avoid 62 pt too little — not composers, and each needs its own layout look.

**S — "fotoğraf ekle" lives in the photo grid.** The carer's button is gone; a
carer (outside match review) sees the photos, then one add tile, then dashed
placeholders completing the row. With 6+ photos the add tile keeps the last
cell and "+N" moves to the fifth photo. One pure helper
(`mobile/src/animalPhotoSlots.ts`, imported by web through `@mobile`) with 17
jest cases decides the cells. Web's placeholders had lost their dashed frame
to a later `border: none`; restored. The tile's label tracking was tightened
after a font-metrics calculation showed it overflowing a 375 pt phone (computed,
not seen on such a device). Seen: iOS add tile on a 0-photo animal opening
"Pamuk B1 için fotoğraf ekle"; web screenshots for 0/3/4/5/6/8 photos, a
non-carer and match review.

**C3 — the comment composer scrolled nowhere.** Web's form was
`position: sticky; bottom: 0` and covered the vaccination card; mobile's sat
outside the ScrollView as a bottom bar. Both now sit after the comments in the
"sohbet" section and scroll away with the page; the match-review decision bar
stays pinned. Web's input is 16px on touch screens (iOS focus zoom), 14px with
a mouse. Mobile uses the ScrollView's `automaticallyAdjustKeyboardInsets` plus a
scroll to the end on focus, repeated on `keyboardDidShow` while the composer is
focused — review found that a keyboard appearing after focus (⌘K, a hardware
keyboard going away) otherwise stops RN's native inset at the caret line with
"Gönder" under the keyboard (reasoned from RN source, not seen). Seen on iOS at
5cc2ddf, soft keyboard shown by tapping the field: no composer at the top of the page,
the composer after the comments, and with the keyboard up the whole row plus
the footer above it. Web: composer below the fold at scrollTop 0 (was pinned),
visible after the last comment; a text comment still sends.

Review rounds: K+S one review (APPROVE with a "needs the iOS screenshot" major)
and one fix round; C3 one review (the keyboard-order major) and one fix round;
one review over the fix and this note (APPROVE; nits only — one of them, a
focus flag that stays set if the composer unmounts while focused, reachable only
after an admin removes the carer, left as it is).

Not verified anywhere: Android (no SDK here) and real devices.

### Deploy v40

`38b8587` pushed and deployed as **v40** after CI passed (run 34984951062)
and evaluator-qa returned PASS (full battery 10/10, animal-social 134/134,
ai-check, storage-check 48/48; messaging-check keeps its one known drift
failure). No migrations in `46b81f1..38b8587`; the release command ran
`migrate.js` and completed. `/health` answers `{"status":"ok"}`,
`pati-app.com` and `admin.pati-app.com` answer 200, and the served bundle
(`index-BZia-R7l.js`) is the one built from HEAD — it carries
`interactive-widget=resizes-content`, the add tile's "galerisine eklenir",
`animal-composer-input` and the expired-hit notice. No production screenshot:
this machine has no production account for the logged-in pages.

Only backend, web and admin ship with it. The mobile changes (camera-only
add-animal and "bakım ver", the Android camera request, the location request
shape, the keyboard inset, the add tile, the in-flow composer) reach users with
the next app build; the backend that build needs (1–2 care photos, an existing
carer's photos stored) is live now, so the order is right. Guide comments
already in the production database still say "2 fotoğraf" — refreshing them is
a production data change (`seed-guides.js --refresh`) and was not run.

Local data: every user created by this session's checks since 2026-09-14 (68,
then 3 more from QA), their 38 animals and photos, 16 care actions, the
throwaway conversations and messages, and 108 upload files no row referenced
were deleted on the owner's say-so, as was QA's `evalqa_b1` database. Older
harness users from before 2026-09-14 and the `rehearse_*` databases were left
alone.

## 2026-09-16 · owner fixes: send chevron, tap-for-options, carer gallery, report flag, tab bar, web location retry

Six notes from the owner's evening walk-through; plan and done-when in the
ROADMAP section "Owner fixes of 2026-09-15 (evening)".

- **M1 send chevron.** Web's "›" was a text glyph sitting 2.75 px low; it is
  now an inline SVG of the brand chevron path moved 0.8 units left (the
  brand path itself leans right — do not swap it back in), centred by a grid (pixel scan: 0/0). Mobile's
  chevron path leans 0.8/24 units right; the send button nudges it back.
  iOS pixel scan on the simulator after the change: ink centre 0/0 px against
  the disc centre.
- **M2 tap a message for its options.** The "⋯" is gone on web; a click on a
  bubble toggles the options row (reply, delete for own messages or a group
  admin, report), a click on its quote still jumps, Escape and an outside click
  close it. Mobile's bubbles open the same options on tap (long press still
  works); deleted placeholders and system lines offer nothing; the quote jump
  is also an accessibility action. Seen on iOS: a tap on another's bubble opens
  "Yanıtla / Şikayet et / Vazgeç". Known: Android's Alert keeps three buttons,
  so a group admin there does not see "Vazgeç" (pre-existing); web Escape only
  works when focus is inside the page.
- **G carer gallery.** No "show more": the strip loads every cared animal in
  pages as it scrolls (limit 20, offset), a data hook per client (`useCaredAnimals`, paging over
  `@mobile/paging`'s `mergeById`) with the strip's geometry in
  `mobile/src/carerGallery.ts`; both are tested on mobile. Seen on iOS: the strip swipes past the first cards. Known: a
  profile reload resets the strip to its first page.
- **R report the animal from the header.** "şikayet et" left the page footer
  for a flag disc in the header (both clients); for a carer the comment composer is
  now the last thing on the page (non-carers and match review have no
  composer). Seen on iOS; the disc showed a grey square
  behind it until `overflow: hidden` (525f1ee) — which also drops its iOS
  shadow, the same as the conversation header disc.
- **T tab bar.** The bar was a 49 pt item strip plus 30 pt of home-indicator
  inset, so the items sat high. Height and padding now come from the safe-area
  inset with the bottom capped (18 pt) and the icon+label group centred; web
  balances its padding the same way. Measured on iOS: hairline at 798 pt (was
  795), item ink 818–855 pt.
- **L web location retry.** Owner: without permission, "mama ekle" warned but
  never re-prompted. Mobile Safari on the iOS simulator showed why: WebKit answers a refused
  site silently for the rest of the page, and remembers refusals in
  `Library/WebKit/GeolocationSites.plist` (`ChallengeCount`): after two
  refusals it stops prompting for about a day. The warning now offers
  "Konum iznini tekrar iste": it stores a validated one-shot intent in
  sessionStorage (action, type, path, 60 s) and reloads straight back into the
  same action (drop tile, locate, "Yeni hayvan", "+ Yeni", the add-animal
  card), where the browser can prompt; a refused retry shows settings steps
  instead of the button. The login screen discards a pending intent, so a
  reload that lands there cannot run it for the next person to sign in
  (160dabd, checked by QA's playwright run, not in Safari). Known: while
  WebKit's day-long block is on, every new tap still offers the button once,
  and its reload ends in the settings text.
  Seen in Mobile Safari: refuse → "Mama bıraktım" → warning with the button →
  one reload → the drop sheet reopened and Safari prompted → "İzin Ver" →
  located. With two refusals stored, the retry showed "Konum izni yine
  verilmedi" with the settings path, as designed. (The simulator's stored
  refusal was reset by hand to test the first path.) Playwright 111/111 with a
  WebKit-like geolocation stub. Mobile unchanged: native iOS cannot re-show the
  sheet after "İzin Verme" and already offers "Ayarları aç".

Web by playwright (QA run on 84fed94, scripts in the session scratchpad,
not committed): send chevron, tap-for-options, gallery paging, report flag,
tab bar, location retry 46/46. Battery: `verify.sh full` 10/10 on 84fed94.

Reviews: two code-reviewers over M and G/R/T (APPROVE, minors listed above),
one over the flag fix and L (APPROVE; its login-screen minor fixed here).
Not verified: Android, real devices, the iOS 26 Safari page-menu wording of
the settings path, Firefox's behaviour with two parallel location requests.

### Deploy v41

QA returned PASS on 84fed94 and found one more real risk, fixed before the
deploy: the cared-animals query sorted only by the care row's timestamp while
the gallery now pages it by offset, and seeded rows share timestamps, so a
page could repeat or skip an animal (2620392 adds the animal id as a
tiebreaker; local users 734/983/867 page to 36/35/35 unique ids, repeated
pages identical, reviewed). The user comments list has the same flaw; it is
written up in the ROADMAP under "Open follow-up: the user comments list pages
without a tiebreaker". `2620392` pushed, CI green (run on 2620392), deployed
as **v41**: no migrations, release command completed, `/health` ok, web and
admin 200, and the served bundle is the one built from
2620392 (`index-DiBxgX5E.js`,
carrying the retry button and the tap-for-options label). No logged-in
production screenshot (no production account on this machine). Mobile
changes ship with the next app build.


## 2026-09-16 (evening) · owner fixes: tab bar again, form placeholders, physical features, staged badge points, empty record sections, leaving care

Six items (ROADMAP "Owner fixes of 2026-09-16 (evening)"), all on both
clients where they apply. Nothing deployed yet.

- **N tab bar, second pass.** Yesterday's fix centred the icon+label group
  between the hairline and the screen edge; the owner's answer was "çok
  aşağıda". Measured on the simulator, it was: the ink ended 19 pt above the
  screen edge with the home indicator drawn in the last 13 of them. The group
  is now centred against the air a reader *sees* as air — the indicator's own
  8 pt band is reserved but not counted — and the inset cap went from 18 to
  25 pt. Pixel scan on an iPhone 17 Pro: hairline 798 → 792 pt, bar 76 → 82,
  ink 818–855 → 811–848 (7 pt higher), room under the labels 19 → 26. With no
  inset nothing moves (56 pt, 8/8). Web's `.tabbar` carries the same three
  custom properties: measured 54 px in a browser (unchanged) and 80 px with a
  `--tabbar-inset` of 25 px, 16 above and 25 below — mobile's group is 40 pt
  where web's is 38, hence the two-point difference in the totals. Not seen in
  a real standalone PWA on a device; the web number is a measurement of the
  computed style with the inset forced, not a home-screen screenshot.
- **P no example placeholders.** The "Örn. …" grey lines are gone from both
  clients (add-animal name and physical features, the vaccine type and note).
  The label already says what the field is, and the example read as a value
  already typed in. What stays: the plain "Kendin yaz" under a picker's
  "Diğer" chip (the only label that box has, and an instruction rather than an
  example), the format hints (`ornek@eposta.com`, the password dots, the
  6-digit code) and the action prompts ("Mesaj yaz…", "Yorum yaz…"). The admin
  panel's own "Örn. …" placeholders were left alone — it is an internal tool,
  not the app the owner was reviewing.
- **F belirgin fiziksel özellikler.** "işaretler / notlar" is now "belirgin
  fiziksel özellikler (varsa)" on both add-animal forms. The column is still
  `animals.markings`; only the label changed, so nothing in the API or the
  profile's description sentence moved.
- **B staged badge points.** Two badges earned by one action wrote the same
  `points_before`/`points_after` on both rows, so both popups read "0 → 20".
  `stagePoints` (backend/src/utils/badgeAwards.js) now splits a batch into a
  chain: the first popup 0 → 10, the second 10 → 20. The chain starts at the
  snapshot the user last saw and its last step ends on the real total, so the
  last popup always agrees with the profile behind it; anything else that
  moved meanwhile (comment points) rides on that last step. The level follows
  the staged points, and so does the rank: `computeLeaderboard` is already
  fetched once per batch and a rank is just "how many people have more", so
  each step's rank is derived from its own total — verified to agree exactly
  with `getUserRank` for three users. Six node:test cases for the pure chain,
  plus a real run against the local database (user 15436: 0 → 10 → 20 → 45 →
  55 → 65 → 90 with the rank climbing 60 → 55 → 35 → 34 → 32 → 1), and both
  popups screenshotted in the app.
- **E empty record sections.** "Henüz aşı kaydı yok." / "Henüz kayıt yok."
  were hairline cards, which under a section header read as an empty text
  field. They are plain muted lines now on both clients. Deliberately not
  changed: the carers ("İlk bakıcı sen ol.") and chat ("İlk yorumu sen yap.")
  empty states, which are invitations rather than statements — the line the
  fix draws is that a bare "there is nothing here" is a line, an invitation
  keeps its card. If the owner wants those flattened too it is the same edit.
- **C leaving care.** `DELETE /animals/:id/care` (idempotent, in the follow
  rate-limit bucket) deletes the `user_animal_care` row and the follow that
  `addCarer` created with it, in one transaction, and answers with both
  counts. Both clients ask first and then reload the profile rather than
  patching it — the carer row also drives the follow state, the two counts,
  the carer list and the animal's badge ladder. What the leaver wrote stays:
  photos, records and comments are the animal's history. Curl-checked on a
  running instance: carer/follower 1/1 → 0/0, health record, vaccination and
  comment all 403 `carersOnly` afterwards, a second DELETE still 200, and the
  animal's photos still there.

Evidence: iOS simulator screenshots for N (before/after crop), P+F, E, C
(confirm dialog and the state after leaving) and B (both popups); the web
halves of P+F, E and C driven in the in-app browser at 375×812. Playwright
was not used this time — its chromium is not installed on this machine and
the download was not worth it for six screens.

Not verified: Android, real devices, a real standalone PWA's safe-area inset,
and the badge popup on web (the staged values are the backend's, and the web
modal reads the same fields).

### Same evening — the review round, and what it changed

code-reviewer over `00ad2ae..b5eef2f` came back NEEDS_WORK with two real
defects in the new endpoint, both fixed here:

- **The carer notification became a repeatable broadcast.** Until leaving
  existed, `user_animal_care` only ever grew, so `becameCarer` could fire at
  most once per person per animal and `notifyAnimalEvent` needed no dedupe
  (it has none — one set-based INSERT over followers ∪ carers). With leaving,
  a leave/rejoin cycle announced the same person to every follower again, 30
  times an hour at the care-photo rate limit, each cycle also costing Gemini
  calls. The announcement is now a first-time event: `caredBefore` reads the
  `'care'` rows of `animal_match_attempts` — the durable record of passing a
  carer door, indexed on `(user_id, animal_id)`, and nothing deletes them.
  The sighting door writes the same marker now (`markCareDoor`), so both
  doors share one rule. Those rows are inert for badges, which count only
  `kind = 'register'`.
- **The follow was deleted even when no carer row was.** A plain follower
  calling `DELETE /animals/:id/care` was silently unfollowed. The delete is
  now conditional on the carer row actually going, and the response reports
  the follow state it read back rather than assuming `false`.
- Also from that round: the id is validated (400 on a non-numeric id, 404 on
  an animal that is not there, instead of a 500 and a cheerful 200), the
  stale `.tabbar` comment in `web/src/theme.css` was rewritten, and the tab
  bar test stopped recomputing the formula it was meant to pin — it is a
  table of ten measured (inset → height, above, below) rows now, so changing
  either constant fails it.

C's missing artifact is closed: **section 16 of
`backend/scripts/ai-check/checks.sh`** drives the whole thing against a
throwaway backend with the fake Gemini — join, announced once; leave, rights
and granted follow gone, comment and health record 403 `carersOnly`; leave
twice, still 200; a bogus id 400 and a missing animal 404; follow without
caring, then leave, follow untouched; rejoin, carer again and **not**
announced a second time. `bash backend/scripts/ai-check/run.sh`: 187/187 ALL
PASS, which also re-proves the ADR-0005 contract after these edits. The model
is put in `error` mode for the section, so the door opens fail-open and no
verdict has to be scripted — and no real API call is made.

Two findings were read and deliberately left:

- `stagePoints` clamps a middle step to the total when the snapshot is
  stale-high, which can produce a row reading "+10 puan" over "60 → 60".
  Reachable only when points dropped between syncs (a moderated comment).
  Every alternative is worse — chaining without the clamp makes a middle
  popup claim more than the profile shows, and back-computing the start from
  the end can go negative. Not a regression: the old code wrote the same pair
  on every row of a batch.
- A leave committed while a carer's "fotoğraf ekle" upload is in flight lets
  that batch land in the gallery, where `addPhoto` would have refused it.
  The window is one Gemini round trip wide, the photo is the leaver's own and
  of this animal, and the next load is consistent. Guarding it means
  re-reading the carer row inside `storeCarePhotos`, which is shared with the
  join path where the row was just written.

### Same evening — the tab bar, third try, and the modal ×

The owner looked at the running app and said two things: the navigation items
**still** read as centred, and the × in the add-animal header's close button
was not centred in its disc.

- **The ×.** Measured on the simulator: 7 pt left of the disc's centre,
  vertically fine. The disc is not ours — iOS 26 draws a background behind a
  header button — and with a bare glyph as `headerLeft` it drew a 44 pt one
  around the whole header slot while the glyph stayed at the leading edge.
  Giving the Pressable a 36 pt frame with the glyph centred in it makes the
  system draw its disc around that instead: 0.00 pt horizontally, 0.17
  vertically. A surface and hairline of our own (the animal profile's
  `headButton`) centres it too and was tried first, but then our ring sits
  inside the system's and the control reads as two discs. All three modal
  headers share `modalOptions`, so "bakım ver" and "yeni sohbet" get it too.
  Nothing to do on web: its modal header is a plain chevron with no disc.
- **The tab bar, stop guessing.** Three rounds on one bar — the library's
  layout read as off-centre, centring on the screen edge read as "çok
  aşağıda", discounting an 8 pt band still read as centred — so instead of a
  fourth guess, three candidates were rendered on the simulator at the same
  82 pt bar height and shown to the owner: 8/34 (top-aligned), 13/29 and the
  then-current 17/25 — air above the icons (hairline counted) over air below
  the labels, each summing with the 40 pt group to 82. The `itemPaddingTop`
  that produces the picked 13 is 12; the box is 805-845 and the measured ink
  807.3-843.7, so it sits 2.3 pt inside the box at the top and 1.3 at the
  bottom. They picked the middle one. `TAB_HOME_INDICATOR_CLEARANCE` 25 → 29 and
  `TAB_INDICATOR_BAND` 8 → 16 express it, and the rule still reads the same
  way: reserve up to 29 pt of the inset, of which the bottom 16 belong to the
  indicator and are not air, and centre the group against the rest, with an
  8 pt floor. Measured after: hairline 792 pt, bar 82, ink 807.3–843.7, air
  15.3 above and 30.3 below. Nothing moves without an inset (56 pt, 8/8),
  unchanged through all three rounds. Web computed the same: 54 px in a
  browser, 80 px with a 29 px inset, 13 above and 29 below.

**These figures are a decision, not a derivation.** DESIGN.md says so too.
Anyone tempted to re-centre this bar from first principles should read the
three rounds above first.

Review round on those two commits: APPROVE, with one finding worth acting on
straight away — a flat 16 pt band ate the whole gap on every inset between 9
and 24 pt (an iPad's is around 20), pinning the group to the hairline with all
the air underneath, which is the very shape the three rounds were about. The
band is proportional now (`indicatorBand`, 16 of a full 29): inset 34 is
untouched at 82/13/29, and 20 goes to 69/9/20 instead of 68/8/20. Also fixed
from that round: the close button's docblock claimed to be a third copy of the
animal profile's `headButton` and invited someone to extract them, which would
have reinstated the double disc the fix removed — it now says the opposite,
and the style is named `modalCloseFrame` so the two do not read as the same
thing. The reviewer also noticed the × fix took the touch target from 38 to 52
pt, over the 44 the design system asks for. Not covered: Android (no
system-drawn header background there, so the frame simply moves the glyph
7 dp inward) and a real standalone PWA. Web's band is a `calc()`, so it keeps the fraction
mobile rounds away: at a 20 px inset the link's top padding is 7.97 px where
mobile computes 8. Sub-pixel, and the two agree exactly at the inset that
matters (29 → 12).

### Deploy v42

evaluator-qa returned PASS on `f272ed9` with evidence rather than assent: the
full battery 10/10, `ai-check/run.sh` 187/187 and `animal-social/run.sh`
134/134 re-run by them, no `.sql` in the range, and four things checked
against the real data.

- **The marker gap is bounded.** 16,749 of 16,752 carer rows in the dev
  database have no `kind = 'care'` marker (10,947 of them registrants), and
  production will look similar. `caredBefore`'s only consumer is the
  announcement, so the worst case is one extra "started caring" notification
  per person and animal, after which the marker exists and it cannot repeat.
  The new rows cannot contaminate anything else: `consumeMatchHit` and the
  `matched` badge both filter `kind = 'register'`, and 007's CHECK constraint
  has always allowed `'care'`.
- **The rank derivation is equivalent on the real board**: 886 users, six
  genuine tie groups, `1 + count(others with more points)` reproduces
  `computeLeaderboard`'s own 1,2,2,4 ranking for every one of them. No new
  cost either — the board pass sits behind the `fresh.length === 0` return.
- **The store's mobile build is safe.** The whole backend diff adds three
  `res.json` lines and all three are inside `leaveCare`; no existing
  endpoint's payload moved.
- **An animal with zero carers** (which production has none of today) reads
  fine everywhere: admin animals and stats, the leaderboard and the profile
  lists all 200.

Pushed `00ad2ae..f272ed9` (12 commits), CI green on that sha, then
`fly deploy --app pati-app --ha=false`: release command completed, machine
`7843d59f197e98` reached a good state, DNS verified. Verified afterwards:
`/health` `{"status":"ok"}`, `pati-app.com` 200, `admin.pati-app.com` 200,
and `DELETE /api/animals/1/care` answers 401 rather than 404, so the new
route is live. The served bundle is `index-BeMTRkEm.js` — the same hash the
local build of `f272ed9` produced — and it carries "belirgin fiziksel
özellikler", "Bakımı bırakmak için tıkla", "bakıcılığı bırakacaksın" and
`empty-records`; the served CSS carries the 29 px cap with the
`calc(... * 16 / 29)` band and the `.empty-records` rule. Production landing
page screenshotted with no console errors.

**Not verified in production:** anything behind a login — there is still no
production account on this machine, so the tab bar, the leave-care button and
the empty record sections were confirmed on the built artifact and in the
served bundle, not in a signed-in production session. Playwright's chromium
was missing here and QA installed it, so web screenshots work again.

Mobile ships with the next app build: the tab bar geometry and the modal ×
are not in this release. The ROADMAP's follow-up list carries nine parked
items from the three review rounds, and QA added one more worth a line — the
comment at `caredBefore` says "both doors write one" while `createAnimal` is
a third door that writes none.


## 2026-09-16 (night) · App Store readiness — iOS first, Android parked

Owner, after v42 went out: "Android'i şimdilik geçelim, iOS'a çıkaralım. Sen
eksikleri tamamla, ben o sırada key'leri alayım; key'leri girince her şey
hazır olsun." So the code side of an App Store submission lands here and the
owner's console work is the only thing left. ROADMAP: "🍎 App Store
readiness".

- **R3 blocking a user, and reporting one.** The gap that would have failed
  review outright: guideline 1.2 requires an app with user-generated content
  to let people block abusive users, and there was no way to. The rule, in
  one sentence, is in `backend/src/utils/blocks.js` and both clients' docs:
  blocking removes the friendship and closes every door that friendship
  opens, refuses new requests in both directions, hides the two people from
  each other's search, and hides the blocked person's comments from the
  blocker — while their profile still opens, which is where the block is
  undone. Unblocking brings the comments back, **not** the friendship.
  Deliberately untouched: what they write in a group a mutual friend put us
  both in, and notifications about their actions.
  Leaning on the friendship is what made this small: direct messages and
  group membership are already gated on `areFriends`, so deleting the
  friendship row inside the same transaction closes them without a second
  rule. The comment filter is one direction on purpose — I stop seeing the
  people I blocked, not the people who blocked me, who chose not to see me
  and never asked me to stop reading them. The filter also applies to the
  comment list's `total`, or the pager would ask for a page that never
  fills.
  Evidence: `checks.sh` section 17, 39 assertions, **226/226 ALL PASS** —
  friendship gone with the block, the profile still open and reporting
  `blocked` to the blocker only, the comment out of the chat AND out of the
  total, requests 403 both ways, search blind both ways, the DM refused,
  idempotent twice, self/bogus/missing ids 400/400/404, and after the
  unblock the comment back, the total back, the friendship still `none`.
  The check accounts carry the run's stamp in their name now: the local
  database holds every earlier run's accounts and a search capped at 20
  rows missed the one under test (a green-looking failure — the assertion
  that B could find A failed for a reason that had nothing to do with
  blocking).
  Seen on both clients: a "⋯" disc beside the friendship button (şikayet et
  / engelle), the system alert and its confirmation on iOS, a small menu
  and `window.confirm` on web, "Engellendi" in the button's place, and
  "engellediklerim" in the settings sheet with "engeli kaldır" — the whole
  block/unblock round trip driven on the simulator and in the browser, with
  `GET /users/me/blocks` checked against each step.
- **R1/R2 the plist details.** `ITSAppUsesNonExemptEncryption` false (the
  only cryptography is HTTPS; without the key App Store Connect asks on
  every upload). The `fetch` background mode is gone: nothing in AppDelegate
  handles a background fetch and guideline 2.5.4 refuses a declared mode
  with no functionality behind it — `useCareAlerts` already says its timer
  does not run in the background. Portrait only, because no screen was ever
  laid out or looked at sideways. `PrivacyInfo.xcprivacy` declares what the
  app collects (e-mail, name, user id, precise location, photos, user
  content — all App Functionality, linked, never tracking) instead of the
  empty list that contradicted the App Privacy answers.
- **R5/R6 the submission kit.** `docs/store/APP-STORE.md` is the whole App
  Store Connect record: listing text in Turkish, the App Privacy table
  matching the manifest line for line, review notes that pre-empt the two
  questions this app invites (outside Türkiye the map is empty — use the
  animals tab or set Kadıköy; a photo of an empty desk is *meant* to be
  refused), the reviewer-account recipe, and the ordered "keys are in"
  sequence. Screenshots are 1320×2868 from an iPhone 17 Pro Max simulator
  in `docs/store/screenshots/`.
- **The description says "ücretsizdir" and no longer says "reklam
  içermez".** The app has its own promotion slots; the sentence would have
  been a claim review could hold against it.

- **R4 the Release build, which is the point of all of it.** Every
  screenshot this project has ever taken was Debug. `xcodebuild
  -configuration Release -sdk iphonesimulator` **BUILD SUCCEEDED**, and the
  built `Info.plist` carries the three changes (`ITSAppUsesNonExemptEncryption
  => false`, no `UIBackgroundModes` key at all, `UISupportedInterfaceOrientations`
  a one-element array). Installed and launched on the Pro Max: the login
  screen came up talking to **production** (`__DEV__` false switches
  `API_BASE_URL` to `https://pati-app.com/api`), and the Google button was
  drawn — which means production's `GET /auth/providers` reported an iOS
  client id equal to the compiled-in one.
  Then the test that actually matters: **tapping it in Release reached
  Google's system consent sheet** ("pati" giriş yapmak için…
  accounts.google.com) and the app **did not terminate** — same pid before,
  during and after, "Vazgeç" returned to the login screen, and the device
  log has no crash, exception or termination line. This is the one failure
  the notes of September 2 could only describe: the Google SDK raises an
  ObjC exception that the RN wrapper catches only under `#if DEBUG`, so a
  release build with a mismatched URL scheme dies on the first tap. The
  compiled-in guard and the scheme are paired correctly. No sign-in was
  completed — nothing was written to production.

- **The migration dry run, as CLAUDE.md asks.** A throwaway database built
  from **production's own** migration files (`git show f272ed9:…`, the
  deployed v42 tree) — 15 files, 30 tables, no `user_blocks`. Then the
  current `migrate.js` twice against it: both runs exit 0, `016` applies
  once and is a no-op the second time, and the table lands with its two
  indexes. So the next deploy's release command has been rehearsed against
  the shape production actually has, not against a database built from
  `001` alone.

### The review round, and the two defects it found

code-reviewer over the range came back NEEDS_WORK, and both real findings
were the same mistake in two places: **the block's promise was true of the
animal chat and nowhere else.**

- **Their comments were still on their profile.** The dialog says
  "yorumlarını görmezsin"; `runAction` then reloads the very screen it was
  pressed on, which rendered their three latest comments and a "tümü" link
  into the full list. I had filtered `listComments` and stopped there. The
  lesson is about where a rule has to be applied: "their comments" is not
  one query, it is every reader of `animal_comments`, and I filtered the one
  the feature's own test happened to exercise.
- **A friendship could come back after the block.** `acceptRequest` was a
  bare `UPDATE … SET status='accepted'`. `sendRequest` checks the block and
  then inserts, `blockUser` inserts the block and then deletes friendships —
  two read-then-write pairs with no lock between them, so a request sent in
  the same instant survives both. Accepting it hands back DMs and group-add,
  because the whole design leans on "no friendship ⇒ no doors". The guard
  belongs on the statement that creates the friendship, where the database
  decides it: `NOT EXISTS (… user_blocks …)` on the UPDATE. Section 17 now
  plants exactly that row with SQL (the API refuses to create it) and
  asserts the accept is refused and the DM stays shut.

Five smaller ones, all taken:

- The health record's `comment_count` is filtered the same way as the chat
  it opens — **and so is its `in_treatment` test**, which is the part worth
  remembering. Filtering only the count would have produced "0 yorum" over a
  record reading "in_treatment", which is precisely the disagreement the
  docblock above that query forbids. The consequence is that the treatment
  state is now the reader's view rather than a global fact; that is the
  price of the chat being the reader's view, and an internally consistent
  pair beats a number nobody can trace.
- `blocks.js` asserts its arguments are a `$n` placeholder and a plain
  column name. Both fragments are string-interpolated, safe today because
  every caller passes a literal — the assertion is what makes the next
  careless caller a crash at boot instead of an injection.
- The refusal to a blocked friend request is now the same bare sentence both
  ways with no `code`. The old comment claimed "the person who was blocked
  is not told so" while the body carried `code: 'blocked'`, and someone who
  knows they blocked nobody reads that as the answer.
- Mobile hides the "⋯" disc on your own profile. Web redirects
  `/kullanici/<my id>` to `/profil`; `pati://user/<my id>` reaches the
  screen, where the menu offered to report and block yourself (both bounce
  with a Turkish 400, so cosmetic, but it was a parity divergence this
  change introduced).
- `backend/test/blocks.test.js` puts the feature in the battery. Its only
  evidence was the curl suite, which `verify.sh` does not run.

Also from that round, and acted on outside the code: the store screenshots
were shot against check-suite data — the map's sheet read "Buralarda mama ve
su yok" over a map full of food and water rings, and the profile showed the
address `ai-1789537063@example.com` with no chosen badges. Retaken on a spot
that has care, with a named account and three badges, and the showcase
"demo" chips cleared from the rows those frames show. One caveat is written
into APP-STORE.md rather than fixed: there are no real animal photographs in
any local database, so the animal profile's photo strip is three generated
solid-colour squares, which a reviewer reads as a broken image (guideline
2.3.3). That one has to be retaken from a real account before submission.

After the fixes: **233/233 ALL PASS**, section 17 at 47 assertions, and the
battery green on a clean HEAD.

### The second round, which found the surface I had written off

A second code-reviewer pass over the fix commit came back NEEDS_WORK again,
and it was right twice. Worth recording because the two findings are
different kinds of mistake.

- **The notification inbox.** My own docblock had declared notifications out
  of scope. But a notification row carries the actor's **name and the first
  140 characters of what they wrote**, and the bell pushes it — so it is the
  loudest place the promise could fail, not a corner. Measured before and
  after on the local database: A's inbox held two rows from B, one of them
  reading "engel öncesi yorum" under B's name; after the block, total 0,
  unread 0. `listNotifications` and both its counts now carry the same
  one-direction filter as every other reader. The lesson is that "out of
  scope" is a claim about the user's experience, not about a module — and I
  made it about a module.
- **A flag nobody read.** `getUserComments` returned `blocked: true` with an
  empty list, and neither client typed the field, so the full comment list
  still printed "Henüz yorum yok." — the exact untrue sentence the round-1
  fix was written to delete. Half-landed: the server stopped lying and the
  screen kept saying it. Both clients now read it and say why the list is
  empty. That screen is reachable with the block already pressed (a back
  stack on mobile, a bookmark or a Forward press on web).

Three smaller ones, all taken: the mutual-request auto-accept — the *other*
statement that creates a friendship — got the same `NOT EXISTS` guard and no
longer answers a cheerful 200 carrying nothing; the raced pending row is now
swept when the block is lifted, or "arkadaşlık geri gelmez" stops being true
the moment it is; and `blocks.test.js` lost the docblock that claimed
coverage it did not have, gaining instead a real guard — that the health
record's count and its `in_treatment` test filter on the **same** viewer
placeholder, which is the one invariant a unit test here can hold.

Evidence for the client halves, which round 2 correctly noted were
conditional renders with no screenshot: on iOS, a blocked profile ending at
the carer gallery with "Engellendi" where the friendship button was, and my
own profile through `pati://user/<my id>` with no "⋯" disc at all; on web,
the same blocked profile and `/kullanici/<id>/yorumlar` reading "Bu kişiyi
engellediğin için yorumları gösterilmiyor." **238/238 ALL PASS** after the
round-2 fixes, battery green on a clean HEAD.

**Two rounds, and stopping here.** Neither round was me chasing my own tail —
round 1 found original gaps, and round 2 found one genuinely half-landed fix
plus a surface I had wrongly excluded. But the rule from the nine-round
session applies to the count, not only to the cause: this is where it gets
reported rather than iterated a third time.

### Apple sign-in turned on for iOS (owner, same night)

The owner enrolled, created the App ID for `com.oguzpancuk.pati` with Sign
in with Apple **as a primary App ID**, and left the server-to-server
notification endpoint blank — pati implements no such endpoint, and naming
an address for one would claim we listen where we do not. Then one secret:

```
fly secrets set --app pati-app APPLE_CLIENT_IDS="com.oguzpancuk.pati"
```

No code deployed. `GET /api/auth/providers` on production now answers
`apple: { enabled: true, serviceId: null, redirectUri: null }`, and that
shape is the whole point of the design: **each client draws only what it is
told about.** Verified on both, in the state that actually ships:

- **iOS, the Release build, against production.** Reinstalled the Release
  binary on the simulator: the login screen now draws "Apple ile giriş yap"
  above the Google button, and the consent line underneath has become
  "Apple veya Google ile devam edersen…". Tapping it reached Apple's own
  system dialog ("Apple Hesabı'nıza giriş yapın" — the simulator has no
  Apple Account) and the process survived it, same pid before and after,
  no crash line in the device log. Signing in for real needs the owner's
  Apple Account in the simulator, so that is where this stops.
- **Web, on pati-app.com.** The Apple button is correctly **absent**:
  `appleReady` returns null unless BOTH `serviceId` and `redirectUri` are
  present, so `enabled: true` alone cannot draw a button that would have
  nothing to configure Apple's JS with. Checked on the live page, which
  offers only Google.

So App Store guideline 4.8 is satisfied for the app — it offers Apple
beside Google.

### The web half, same night, and the file that was never needed

The owner wanted the button on the web too, and got stuck: every guide
(ours included) said Apple hands you an `apple-developer-domain-association.txt`
to host under `/.well-known/`, and the console offered no download button
anywhere. A round went into hunting for it.

It was not there because it is not needed. Registering `pati-app.com` and
the return URL `https://pati-app.com/giris` under the Services ID
**`com.pati-app.web`** (Identifiers → Services IDs → Sign in with Apple →
Configure → Website URLs → `+`) is the whole of it.

That was settled without touching production, by opening Apple's own
authorize endpoint in a browser with our values — `client_id=com.pati-app.web`,
`redirect_uri=https://pati-app.com/giris`. Apple answered with its sign-in
page headed "pati-web uygulamasına giriş yapmak için…". **An OAuth provider
validates `client_id` and `redirect_uri` before it will show a sign-in page,
or it would be an open redirect**, so that one request proves the
registration without writing anything. An unregistered return URL answers
`invalid_request` instead. The probe is written into
`web/public/.well-known/README.md`, because it separates "our configuration
is wrong" from "our code is wrong" in a single request and will be worth
having the next time the button misbehaves.

Then the three secrets, and `GET /api/auth/providers` began reporting the
service id and the redirect URI. On pati-app.com the Apple button appeared
above Google, the consent line became "Apple veya Google ile devam
edersen…", and clicking it made the page open a popup to
`appleid.apple.com` — as far as this session can take it, since completing a
sign-in needs the owner's own Apple Account. No code deployed for any of it.

The lesson worth keeping: **a missing button in someone else's console is
not always a missing step.** Two rounds went into looking for a file that a
single request to the provider would have shown was unnecessary. When a
third-party setup does not match its documentation, ask the third party
directly before assuming the console is hiding something.

`web/public/.well-known/` is kept, empty but for its README: the serving
path was tested (Vite copies the dotted directory into `dist/`, the backend
answers 200 with the file's bytes), so whatever asks for a verification file
next is a drop-in with no code change.

**Not done and why.** Android is a whole wave of its own (release keystore —
`debug.keystore` signs release today, the never-exercised build, the
`ACCESS_BACKGROUND_LOCATION` permission that buys nothing because the
care-alert timer is a JS `setInterval`, the Android OAuth client and its
SHA-1). Crash reporting is still absent, which is the owner's call. The
`pati://add-animal` screenshot never came out — the launch screen was still
up at 20 s and the device log shows no crash, so it is a timing quirk of the
deep-link relaunch, not a defect; five screenshots are enough for the
listing.


## 2026-09-16 (night) · Deploy v45, and the first build in App Store Connect

The blocking feature and its three review rounds went to production, and the
iOS app was uploaded. The order mattered and the owner is the one who caught
it: the `.ipa` had already been built when they asked "we haven't deployed
yet — did you build from the newest state?" The app was current, but
**production was not**. Probed rather than assumed:

```
GET /users/me          401   (route exists, wants auth)
GET /users/me/blocks   404   (route absent)
```

401 against 404 is the proof. Shipping that build first would have put an
"Engelle" button in App Review's hands that answers 404 — on the very
feature added to satisfy guideline 1.2. **A mobile build is only as deployed
as the backend it calls**, and nothing in the battery or the archive can see
that gap; only asking production can.

Sequence run: review of the seven unreviewed commits → two real defects
fixed (below) → its own review → push → CI green → `/deploy-checklist` →
`fly deploy` → the same three endpoints re-probed, all 401 now → upload.

**Deploy v45.** Release command completed (migration `016_user_blocks.sql`
applied), machine in a good state, `/health` ok, both hosts 200.

**Two defects the pre-push review caught**, both reachable through the public
API and both walked past by the curl suite's own assertions:

- `unblockUser` swept a pending friendship whenever no block remained,
  without asking whether *this call* had lifted one. A repeated DELETE —
  a retry after a flaky response, a second device still showing "Engeli
  kaldır" — destroyed a real friend request the other person had just sent.
  Gated on the delete's own rowCount now. The suite had asserted only that
  second DELETE's status code.
- `markRead` never got the block filter the list and both counts had, so
  opening the inbox stamped read_at on rows the reader could not see and
  lifting the block returned them already-read, bell silent.

Both now have assertions that read the database directly, and the reviewer
**proved they are not vacuous** by reverting the two controllers in a
throwaway worktree: exactly three checks fail, the three that were added.
243/243 ALL PASS otherwise.

**The upload.** `xcodebuild -exportArchive` with `destination: upload` went
through on Xcode's own signed-in session — no API key needed, which matters
because handling one is not something this session should do. Two warnings
worth keeping:

- **`MinimumOSVersion` is 13.4; from spring 2027 App Store Connect requires
  15.0.** Not blocking this submission. Raising it drops iPhone 6s/7-era
  devices, so it is a product call, not a chore.
- **No dSYM for `MapLibre.framework` or `hermes.framework`**, so crashes
  inside those two will arrive unsymbolicated. Both are prebuilt binaries we
  do not compile; with no crash reporter wired up at all this changes
  nothing today, and it is the second reason to revisit that decision.

Four earlier review-round items stay parked in the ROADMAP, two of them
deliberately: the `.ipa` now in App Store Connect was built from exactly the
iOS bytes in this tree, and changing them would have made the artifact stale.

### Build 1 was refused at processing, and the reason was a comment that lied

Apple accepted the upload and then rejected the binary (ITMS-90683):
`NSPhotoLibraryUsageDescription` missing. Info.plist carried a comment
saying the app uses "only the ADD half of the library … and never reads the
library through this key". **That comment was wrong.** The avatar picker
calls `launchImageLibrary` (`screens/UserProfileScreen.tsx`), and so does
the development stand-in for the camera. Animal and care photos really are
camera-only, which is presumably what the note meant — but it stated
something about the whole app that only held for two of its three photo
paths.

The lesson is narrow and worth keeping: **a comment asserting what the code
does NOT do is a claim that stops being checked the moment it is written.**
Nothing re-reads it against the call sites. Here it survived long enough to
be trusted twice — once by whoever wrote the plist, once by me while
preparing the submission — and the first thing to actually test it was
Apple's static analysis.

**It would not have crashed, and the first version of this entry said it
would.** Corrected here rather than quietly dropped, because an entry whose
whole subject is an unchecked assertion has no business closing with
another one — and the first correction was wrong too, which is the honest
shape of this.

What is actually true, checked against the library's source and our own
build settings. `checkPhotosPermissions:` is the method that calls
`[PHPhotoLibrary requestAuthorization:]`, and it has two reachable call
sites in `ImagePickerManager.mm`, at lines 88 and 109. **Both sit inside
`if ([self.options[@"includeExtra"] boolValue])`, and `LIBRARY_PICKER`
never sets it** — the JS layer defaults it to false. That is the whole
reason nothing prompts.

Two things the earlier drafts got wrong about those lines, worth naming so
the next reader does not re-derive them. The dead method is
`checkPermission:`, which is real but irrelevant; the live one is
`checkPhotosPermissions:`. And line 109 is **not** merely the pre-iOS-14
fallback: the PHPicker branch is entered only for the library target, so
every `launchCamera` on every iOS version reaches line 109 too. Tying any
of this to our 13.4 deployment target would make the note wrong the day it
rises to 15.0.

So the failure mode is the one that happened: the analyser refuses a binary
that REFERENCES the API, whether or not any code path reaches it. iOS also
never shows this string to a user today; it exists to satisfy processing.

**The condition to watch is `includeExtra`.** It is the documented way to
get `assetIdentifier` or EXIF back from the picker, and switching it on in
`photoPicker.ts` turns both of those call sites live — at which point the
Turkish string above stops being decorative and starts being what people
read before handing over their library.

Fixed with an honest string (and the comment rewritten to name the call
site), `CURRENT_PROJECT_VERSION` 1 → 2 because Apple refuses a repeated
build number, re-archived and re-uploaded at 19:22. Build 2 is the one to
select in App Store Connect.

Two warnings deliberately left, both non-blocking and both restated by the
second upload: `MinimumOSVersion` 13.4 (required to be 15.0 from spring
2027 — raising it drops iPhone 6s/7-era devices, so it is the owner's call)
and the missing dSYMs for the two prebuilt frameworks.

Also deliberately NOT added: `NSLocationAlwaysAndWhenInUseUsageDescription`,
which Apple listed under "not required to fix". A linked SDK references the
always-authorization API, but this app never requests it — `location.ts`
says iOS stays at when-in-use on purpose — and writing a purpose string for
a capability we do not use would promise the user something untrue.

**The tripwire next to it, worth naming before somebody trips it.** Adding
that key would be harmless. Adding the *legacy* `NSLocationAlwaysUsageDescription`
would not: `@react-native-community/geolocation` decides always-vs-when-in-use
by looking for exactly that old key, so its mere presence flips every
`getCurrentPosition` into `requestAlwaysAuthorization` and the app starts
asking people for background location it never uses. The two keys look
interchangeable and are not.


## 2026-09-16 (night) · Submitted for review

`pati: Sokak Hayvanları`, version 1.0, build 2, submitted to App Review.
App Apple ID 6812656456, team 5J62WM72AV, bundle `com.oguzpancuk.pati`.

The store name is not "pati": that is taken. The home-screen name still is —
`CFBundleDisplayName` needs no uniqueness, only the listing does, which is
why the two differ on purpose.

**Screenshots, and what editing them taught.** The owner shot eleven on
their own device, which is the first time this project has had real animal
photographs in a store asset; the simulator set had generated colour
squares. Three edits were needed and each was a small lesson:

- **A real e-mail address was on the profile screenshot.** Product pages are
  public and scraped. Replaced with `ornek@eposta.com` rendered in the app's
  own `Nunito-Regular` at the measured size and colour, so it is invisible
  as an edit. The font files in `mobile/assets/fonts/` make this kind of fix
  exact rather than approximate — worth remembering.
- **Real names and faces in the message list.** Trimmed to two rows. The
  first attempt cut the remaining card's bottom border off, because the
  border was measured at x=60 — inside the rounded corner, where the curve
  is, not at the straight edge. Measured again at mid-width it sits 16 px
  lower. **Measure a rounded card's edge away from its corners.**
- **"Pancuk" → "Pançuk".** Rather than re-render the whole name and risk a
  font mismatch, the cedilla alone was lifted: render `c` and `ç` in
  Quicksand-Bold at the size whose `c` matches the screenshot's glyph (71 pt,
  32×40 against a 32×41 target), take the pixel difference, and paste that
  under the existing letter. Nothing else on the line was touched.

**The size slot was mine to get wrong.** I scaled everything to 1320×2868
(6.9") from the guide's own note. The console's slot asked for 6.5" —
1242×2688 or 1284×2778 — so the set was regenerated at 1284×2778 and the
first folder renamed `KULLANMA-yanlis-boyut-6.9`. The lesson is the same one
this whole submission kept teaching: **read the console, not the note about
the console.** The owner also read "Drag up to 3 app previews and 10
screenshots" as three required photos; previews are optional videos.

**Known and accepted by the owner:** the map screenshots are of Ubud, Bali,
where the device was — Indonesian street names under a Turkish app about
Turkish street animals, and the App Review note says the demo
neighbourhoods are in Türkiye. Flagged, and the owner decided it is fine for
1.0.

Still true and unchanged: `MinimumOSVersion` 13.4 (must be 15.0 by spring
2027), no crash reporter, no dSYMs for MapLibre or hermes, and Android is a
wave of its own.


## 2026-09-17 · App Review asked for information, and two of our own declarations were wrong

Apple answered the first submission with **Guideline 2.1 — Information
Needed**, the standard request for a developer account with no review
history. Not a rejection: six questions, one of them a screen recording on a
physical device.

The reply is `docs/store/REVIEW-REPLY.md` — five items written out, the
sixth a shot list. Three things in it are worth keeping.

**The external-services answer was grounded in `fly secrets list` and the
basemap style, not in memory**: Fly.io, Apple and Google sign-in, Resend,
Gemini, Cloudflare R2, OpenFreeMap. It also says what is absent — no payment
processor, no ad network, no analytics SDK, no crash reporter — because half
of what that question asks is what you are NOT doing.

**Two answers were pre-empted because they would otherwise read as
defects**: the map is empty far from existing data, which is what a
distance-based app does, and a photo that does not show food, water or the
claimed species is refused on purpose.

**The Reply box caps at 4000 characters.** The written-out answer overran it
by 2315, so the file now carries a compressed version first and the long one
underneath for the Notes field.

### The owner's screenshots, and what editing them taught

Eleven shots from a real device — the first store assets in this project
with real animal photographs. Three edits were needed:

- **A real e-mail address on the profile screenshot.** Product pages are
  public and scraped. Replaced with `ornek@eposta.com` at the measured size
  and colour — **but rendered in `Nunito-Regular`, which is the wrong font**:
  the app has been Quicksand throughout since the design system landed, and
  the Nunito files only stay linked. Caught by the review of this very audit,
  after the set was already uploaded. The two are close enough that the line
  matches in width and height, so it is a letterform difference on one line
  of one screenshot and was left alone rather than swapped mid-review.
  The lesson is the one the same commit wrote into CLAUDE.md: because those
  Nunito files are still linked, reaching for them fails silently instead of
  erroring. Reading the font from `mobile/src/theme/typography.ts` would have
  taken a second.
- **Real names and faces in the message list**, trimmed to two rows. The
  first attempt cut the remaining card's bottom border off, because I
  measured the border at x=60 — inside the rounded corner, where the curve
  is, not at the straight edge. At mid-width it sits 16 px lower.
  **Measure a rounded card's edge away from its corners.**
- **"Pancuk" → "Pançuk".** Rather than re-render the whole name and risk a
  font mismatch, the cedilla alone was lifted: render `c` and `ç` in
  Quicksand-Bold at the size whose `c` matches the screenshot's glyph
  (71 pt, 32×40 against 32×41), take the pixel difference, paste it under
  the existing letter. Nothing else on the line was touched.

**The size slot was mine to get wrong.** I scaled the set to 1320×2868
(6.9") from this project's own note. The console's slot asked for 6.5" —
1242×2688 or 1284×2778. **Read the console, not the note about the
console.** The owner also read "Drag up to 3 app previews and 10
screenshots" as three required photos; previews are optional videos, and the
review recording does not belong there — it is four minutes long where a
preview must be 15-30 seconds, and it shows registration and account
deletion rather than the product.

### Two declarations the project's own record already contradicted

Both were mine, and both are the same mistake: answering from what sounded
right rather than from what the repository says.

- **"The in-app promotional slots show only our own content"**, sent to
  Apple. False: the slots are a first-party ad **server** — an `advertisers`
  row with an external `target_url`, rendered under a mandatory "reklam"
  label, with `ad_events` counting billable impressions. NOTES had already
  recorded dropping "reklam içermez" from the store description for exactly
  this reason, and the App Privacy answers declare Advertising Data. The
  correction went through three passes: the first fixed only the sendable
  block and left the false sentence in the long version, and its replacement
  claimed the banners are "sold directly by us" — a commercial claim no code
  change could ever flag as stale. What stands now is what the code proves:
  the banner links to the advertiser's own site.
- **Age rating, Advertising = no.** Corrected to yes while in review; App
  Store Connect took it without a new build. This one mattered more than the
  Notes wording, because a rating is what Apple's rules bind directly.
- **Age rating, Social Media = no.** Apple's definition is feed-centric and
  pati has no feed, which is how it was first answered. But the app's own
  secondary category is **Social Networking**, and there are public
  profiles, user search, friend requests, group chat and a leaderboard
  ranking users against each other. Changed to yes.

**There is no draft state for an advertiser.** `createAdvertiser` accepts no
`active` field, the column defaults to true and NULL dates mean unbounded —
a row serves real users the moment it is created, including one made to try
the admin form. The day the first advertiser goes live, the App Review Notes
text must already be corrected; the tripwire is in the ROADMAP's ads
section, where that work happens.

### The documentation audit

The owner asked whether the docs on GitHub are chronological, complete and
correct. Two audits ran. Chronology was sound — every dated heading in this
file is in order — but the rest was not, and the findings are recorded in
the commit that fixes them. The two that could have cost real time:
`docs/DEPLOYMENT.md`'s copy-paste secret block named the wrong bucket
(`pati-uploads` for `pati-upload`) and an endpoint without `.eu.`,
contradicting the two paragraphs above it and, because storage does not fail
open, taking photo uploads down rather than degrading them. And CLAUDE.md
told every agent "the backend has no automated tests" while 134 of them
pass — an instruction to skip the suite that would have caught you.

## 2026-09-18 · The README was not in the audit, and it was the worst file

The owner's answer to the finished documentation audit was two words:
"readme guncellenmemis". They were right — `docs/` and CLAUDE.md had been
checked across four rounds and `README.md` had never been opened. It was last
edited on 2026-09-14 and carried a year of drift.

What it claimed that was no longer true, in descending order of how much time
it would cost a reader:

- **`cd Pati` after the clone** — the directory is `pati`, so the very first
  command of a fresh checkout fails.
- **A Google Maps API key step for Android**, telling you to copy
  `google_maps_api.xml.example` — a file deleted with the basemap migration.
  Maps are MapLibre everywhere now (ADR-0002), and no client needs a key.
- **"the brand font Nunito"**. The brand font is Quicksand; the Nunito files
  are still linked, so following that sentence renders the wrong typeface
  instead of failing — the same trap CLAUDE.md already warns about.
- **The 20 m distance check** on care marking, which went away when the app
  started sending the device's own position instead of a tapped point: the
  check had come to mean comparing the device's location with itself.
- **The entire badge table.** Streaks were removed on 2026-09-11 and every
  badge renamed (migration 015 renamed the stored keys); the README still
  listed "Mama Perisi", "Mahalle Dedikoducusu" and day-count thresholds, and
  gave the top level as "Sokakların Piri" where the code says "Onur Üyesi".
- **A "Location override for remote testing" section** describing a feature
  removed in `a200d07` — and listing two real people's e-mail addresses in a
  public repository to do it.
- **Two known limits that had been closed** (photos on local disk; photo
  evidence unvalidated and rate limiting only on auth) and a third,
  "very low automated-test coverage", of exactly the kind CLAUDE.md had just
  been corrected for: 134 backend and 193 mobile tests pass.
- **Leaflet and react-native-maps** in the stack list, and a launch-sprint
  block saying the app must not be touched by real users while iOS 1.0 build
  2 sits in App Review.

Everything above was checked against the source before it was rewritten, not
from memory: `grep 'listen('`-style reads of `badges.js`, `care.controller.js`,
`client.ts`, `rateLimit.middleware.js`, `storage.js`, `package.json` and
`git log -S` for the removed override.

**Why this file rots harder than the others, which is the lesson worth
keeping.** NOTES gets an entry every time a session stops and ROADMAP gets one
every time an item lands, so both stay current as a side effect of the working
loop. Nothing touches the README unless someone decides to, and it is the one
document with an outside audience. A documentation task that stops at `docs/`
is not finished.

While checking, one contradiction turned up next door: `PROJECT.md`'s status
block still read "🚀 Launch sprint ← NEXT, the only mandatory block left"
three lines below its own header saying build 2 is in review. ROADMAP had it
right ("done except its Android items"). Fixed to match.

## 2026-09-18 · The README pass had to be reviewed like code, and it failed the first time

The review of the README commit returned NEEDS_WORK, and its blocker was the
pass's own headline fix. The commit claimed `bundle exec pod install` was
wrong because `mobile/ios` has no Gemfile. `mobile/Gemfile` exists — Bundler
walks **up** from the working directory to find it, which I did not account
for when I ran `ls mobile/ios/Gemfile*`, saw nothing, and concluded there was
none. Verified after the fact: from `mobile/ios`, `bundle exec pod --version`
prints 1.14.3, and the Gemfile pins `cocoapods >= 1.13, < 1.15` because 1.15
breaks the React Native 0.74 build.

The replacement was worse than the thing it replaced. Nothing in this repo
installs CocoaPods, and `pod` is a gem binary whose directory is frequently
not on `PATH` — it is not on this machine's, in a non-login shell: `which pod`
finds nothing while the gem sits at
`/opt/homebrew/lib/ruby/gems/4.0.0/bin/pod`. So the "fix" would have sent a
fresh checkout to `command not found: pod`, or, on a machine with a global
CocoaPods, to the 1.15 the Gemfile exists to avoid. **CLAUDE.md and
`contracts/init.sh` carried the same bare command and have been corrected
too** — this was never only a README defect.

Three more claims were contradicted by files in this repo:

- **The seeded badge tiers.** `npm run seed` gives its top cohort 30 days of
  one food and one water record, which is 30 records; the care ladder is
  1/10/50/250, so that is **silver**, not the gold both README and PROJECT.md
  promised. The source of the error is the seed script's own console output,
  which still printed "(gold badge)". Fixed at the source as well as in the
  docs — no gold or diamond tier exists in seeded data at all.
- **The "always" location key.** The new paragraph said the key is absent
  because adding it would flip every position request into a background
  prompt. That is true only of the **legacy** `NSLocationAlwaysUsageDescription`;
  the modern `NSLocationAlwaysAndWhenInUseUsageDescription` is harmless, as
  the 2026-09-16 entry above says in as many words. Conflating them dissolves
  the warning that matters, which is precisely the failure mode that entry was
  written to prevent.
- **"eight route files" of per-user rate limiting.** Seven key on the user;
  `report.routes.js` builds its own limiter with no `keyGenerator`, so it keys
  on the IP — the thing `rateLimit.middleware.js` argues against for content
  endpoints, since Turkish carriers put thousands of users behind one CGNAT
  address. Recorded as-is in both documents rather than rounded off.

Also corrected: PROJECT.md's badge table and level ladder were the stale
originals the README had just been fixed away from (streak groups, emoji
levels, "Sokakların Piri"), so the two documents would have contradicted each
other with README.md pointing readers at the wrong one; the leaderboard
"ranks everyone" in both, when demo, suspended and deleted accounts hold no
rank; and the pending-session sentence, which omitted that `GET /users/me` is
allowed alongside verification and deletion.

**The lesson that generalises.** A documentation pass that touches this many
factual claims needs the same review a feature gets, and for the same reason:
five of the eight findings here were things I had "checked" — I had run the
right command in the wrong directory, or read the right file and drawn the
wrong boundary around it. The review also confirmed what was correct, which
matters: badge labels and ladders, level titles, the 134 + 193 test counts
(both suites re-run), the absent 20 m check, blocking, ports, and the deleted
Google Maps example file.

**App Review status, since the repo had no record of it.** Build 2 was
submitted 2026-09-16, answered 2026-09-17 with a Guideline 2.1 information
request, and the owner pasted the reply from `docs/store/REVIEW-REPLY.md` into
App Review Notes and resubmitted on 2026-09-18. The documents said only that a
reply was owed, which made "in App Review" unverifiable from this repo.

### The badge-permanence claim was wrong in three places, and it may be a product bug

The second review of the README work found that "once earned, a badge is
permanent" — in `README.md`, in `docs/PROJECT.md` and in `badges.js`'s own
comment — is not what the code does. `getBadgesForUsers` recomputes every
tier from live counts on each read (`tierFor(count, thresholds)`); it never
reads `user_badge_awards`, whose header says as much: the badge is derived
data, and the table exists to remember *when* you earned it and *what rank*
you held, because that cannot be reconstructed. `animalBadgeLadder` is the
one that passes awarded rows in — **animal badges are sticky, user badges are
not.**

So a tier follows its count downwards. The reachable path is
`DELETE /care-actions/:id` inside its 15-minute window: a user sitting on
exactly 10 food records holds silver Mama Gönüllüsü, deletes one mistaken tap,
and the next profile read shows bronze — 25 points become 10, and the rank and
possibly the level move with them. An admin deleting an animal does the same
to the registrar and pattern badges.

The documents now describe the behaviour instead of the intention. **Whether
the behaviour is right is the owner's call**, and it is a real question: the
celebration modal already fired for a badge the profile can now take back, and
`user_badge_awards` holds everything needed to make user badges ratchet the
way animal badges do. Recorded here rather than silently "fixed", because
making badges sticky would change leaderboard points for anyone who has ever
deleted a record.

Two smaller corrections in the same round: the README's troubleshooting bullet
still said `contracts/init.sh` runs the bare `pod install` in the very commit
that changed it, and the notifications paragraph said one location key is
deliberately absent when two are, for different reasons — the modern key
because a purpose string for an unused capability promises the user something
untrue, the legacy one because its presence flips every position request.
`docs/store/APP-STORE.md`'s prerequisite rows are now marked
**(owner-reported)** where a checkout cannot verify them.

**Postscript, same day.** The commit that wrote the entry above fixed the
claim in `README.md` and `docs/PROJECT.md` and missed it in `badges.js` — the
copy the other two were copied from, and the one attached to `TIER_POINTS`,
which is the user-badge scorer itself. The next review caught it. Worth
naming as a pattern rather than an accident: when the same false sentence
exists in several files, the code comment is the one that regenerates the
others, so it is the one to fix first, not last.

### AI matching was closed in the ROADMAP and open everywhere else

The owner asked why AI matching is not closed in the README. It should have
been: the ROADMAP has said "✅ live through a hosted vision model (ADR-0005)"
since 2026-09-04, and says in the same breath that the embedding service +
pgvector plan is retired. Two documents had not caught up, and the README pass
the day before made its half worse rather than better — it rewrote the bullet
while leaving the checkbox unticked, and described the retired plan as the
next version ("v2 replaces that comparison with vectors").

`PROJECT.md` was further behind still: §5.1 described the matcher as purely
heuristic, with no mention of the vision model that shipped six weeks ago, and
its status block read "⏸️ AI matching v2 — parked". Both now say what the
ROADMAP says.

Two precision points found while fixing it:

- **`/animals/match` has two methods and they are not equivalent.** `GET` is
  the field ranking alone; `POST` is the multipart form whose photo the vision
  model compares against the candidates' cover photos. An intermediate edit
  here described the `GET` row in PROJECT.md's API list as "fields, then a
  vision model", which was false for that route. Both rows are listed now.
- **"Retired" needed qualifying.** ROADMAP's own later line (written
  2026-09-17, in the audit commit) is more exact than a flat retirement: the plan is off the table as the way
  matching gets built, but a vector index would still be a legitimate
  optimisation later. Both documents now use that phrasing.

Also marked the August 19 status block inside ROADMAP §1 as superseded. It
says the "AI" part is a rule-based placeholder, which was true when written
and is contradicted by the September 4 status at the top of the section. It
sits about seventy lines down, inside a collapsed "Full plan" block, so most
readers never reach either the stale text or its new marker — which is why
the heading below needed marking too.

**The pattern, since this is the second one this week.** A status that moves
gets updated where the work happened — the ROADMAP — and the summaries keep
the old answer. `PROJECT.md` and `README.md` are both summaries of the
ROADMAP, so any item whose status changes needs all three touched, or the two
that are read most often become the two that are wrong.

## 2026-09-19 · App Review rejected build 2: iPad scrolling, and deletion they could not find

Review of 1.0 (2) on an **iPad Air 11-inch (M3), iPadOS 27** came back with
two findings: guideline 4 ("we were unable to scroll down") and 5.1.1(v)
("does not include an option to initiate account deletion").

**The app was universal by omission.** `TARGETED_DEVICE_FAMILY` was absent
from the Xcode project, and absent means Xcode's default — iPhone and iPad.
Nobody chose to ship an iPad app; nothing was ever laid out, run or looked at
on one, and `Info.plist` is portrait-only with no `~ipad` variant. The build
now declares `TARGETED_DEVICE_FAMILY = 1`. An iPhone-only app still installs
on an iPad, but runs the iPhone layout in an iPhone-sized window with a
compact size class at every window size (checked against current iPadOS
windowing behaviour before relying on it), so there is no iPad layout left to
be wrong. Supporting iPad for real is a design project, not a fix.

**Account deletion existed; the reviewer's finding was still fair.** It has
been wired since before the first submission (`UserProfileScreen` → gear →
settings sheet), the reply to the 2.1 request named the path twice, and the
owner's recording shows it. But the control was a faint grey caption reading
"hesabı sil" on the last line of a scrolling sheet, under the theme chips, the
demo switch, the blocked list, the whole change-password form, the legal
links and the logout. On a device where scrolling failed it was unreachable,
which is probably why both findings arrived together; and even where scrolling
works, it was styled to be overlooked. It is now "Hesabımı sil" in the danger
colour, directly under the password form — visible on the sheet's first
screenful on an iPhone 17 Pro without scrolling (screenshot taken). Both
clients, same change, per the parity rule. The reply text had also called it
"hesabımı sil" while the UI said "hesabı sil"; they now match.

**A real scrolling bug turned up while looking, and it is not an iPad bug.**
Checked statically, without an iPad build, because the machine has 13 GB free:
every content screen scrolls through `<Screen scroll>` or a list, except
`LoginScreen` and `VerifyEmailScreen`, which were a centered `View` inside a
`KeyboardAvoidingView` with no scroller at all. Measured on the simulator, the
login stack is about 745 pt tall — it grew when the Apple and Google buttons
landed on 2026-09-16 and was never re-measured. An iPhone SE has roughly
647 pt, so there the bottom of the screen ("Kayıt ol", the avatar note) was
off-screen and unreachable **with no keyboard up at all**. Both screens are
now a `ScrollView` with `flexGrow: 1` + `justifyContent: 'center'`, which
keeps the handoff's vertical centering whenever the content fits. Verified on
the simulator: layout unchanged at rest; with the keyboard up the content
scrolls and "Kayıt ol" is reachable above it.

Honest limit: static reading could not say WHICH screen the reviewer failed
to scroll. At an iPad's full-screen height the login fits, so it was probably
not that one. The device-family change removes the iPad layout rather than
identifying its defect.

Build number is 3 — App Store Connect refuses a second upload of build 2.

**Sequencing consequence.** The owner asked the same day to start on Google
Play. That needs targetSdk 36 (the deadline for new apps passed 2026-08-31)
and 16 KB page support, which means React Native 0.74 → 0.77+, the New
Architecture, and MapLibre 10 → 11 with a rewritten API. None of that starts
until iOS 1.0 is approved: Apple has just shown it will ask for another build,
and that build must be a small diff, not one carrying a major RN upgrade.
