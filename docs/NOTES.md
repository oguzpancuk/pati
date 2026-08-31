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

4. **Photo evidence isn't validated.** A user can photograph anything and
   claim a food drop; only the location distance is checked. There's also no
   rate limiting beyond auth — a user could post hundreds of records a
   minute. Moderation (admin photo review) exists; rate limiting is needed.

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

11. **The location-override code is in the repo.** Guarded by `__DEV__`, but
    it must be removed entirely before production
    (`mobile/src/location.ts`).

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
  `xcrun simctl privacy booted revoke location com.patiapp`.

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
  talks to production (client.ts now switches on __DEV__; release builds
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
