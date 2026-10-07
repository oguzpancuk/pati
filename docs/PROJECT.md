# pati — Project Document

**Last updated:** 2026-09-17 — iOS 1.0 build 2 is in App Store review
**Repo:** https://github.com/oguzpancuk/pati

This document describes the whole project in one place: what it does, how it
works, where it stands, and what comes next. For details:

| Document | Contents |
| --- | --- |
| [PRD.md](PRD.md) | Original product requirements |
| [ROADMAP.md](ROADMAP.md) | Remaining work, suggested order, approaches |
| [DESIGN.md](DESIGN.md) | Design system — tokens, components, screen rules |
| [NOTES.md](NOTES.md) | Rationale for technical decisions, known limits, environment pitfalls |
| [../README.md](../README.md) | Setup and run instructions |

---

## 1. What is the project?

pati is a mobile app that **coordinates** the care of street animals in
Türkiye. The core idea: a neighborhood has many people who care for street
animals, but they don't know about each other. Three people may drop food at
the same corner while two streets over nobody does. The app closes this
invisible coordination gap.

The solution rests on three legs:

**The map shows reality.** When a user leaves food or water, the record
lands at their own position — there is no map pin to place — and a camera
photo is mandatory, checked by a vision model. A 100 m area around the drop turns green
and fades over time: food in 4 hours, water in 6. The map is the live answer
to "is this area being cared for?" — areas that stay uncovered are the
neglected ones.

**Animals have identities.** Users create profiles for individual animals:
photos, species, breed, location. Each profile carries a chat among the
people involved and a health history — which illness, which treatment,
recovered or not. "Who fed this cat, did it get its medication" no longer
lives in one person's head.

**Gamification sustains it.** Badges, points, and a leaderboard reward
regular care. The friendship system makes contributions visible.

### For whom
Animal lovers, neighborhood residents, veterinarians, animal-rights
activists, and municipal workers.

---

## 2. What works today?

The MVP is complete and tested end to end. All of the following works:

### Map and care marking
- Türkiye-focused map; opens near the user's location
- "Left food" / "left water" actions with a **mandatory photo** — the camera
  opens and the action can't complete without a shot
- **The record lands where you stand.** The old "within 20 m of the point
  you tapped" check is gone: the app stopped asking for a pin and sends the
  device's own position, so the check had come to mean comparing that
  position with itself (`backend/src/controllers/care.controller.js`)
- One map, not two: food and water share it, drawn as depleting rings
- A 100 m halo around each drop turns green and fades (food 4 h, water 6 h);
  the more drops at a spot, the stronger the green
- If there is no care within 100 m of the user (the same radius as the halo),
  the app warns — i.e. you are warned exactly when outside a green circle
  (the base map is never painted; absence of care is plain map + a banner)

### Animal profiles
- Manual registration: at least 1 photo, taken with the camera in the app
  (no gallery), multiple-choice breed/pattern lists per species
- Adding an animal runs the match flow first: after the form, a short
  "AI matching" screen — the name is literal, a vision model compares the
  photo with each candidate's cover photo — then same-species animals within
  1 km listed with a similarity level (high/medium/low). "It's this one" moves the animal's
  current location there and adds the user as a carer; "none" creates a new
  record (duplicate reduction — see ROADMAP §1)
- The avatar previews live in the form as species/pattern are picked
- At street-level zoom animals appear as round avatar markers; tap to open
- The animals tab lists those within 1 km sorted by distance, paginated, with
  a species filter
- Dropping food/water makes hearts fly from the avatars of animals within the
  100 m effect area; the map zooms to the area
- Profiles show a mini map, photo gallery, and last-seen info

### Chat and health tracking
- Every profile has a chat; carers and registrars can comment (commenting
  adds you to the carer list)
