# pati — Project Document

**Last updated:** August 2026
**Repo:** https://github.com/oguzpancuk/Pati

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

**The map shows reality.** When a user leaves food or water they mark the
spot — a photo is mandatory and they must physically be there (location
verification with a 20 m tolerance). A 100 m area around the drop turns green
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
- **Location verification** — if the user's live position is more than 20 m
  from the marked point, the action is rejected and the distance is shown
- Food and water maps are separate views
- A 100 m halo around each drop turns green and fades (food 4 h, water 6 h);
  the more drops at a spot, the stronger the green
- If there is no care within 100 m of the user (the same radius as the halo),
  the app warns — i.e. you are warned exactly when outside a green circle
  (the base map is never painted; absence of care is plain map + a banner)

### Animal profiles
- Manual registration: at least 2 photos, multiple-choice breed/pattern lists
  per species
- Adding an animal runs the match flow first: after the form, a short
  "AI matching" screen, then same-species animals within 1 km listed with a
  similarity level (high/medium/low). "It's this one" moves the animal's
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
Three badge groups, each in bronze / silver / gold / diamond tiers:

| Group | Badges | Thresholds |
| --- | --- | --- |
| Streak | Mama Perisi, Su Elçisi, Mahalle Muhabiri — longest consecutive-day streak | 1 / 7 / 30 / 365 days |
| Breed | One per cat/dog breed: Tekir Ahbabı, Sarman Sırdaşı, Kangal Yoldaşı… | 1 / 5 / 20 / 100 registrations |
| Counter | Mahalle Dedikoducusu (comments), Pati Şifacısı (health) | Comments 1/10/50/200 · Health 1/5/20/100 |

A badge reads with its tier: "Altın Tekir Ahbabı". Names are deliberately warm
and playful — aggressive words like "hunter" were avoided, because what's
being pursued here is a living creature receiving care, not prey. (Badge
names are product content and stay Turkish.)

- Points: bronze 10, silver 25, gold 60, diamond 150
- Comments score extra but **weighted**: at most 5 comments per animal count
  (1 point each) plus 3 points per distinct animal commented on — piling
  comments on one animal doesn't farm points
- A badge, once earned, never demotes
- Users feature up to 3 badges on their profile
- The leaderboard ranks everyone by points; ties share ranks (1, 2, 2, 4)

**Levels:** total points map to a 10-step ladder — 🌱 Yeni Komşu (0) →
🏘️ Mahalle Sakini (40) → 🤝 Sokak Gönüllüsü (120) → 🍲 Mama Nöbetçisi (250) →
🐾 Pati Dostu (450) → 🧭 Sokak Kâşifi (750) → 🎖️ Mahalle Muhtarı (1200) →
🦉 Sokak Bilgesi (1800) → 🦸 Pati Kahramanı (2600) → 👑 Sokakların Piri (3600).
The profile shows a progress bar and the points to the next level.

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
Kadıköy, and chats on animal profiles. 20 users have 30-day streaks and 30
have 7-day streaks, so every badge tier appears in the data. For
production-safe demo data (guide accounts across 37 districts) see
`scripts/seed-rehber.js` and [DEPLOYMENT.md](DEPLOYMENT.md).

---

## 3. How does it work? (Technical)

### Layout
```
pati/
├── backend/    Node.js + Express API (PostgreSQL + PostGIS, JWT)
├── mobile/     React Native app (iOS + Android)
├── web/        React + Vite PWA (Leaflet)
├── admin/      Web admin panel (React + Vite + TS)
├── shared/     Plain-SVG generators (web + admin)
└── docs/       Documentation
```

### Stack
| Layer | Choice |
| --- | --- |
| Mobile | React Native 0.74.5, React 18.2, TypeScript |
| Maps | react-native-maps 1.14.0 (Apple Maps on iOS, Google Maps on Android); Leaflet on web |
| Navigation | React Navigation 6 (native-stack + bottom-tabs) |
| Notifications | @notifee/react-native |
| Backend | Node.js 18+, Express 4 |
| Database | PostgreSQL 16 + PostGIS 3.4 |
| Auth | JWT (7 days) + bcrypt |
| Uploads | multer → local disk (`backend/uploads/`) |

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
GET    /api/animals/match             (heuristic duplicate matching)
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
2. **Photos on the server's local disk.** No backups, no multi-node, no
   resizing. Production needs object storage (S3/R2) + CDN.
3. **Single migration file** — schema changes reset the database. Move to
   incremental migrations before real data.
4. **Photo evidence unvalidated; rate limiting only on auth.** Moderation and
   abuse protection needed.
5. **Very low automated-test coverage.**
6. **Notifications only while the app runs.** Real background push needs
   APNs/FCM or geofencing.

---

## 5. What's next?

Detailed plans and open decisions live in [ROADMAP.md](ROADMAP.md).

### 1. AI animal matching (v2)
The current matcher is heuristic (breed + color + distance within 1 km). v2
replaces it with image embeddings: a pretrained model (DINOv2/CLIP) produces
vectors, cosine similarity runs over a PostGIS-narrowed candidate set, and
vectors live in `pgvector`. **Important:** cosine similarity is not a
probability — "87% same" would mislead. Tiered labels first ("very similar /
similar"), a calibrated score once data accumulates. The final call always
stays with the user.

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
⏸️  AI matching v2 — parked (cost/speed measured; accuracy needs real photos)
✅ Design system + UI
🚀 Launch sprint ← NEXT, the only mandatory block left
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