- Health records for illness and treatment
- A comment can be linked to a health record ("gave the medication for this
  illness"); tapping a record lists all its comments
- **Three-state tracking:** not started (no comments) → in treatment (at
  least one comment) → recovered (marked by a carer). Recovered records
  accept no new comments

### Badges, points, leaderboard
Three badge groups, each in bronze / silver / gold / diamond tiers. **Nothing
counts days:** badges count what you did, not how many days running you did it
(owner, 2026-09-11) — a streak punished one missed day and rewarded nobody for
two drops in an afternoon. Migration 015 renamed the stored `streak:` keys to
`care:` and `scripts/recompute-badges.js` re-awarded them.

| Group | Badges | Thresholds |
| --- | --- | --- |
| Care | Mama Gönüllüsü (food records), Su Gönüllüsü (water records) | 1 / 10 / 50 / 250 |
| Care | Kayıt Gönüllüsü (animals registered) | 1 / 5 / 20 / 100 |
| Count | Takip Gönüllüsü (comments) | 1 / 10 / 50 / 200 |
| Count | Sağlık Gönüllüsü (health records), Aşı Gönüllüsü (vaccinations) | 1 / 5 / 20 / 100 |
| Pattern | One per cat/dog pattern: Tekir Dostu, Sarman Dostu, Kangal melezi Dostu… | 1 / 5 / 20 / 100 registrations |

Two naming patterns and no third — "<Area> Gönüllüsü" for contributions,
"<Pattern> Dostu" for patterns — so adding a category is mechanical instead of
requiring another joke. A badge reads with its tier in front: "Altın Mama
Gönüllüsü". Aggressive words like "hunter" were avoided, because what's being
pursued here is a living creature receiving care, not prey. (Badge names are
product content and stay Turkish.)

- Points: bronze 10, silver 25, gold 60, diamond 150
- Comments score extra but **weighted**: at most 5 comments per animal count
  (1 point each) plus 3 points per distinct animal commented on — piling
  comments on one animal doesn't farm points
- A user's tier is recomputed from live counts on every read — not stored, so
  it follows the count down as well as up (deleting a care record inside its
  15-minute window, or an admin deleting an animal). `user_badge_awards` is
  history for the celebration modal, not the source of truth. Animal badges
  are the sticky ones
- Users feature up to 3 badges on their profile
- The leaderboard ranks users by points; ties share ranks (1, 2, 2, 4).
  Showcase (demo), suspended and self-deleted accounts hold no rank

**Levels:** total points map to a 10-step ladder of responsibility — Yeni
Komşu (0) → Mahalle Gönüllüsü (40) → Düzenli Gönüllü (120) → Mahalle Sorumlusu
(250) → Kıdemli Gönüllü (450) → Bölge Gönüllüsü (750) → Mahalle Temsilcisi
(1200) → Kıdemli Temsilci (1800) → Şehir Gönüllüsü (2600) → Onur Üyesi (3600).
The profile shows a progress bar and the points to the next level, and the
level emblem is a procedural SVG mark drawn from the number, not an emoji.

**Celebrations:** a new badge opens a modal with the badge, its points,
old → new rank, and the new level if any. Multiple badges queue up; badges
earned while the app was closed are caught when the profile opens.

### Social
- Avatars, user search, friend requests and acceptance
- Profiles (own and others') show the level bar, featured badges, cared-for
  animals with photos, and recent comments with a "see all" history

### Notifications
- While the app runs, every 30 minutes (and on foregrounding) it checks
  whether food/water remains within 100 m; if not, an on-device notification
  fires
- The same alert repeats at most every 6 hours
- Location is never streamed to the server — the check runs on device

### Admin panel (web)
A separate web app on the same API. Only `role = admin` accounts may enter;
every `/api/admin` request passes `requireAdmin` on the server.

- **Dashboard** — user/animal/care/comment counts, suspended accounts,
  species distribution, a 30-day activity chart
- **Users** — search, role changes (user/vet/admin), suspension. A suspended
  account is rejected on every request even with a valid token
- **Animals** — edit, delete, and **duplicate merge**: the source record's
  photos, comments, health records, and carers move to the target and the
  source is deleted (single transaction)
- **Care records** — moderation of evidence photos
- **Comments** — removing abusive comments
- **Ads** — brands, slots, images, campaign windows, activation, and
  impression/click/CTR reports
- **Audit log** — every panel action: who, when, what, why

The first admin is created with `npm run make-admin -- email@address` (admin
endpoints already require admin rights, so it can't be done via the API).

### Ads
Not an ad network — a small in-house ad server. Brands are entered manually
in the admin panel and slots are deliberately specific.

- **Three slots:** food popup, water popup, and the health-record screen
  (vet clinics)
- **Rotation:** brands in a slot take turns; each popup open shows the next
- **Measurement:** impressions and clicks are recorded separately and
  reported with CTR — without this you can't sell to a brand
- Campaign date windows and activation; with nothing active the banner
  doesn't render at all
- A mandatory "Reklam" (ad) label: users must be able to tell content from
  advertising

### Demo data
`npm run seed` creates 100 users, 200 animals, food/water actions around
Kadıköy, and chats on animal profiles. The first 20 users get 30 days of food
and water records, the next 30 get 7 days, the rest 1-3 — which reaches silver
on the care ladder (1/10/50/250) and bronze on most others; no gold or diamond
tier appears in seeded data. For demo data that is safe beside real rows, see
`npm run seed-showcase` (additive `is_demo` rows, removable with
`seed-showcase:remove`) and [DEPLOYMENT.md](DEPLOYMENT.md).

---

## 3. How does it work? (Technical)

### Layout
```
pati/
├── backend/    Node.js + Express API (PostgreSQL + PostGIS, JWT)
├── mobile/     React Native app (iOS + Android)
├── web/        React + Vite PWA (MapLibre)
├── admin/      Web admin panel (React + Vite + TS)
├── shared/     Plain-SVG generators (web + admin)
└── docs/       Documentation
```

### Stack
| Layer | Choice |
| --- | --- |
| Mobile | React Native 0.74.5, React 18.2, TypeScript |
| Maps | MapLibre on all three clients, one generated style, tiles from OpenFreeMap (ADR-0002). `react-native-maps` and `leaflet` are not dependencies |
| Navigation | React Navigation 6 (native-stack + bottom-tabs) |
| Notifications | @notifee/react-native |
| Backend | Node.js 18+, Express 4 |
| Database | PostgreSQL 16 + PostGIS 3.4 |
| Auth | JWT (7 days) + bcrypt |
| Uploads | multer → fitted to 1600 px (512 for avatars) → Cloudflare R2 when the four `S3_*` secrets are set, local disk otherwise (`backend/src/config/storage.js`) |

### Data model
```
users              user, avatar_url, featured_badges (JSONB)
animals            species, breed, location (GEOGRAPHY POINT), location_updated_at
animal_photos      animal photos
animal_comments    profile chat; can link to a health record via health_record_id
health_records     illness/treatment; recovery via recovered_at + recovered_by
vaccinations       vaccine type, vet_verified, next due date
user_animal_care   who cares for which animal (many-to-many)
care_actions       location, type (food/water), photo_url, time
friendships        requester/addressee, pending|accepted
user_badge_awards  the moment a badge was first earned + points/rank/level then
audit_log          every admin-panel change: who, what, when, why
advertisers        advertiser: slot, image, target URL, campaign window
ad_events          impression and click records (rotation + billing)
petshops           shop listing on the map: name, address, phone, hours,
                   link, location, hidden flag, visibility window
```
Geo columns are `GEOGRAPHY(POINT, 4326)` with GIST indexes. Proximity uses
`ST_DWithin`, the map viewport `ST_MakeEnvelope`, and responses `ST_AsGeoJSON`.

### API
```
POST   /api/auth/register | /login

GET    /api/care-actions              (bbox + type filter)
GET    /api/care-actions/status       (is care missing at a location)
POST   /api/care-actions              (multipart: photo + location verification)

GET    /api/animals                   (proximity + species filter)
GET    /api/animals/match             (duplicate matching by fields alone)
POST   /api/animals/match             (multipart: same ranking, then a vision model
                                       compares the photo with the candidates)
GET    /api/animals/:id
POST   /api/animals
POST   /api/animals/:id/sightings     (sighted: move location + add carer)
POST   /api/animals/:id/photos
POST   /api/animals/:id/comments      GET .../comments (paged)
POST   /api/animals/:id/health-records
POST   /api/animals/:id/health-records/:recordId/recover
POST   /api/animals/:id/vaccinations  GET .../vaccinations

GET    /api/users/me | /me/animals | /me/comments | /search | /:id
GET    /api/users/:id/comments
POST   /api/users/me/avatar
PUT    /api/users/me/featured-badges
GET    /api/users/me/badge-awards          # unseen badge celebrations
POST   /api/users/me/badge-awards/seen

GET    /api/friendships/me
POST   /api/friendships | /:id/accept    DELETE /api/friendships/:id

GET    /api/leaderboard

GET    /api/petshops                  (bbox; only listings inside their window,
                                       open to signed-out visitors)

GET    /api/ads?slot=...                  # next ad for a slot
POST   /api/ads/:id/impression            POST /api/ads/:id/click

                                          # all requireAuth + requireAdmin
GET    /api/admin/stats
GET    /api/admin/users                   PATCH /api/admin/users/:id
GET    /api/admin/animals                 PATCH /api/admin/animals/:id
DELETE /api/admin/animals/:id             POST  /api/admin/animals/:id/merge
GET    /api/admin/care-actions            DELETE /api/admin/care-actions/:id
GET    /api/admin/comments                DELETE /api/admin/comments/:id
GET    /api/admin/advertisers             POST  /api/admin/advertisers
PATCH  /api/admin/advertisers/:id         DELETE /api/admin/advertisers/:id
POST   /api/admin/advertisers/:id/image
GET    /api/admin/petshops                POST  /api/admin/petshops
PATCH  /api/admin/petshops/:id            DELETE /api/admin/petshops/:id
GET    /api/admin/audit-log
```

### A few implementation details worth knowing
- **Fade window = warning window.** The green's fade time equals the
  "care missing" warning window on purpose; if they differed, warnings could
  fire while the map was still green. The window is computed per row
  (`CASE action_type`), so food and water fade at their own speeds even in
  one query.
- **Illness state is derived, not stored.** It falls out of "any comments?"
  and "recovered_at set?" in SQL, so it can never desync from reality.
- **Featured badges store only the key**, not the tier — when the user
  reaches gold, the profile badge upgrades by itself.
- **Streaks** use the classic gaps-and-islands SQL pattern, no app-side loops.
- **The leaderboard is set-based**: one query set for all users, never a
  query per user.

Detailed rationale for these decisions: [NOTES.md](NOTES.md).

---

## 4. Known limits

Accepted knowingly; to be closed before production. Full list with rationale
in [NOTES.md](NOTES.md); the most important:

1. **The leaderboard recomputes per request.** Fine at hundreds of users,
   unsustainable at thousands — points will need periodic materialization.
   First place to look when scale grows.
2. ~~**Photos on the server's local disk.**~~ **Closed 2026-09-10.** Uploads
   are re-encoded and stored in Cloudflare R2 (EU jurisdiction) with the disk
   as a cache; the stored URL stays `/uploads/<file>` either way. What is
   still true: a second machine would not work, because the photo-token
   flows and the AI's gallery reads go through the local volume.
3. **Numbered migrations, no ledger.** `scripts/migrate.js` re-applies every
   `.sql` file in `migrations/` on every deploy (it is the Fly release
   command), so every statement must stay idempotent and a schema change
   belongs in `001_init.sql` *and* a new numbered file. A `schema_migrations`
   ledger would lift that constraint.
4. ~~**Photo evidence unvalidated; rate limiting only on auth.**~~ **Both
   closed.** Every care and animal photo is checked by a vision model
   (ADR-0005), and content writes are rate-limited across eight route files,
   not just auth — seven keyed on the user through
   `backend/src/middleware/rateLimit.middleware.js`, with `report.routes.js`
   keying on the IP through its own limiter. Reports, a moderation queue and
   user blocking shipped as well.
5. **Automated-test coverage is uneven.** 134 backend unit tests and 193
   mobile ones pass, but none of them exercises an application route — the curl
   harnesses in `backend/scripts/*/run.sh` are what cover the API, and they
   are not in the battery.
6. **Notifications only while the app runs.** Real background push needs
   APNs/FCM or geofencing.

---

## 5. The five big items, and what's next

Four of the five are closed; donations waits on external parties. What is
actually next is the Android release. Detailed plans and open decisions live
in [ROADMAP.md](ROADMAP.md).

### 1. AI animal matching — ✅ done
Live since 2026-09-04 through a hosted vision model (ADR-0005). The field
ranking (pattern + color + distance within 1 km) still runs first; then, when
the client posts the photo (`POST /api/animals/match` — the `GET` form stays
field-only), one `generateContent` request compares it with the best
candidates' cover photos and lifts or sinks them (same → high, similar → +1, different →
low). Tiers, screens and the user's final say are unchanged, and without
`GEMINI_API_KEY` the ranking is field-only.

The embedding service + `pgvector` plan this section used to describe is
**retired as the way matching gets built** — a vector index would now be an
optimisation rather than a missing feature. See [ROADMAP §1](ROADMAP.md),
which keeps the spike's measured cost and speed numbers for the record. Its one unmeasured risk was the one
that mattered: whether a model recognises the same cat under street
conditions. A hosted model answers that without the 2 GB of RAM, the vector
store, or the calibration work.

### 2. Donations — deferred
In-app donations to organizations entered via the admin panel; 5% stays with
the platform. Blockers are external: payment provider (iyzico/PayTR
**marketplace / sub-merchant model**, so money flows directly to the
organization — collecting first would make us a regulated donation collector
under Turkish law 2860), legal entity, accountant/lawyer sign-off, and store
rules (Apple requires charity donations to use external payment, not IAP).
The 5% cut must be stated clearly on the donation screen.

### 3. Ads — ✅ done
See §2 above.

### 4. UI — ✅ done
The "pati" brand identity across the app; the web PWA additionally follows
the newer studio aesthetic. Details: [DESIGN.md](DESIGN.md).

### 5. Admin panel — ✅ done
See §2 above.

### Status
```
✅ Admin panel + roles  ──> ✅ Ads
⏸️  Donations — deferred (payment provider, legal, stores)
✅ AI matching — live through a hosted vision model (ADR-0005); the embedding
   + pgvector plan is retired
✅ Design system + UI
✅ Launch sprint — done except its Android items; iOS 1.0 build 2 is with
   App Review (docs/store/APP-STORE.md)
🤖 Android release ← NEXT: the Play Console track, on the same codebase
```

---

## 6. Setup summary

Detailed steps in [README.md](../README.md). In short:

```bash
# Database
docker run -d --name stray-db -p 5433:5432 \
  -e POSTGRES_USER=stray -e POSTGRES_PASSWORD=stray -e POSTGRES_DB=stray \
  imresamu/postgis:16-3.4

# Backend
cd backend && cp .env.example .env && npm install && npm run migrate && npm run dev
npm run seed        # optional: demo data (100 users + 200 animals)

# Mobile
cd mobile && npm install
cd ios && bundle exec pod install && cd ..   # required when native deps changed
npm run ios         # or npm run android
```

Demo accounts: `test1@stray.test` … `test100@stray.test`, password `password123`.
