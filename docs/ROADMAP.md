# Roadmap

The MVP is complete (map, care marking, animal profiles, chat, health
tracking, badges, leaderboard, friendships, notifications). The remaining
large items are below. Each lists **what**, **the suggested approach**, and
**open decisions** separately.

For the technical-debt list that must close before production, see
[NOTES.md](NOTES.md).

---

## Suggested order

```
✅ 1. Admin panel (item 5)  ──┬──> ✅ 2. Ads (item 3)
   + role infrastructure      └──> ⏸️  Donations (item 2) — deferred until
                                       external parties are settled
✅ 3. AI animal matching (item 1) — live through a hosted vision model (ADR-0005)
✅ 4. Design system + UI (item 4)
🚀 5. Launch sprint               ← NEXT, the only mandatory block left
```

> **Why donations were deferred:** the blockers are external, not code —
> payment provider, legal entity, accountant/lawyer, store rules. The
> decision list under [item 2](#2-donations--️-deferred) is ready and waiting.

**Why this order:**

- **Admin panel first**: both advertisers and donation organizations were
  specified as "entered via the admin panel" — no admin, no data entry for
  either. Role infrastructure (`users.role`, `requireAdmin`) also underpins
  everything after it.
- **Ads second**: technically the simplest (CRUD + rotation + impression
  counter), no external dependency, first revenue line.
- **Donations later**: the only item with an external dependency — payment
  integration, legal review, store rules. Those must settle before code.
- **UI in two phases.** A small design system (color/typography/spacing
  tokens) immediately, so new screens build on it; the full re-skin last,
  because every feature adds screens and early skinning gets wasted.
- **AI matching can run in parallel** as a separate service attached through
  a single endpoint. The biggest technical unknown lives there, so an early
  2–3 day spike was recommended.

---

## 1. AI animal matching

> **Status (September 4, 2026): live, through a hosted vision model —
> ADR-0005 (Gemini since September 7; owner decision the same day: its
> paid tier — the free one is ~20 requests a day).**
> `POST /api/animals/match` takes the first photo; the server ranks nearby
> same-species records by the fields as before, then one `generateContent`
> request compares the photo with the best candidates' cover photos and
> lifts/sinks them (same → high, similar → +1, different → low). Tiers,
> screens and the user's final say are unchanged; without
> `GEMINI_API_KEY` the ranking is field-only, as before. The embedding
> service + pgvector plan below is retired — the spike's numbers are kept
> for the record. Evidence: `backend/scripts/ai-check/run.sh` (92
> assertions against a fake `generateContent` endpoint); accuracy against real photos is
> the owner's call with `live-sample.js` and the key.

### 📊 Spike results (August 18, 2026) — cost and speed measured

**Environment:** 4 CPU cores, no GPU. The embedding model used random weights
on the **real architecture** — forward-pass time depends on architecture and
input size, not on whether weights are trained, so the milliseconds hold for
real DINOv2/CLIP weights too.

**Photo → vector (CPU, 3 photos per record, batched):**

| Model                                | 1 photo | 3 photos | Per record |
| ------------------------------------ | ------- | -------- | ---------- |
| ViT-B/16 (86M) — DINOv2-base class   | 136 ms  | 335 ms   | **0.33 s** |
| ViT-B/32 (88M) — CLIP ViT-B/32 class | 49 ms   | 84 ms    | **0.08 s** |
| ResNet-50 (25M)                      | 51 ms   | 101 ms   | 0.10 s     |
| MobileNetV3-L (5M)                   | 16 ms   | 28 ms    | 0.03 s     |

**Vector search (pgvector 0.6; 25,000 animals × 3 photos = 75,000 vectors, 768-d):**

| Candidate set                | Vectors | Time     |
| ---------------------------- | ------- | -------- |
| 1 km radius                  | ~300    | **4 ms** |
| 3 km radius                  | ~2,850  | 20 ms    |
| 10 km radius                 | ~31,400 | 261 ms   |
| No geo narrowing (full scan) | 75,000  | 309 ms   |

**Storage:** 75,000 vectors + index = **309 MB**.

#### Conclusions

1. **Added user-facing latency ~0.35 s** (ViT-B/16 + 1 km search). Better
   than the earlier 1–2 s estimate. **No GPU needed.**
2. **No per-request fees** — the model runs on our own server. Cost = ~2 GB
   extra RAM. Even with thousands of users the model runs ~200×/day
   (registering an animal is rare), so the server mostly idles.
3. **Geo narrowing decides everything:** 4 ms at 1 km vs 309 ms without —
   a 75× gap. PostGIS-first narrowing is the critical piece of the design.
4. **Model choice is a tradeoff:** ViT-B/32 is 4× faster than B/16 with
   smaller vectors (512 vs 768-d → 33% less storage). Accuracy measurement
   will decide which suffices.

#### ⚠️ Not yet measured: accuracy

The real risk isn't cost but whether the model **recognizes the same cat**
under street conditions (bad light, distance, motion). It couldn't be
measured in the spike environment: the VM's network policy blocks the weight
and dataset hosts (huggingface.co, download.pytorch.org, GitHub releases,
GCS). Only PyPI was reachable — packages install, trained weights don't.

**Needed for the accuracy measurement (either works):**

- Photos of the same street animals at different times/angles (10–20 animals
  × 3–4 photos gives a first signal), **or**
- Running the prepared script in a network-open environment (a local machine);
  open datasets without auth exist.

**Metric:** "does the second photo of the same animal land in the top 5?"
(top-5 hit rate), plus the false-match rate for a score threshold.

> **Setup note:** `pgvector` is a separate PostgreSQL extension. The
> `imresamu/postgis` image may not include it; verify or install
> `postgresql-16-pgvector` before integration.

<details>
<summary>Full plan</summary>

### Desired flow

"Add animal" opens the form directly. After fields and photos, AI shows the 5
most similar registered animals nearby with similarity. Picking one adds the
user to that animal's carers; picking none creates a new record.

> **Status (August 19, 2026):** the flow's UI and skeleton are **live**; only
> the "AI" part is a rule-based placeholder. Form → "AI matching…" screen
> (min 2 s) → same-species animals within 1 km listed as **high / medium /
> low** similarity → "it's this one" or "new record". The tier currently
> comes from pattern (+2), color (+1), and ≤200 m distance (+1)
> (`GET /api/animals/match`, `animal.controller.js` → `similarityFor`).
> When the embedding service arrives it plugs into the same endpoint; UI and
> tiers stay, and the artificial 2 s wait
> (`AddAnimalScreen.tsx` → `MIN_MATCHING_MS`) goes away.

### Suggested approach

**Don't train a model.** A pretrained image-embedding model is sufficient and
far cheaper:

1. **Narrow candidates by geography first.** PostGIS `ST_DWithin`, ~1 km.
   Comparing against every animal in Türkiye is slow and meaningless (the
   same animal isn't 300 km away).
2. **One embedding per photo.** Candidates: DINOv2 (strong for visual
   similarity), CLIP (more general), or open pet-reid models. Runs as a small
   Python microservice (FastAPI).
3. **Store vectors in the database.** PostgreSQL is already there; `pgvector`
   with an `animal_photos.embedding vector(768)` column keeps moving parts
   minimal.
4. **Animals have several photos** — score an animal by the **max** similarity
   across its photos (one shot may be from behind).
5. **Filter by species/breed.** "cat / Tekir" already narrows the set; faster
   and more accurate.

### The "probability" trap

Cosine similarity is **not a probability**. Showing "87% the same animal"
would mislead. Options:

- **Easy path:** tiered labels ("very similar / similar / less similar"),
  no numbers.
- **Right path:** calibrate scores with accumulated same/different decisions
  (Platt scaling suffices), then show a real probability. Needs data first —
  so ship the easy path, record user choices, calibrate later.

Either way **the user makes the final call**; never auto-merge.

### Tasks

- [ ] Spike: measure DINOv2/CLIP similarity on 20–30 real street-animal
      photos; is accuracy sufficient (2–3 days)
- [ ] `pgvector` extension + `animal_photos.embedding` column + index
- [ ] Python embedding service (FastAPI) + backend call
- [ ] Batch script vectorizing existing photos (seed data included)
- [ ] `GET /api/animals/match` — **rule-based version live**
      (species/pattern/color/distance); embedding score joins this endpoint
- [x] Mobile: match flow — form + photos, then matching screen with
      "it's this one" / "create new" (August 19, 2026)
- [ ] Record user choices in `animal_match_feedback` (future calibration)

### Open decisions

- ~~Where does the embedding service run; is CPU enough?~~ → **CPU is enough,
  no GPU** (spike: 0.33 s per record)
- ~~Score as a number or a tier?~~ → **tier** (high/medium/low); no numbers
- ~~Flow when no match is found~~ → with zero same-species records within
  1 km, a **new record opens silently** (nothing to ask about)
- ViT-B/16 vs ViT-B/32? (settled by the accuracy measurement — B/32 is 4× faster)

</details>

---

## 2. Donations — ⏸️ deferred

> **Status: deferred (August 18, 2026).** Decision: _"too many external
> parties need settling."_ Correct call — the blockers are not code: payment
> provider, legal entity, accountant/lawyer, store rules. Code written before
> those settle would likely be thrown away.
>
> The **decision list** below is ready; once these four settle, the item
> opens immediately.

### Must settle before any code

| #   | Decision                                                                        | Why it blocks                                                    |
| --- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | **Payment provider and model** — marketplace (split payment) or single account? | Data model and money flow depend on it. _Suggested: marketplace_ |
| 2   | **Legal entity** — is a company formed; whose name is on the merchant account?  | Can't move past test environments                                |
| 3   | **Legal review** — the 5% fee + donation-collection permits (Turkish law 2860)  | Wrong model = unlicensed donation collection                     |
| 4   | **Store rules** — Apple/Google charity rules (external payment, not IAP)        | Wrong integration = store rejection                              |

**Why marketplace:** collecting money into your own account first and then
forwarding it makes you a "donation collector", which is permit-gated in
Türkiye (Law 2860 on Aid Collection). In the marketplace model the money goes
straight to the organization and you take a service fee — cleaner both
operationally and legally.

### Product decisions (needed while coding, not blocking)

- How do organizations join — added by you, or applications?
  (sub-merchant onboarding needs their paperwork)
- Recurring (monthly) donations? _Suggested: one-off only in v1_
- Amounts: fixed buttons, free entry, limits?
- How is "donate to the app" explained? (not a charity donation — platform
  support; the 5% logic doesn't apply, it's all yours)
- Anonymous donations? Shown on profiles/lists?
- Ad-free experience for donors? (open question from item 3)

### ⚠️ A design decision worth pausing on

**Should donation points enter the leaderboard?**

Badges are fine. But if their points count toward the leaderboard, the
ranking morphs from "who cares the most" into partially "who pays the most".
Everything built so far (streak badges, breadth-weighted comment points)
exists precisely to prevent that.

**Suggested:** donation badges live in a separate showcase and don't affect
leaderboard points. Visible on the profile, selectable among the featured 3,
but no ranking effect. A separate "Supporters" list is possible. This doesn't
devalue donating — it just doesn't mix two kinds of contribution.

<details>
<summary>Technical plan (opens when the decisions settle)</summary>

### Desired flow

Organizations entered via the admin panel; users donate in-app; **5% stays
with the platform**; direct-to-app donations appear at the top; total donated
amount earns badges.

### Approach

1. **Pick a provider.** iyzico and PayTR are the common Turkish options; both
   offer a marketplace / sub-merchant model. **That model matters**: automatic
   fee split, organization's share flows directly to them.
2. **Never collect first, forward later** (see "why marketplace" above).
3. **Store rules:** Apple requires donations to registered charities to use
   external payment, **not IAP**; Google is similar. Verify the current rules
   before integrating.
4. **"Donate to the app" is a separate item** — platform support, not
   charity; stores may treat it differently and the 5% doesn't apply.
   Explain the difference clearly to users.
5. **Transparency.** The 5% must be stated on the donation screen before
   donating. Taking a fee on charitable payments is legally and
   reputationally sensitive — don't ship without accountant/lawyer sign-off.

### Data-model sketch

```
donation_orgs      (id, name, logo_url, description, website, tax_id,
                    provider_submerchant_id, active, sort_order)
donations          (id, user_id, org_id NULL, amount, currency, platform_fee,
                    provider_payment_id, status, created_at)
                    -- org_id NULL = direct-to-app donation
```

A new badge group in `badges.js`: tiers by total donated (`donation:total`).

### Tasks

- [ ] Provider selection + account + sandbox
- [ ] Legal review: fee model, permit requirements, user-facing texts
- [ ] Schema: `donation_orgs`, `donations`
- [ ] Backend: org list, donation initiation, provider webhook, history
- [ ] Admin: org CRUD, donation and fee reports
- [ ] Mobile: donation screen (app-donation on top), payment flow, receipt
- [ ] Badge: tiers by total amount

</details>

---

## 3. Ads — ✅ done

**Shipped (August 18, 2026):** three slots (`food_popup`, `water_popup`,
`vet_health_record`), advertiser management in the admin panel (image upload,
campaign window, activation, ordering), the mobile `AdBanner`, and
impression/click measurement + CTR reports.

**Rotation decision:** no separate cursor table — the position derives from
how many impressions the user has in that slot (`impressions % brand_count`).
Impressions are recorded for billing anyway, so this yields a **per-user**,
evenly distributed rotation with zero extra state. A global cursor was
rejected: two users opening at once would both see the same brand.
Full rationale in [NOTES.md](NOTES.md).

**Remaining:**

- [x] Rate limiting on login/impression endpoints (against fake
      impressions) — login has had its per-IP brake since August;
      impressions capped at 200/hour and clicks at 60 on 2026-09-10
- [ ] Ad-free experience for donors (decided with item 2)
- [ ] Whether the banner should be dismissible

---

## 4. UI — ✅ design system and re-skin done

**Shipped (August 18, 2026):** the "pati" brand identity. Details:
[DESIGN.md](DESIGN.md).

- **Theme layer** `mobile/src/theme/`: color, typography, spacing, radius,
  shadow tokens + navigation theme. Five brand colors fixed (orange
  `#F47A4A`, cream `#FFF3E7`, charcoal `#2B2B2B`, green `#34A853`, red
  `#FF5C5C`), the rest derived.
- **Nunito embedded** (SIL OFL, 4 weights, ~520 KB), full Turkish coverage,
  linked on iOS + Android via `react-native-asset`.
- **Core components** in `mobile/src/components/ui/`; **brand components**
  (SVG `Logo`, `Wordmark`, a 20-icon `Icon` set) in `components/brand/`.
- **All 11 screens** and 7 components migrated; hard-coded hex count went
  from 171 to 0 (the survivors live only under `theme/`).
- Dark mode (system/light/dark, warm-coffee dark palette), app icon and
  launch screens, package rename `com.straymobile` → **`com.patiapp`**.
- The web PWA additionally moved to the **studio aesthetic**
  (docs/design handoff): white surfaces, hairlines, Quicksand, gradient
  discipline.

### Remaining

- [ ] **Accessibility: white on orange.** Measured contrast on `#F47A4A` is
      **2.7:1** (AA needs 4.5:1). Kept because the brand identity shows it;
      decide before launch (darker fill ~`#C2551F` at 4.6:1, or dark text at
      5.3:1). _(The web studio aesthetic's gradient buttons have the same
      question.)_
- [ ] **Screen-reader labels** untested end to end.
- [ ] **Admin panel** still on its own palette; align with the brand.
- [ ] **Mobile port of the studio aesthetic** — web is ahead of mobile now.

---

## 5. Admin panel (web) — ✅ done

**Shipped (August 18, 2026):** React + Vite + TypeScript panel in `admin/`.
Infrastructure: `requireAdmin`, the `/api/admin/*` route group,
`users.suspended_at` suspension, and the `audit_log`. Screens: dashboard
(30-day activity chart), users, animals + duplicate merge, care-photo
moderation, comment moderation, audit log. First admin via
`npm run make-admin`. Advertiser management arrived with item 3. The panel is
served in production from the same Fly app under `ADMIN_HOST`
(admin.pati-app.com).

**Remaining:**

- [ ] Donation-org management and reports (with item 2)
- [ ] IP allowlisting and/or 2FA for the panel — recommended for a panel
      that can manipulate data **(open)**

---

## 🚀 Launch sprint — deferred, not forgotten

> **Status: in progress.** Deployment infrastructure shipped (Fly.io, single
> image, guide demo data); the remaining items below must close **before any
> real user touches the app**. Shipping with even one of them missing means
> data loss, abuse, or a KVKK (privacy-law) problem.
>
> **Bring this sprint up at the end of every major task.**

These are not features; they are "become shippable" work. Rationale lives in
[NOTES.md](NOTES.md). Estimate: 1–2 weeks.

**Data safety (no real data before these):**

- [x] Move photos to object storage (S3/R2) + image resizing — the code
      landed 2026-09-10: uploads are fitted to 1600 px (512 for avatars),
      and `config/storage.js` puts them in an S3-compatible bucket when the
      four `S3_*` secrets are set, disk otherwise, with the stored URLs
      unchanged either way. **Owner side still open:** create the R2 bucket
      and set the secrets (docs/DEPLOYMENT.md), then run
      `backend/scripts/publish-backlog.js` to copy the existing
      `/data/uploads` backlog into it — and again after anything that writes
      to the volume directly (`seed-guides.js`, `backfill-face-thumbs.js`)
- [ ] Move to incremental migrations (node-pg-migrate / Knex) — today a
      schema change resets the database
- [x] Database backups — automatic with managed Fly Postgres

**Abuse protection:**

- [x] Rate limiting beyond auth — every content write is now capped
      **per user** (not per IP: Turkish carriers CGNAT thousands of users
      behind one address). Ceilings sized at ~3x the heaviest honest use:
      care actions 40/h, new animals 20/h, comments 60/h, sightings/
      photos/follows 30/h, health+vaccine records 30/h, avatar 15/h,
      friend requests 30/h (`src/middleware/rateLimit.middleware.js`,
      Aug 19). In-process store — fine for one machine; a second machine
      needs a shared store. Auth keeps its per-IP 30/15 min
- [x] Photo moderation — part of the admin panel (item 5)
- [x] User reports + moderation queue — `content_reports` table,
      `POST /api/reports` (rate-limited, one open report per user per
      target), "şikayet et" on animals and comments in web+mobile, admin
      "Şikayetler" screen with resolve/dismiss + audit log (Aug 19)
- [x] User suspension + JWT rejection on every request
- [x] Restrict CORS — `CORS_ORIGINS` allowlist (env, set in fly.toml to the
      three pati hosts); requests without an Origin header (the native app)
      always pass, unset env keeps dev fully open (Aug 19)

**Pilot go/no-go — the single list (Aug 19):**

Developer side, done and verified in this repo:

- [x] Deploy pipeline, CI gate, DB backups, admin panel + roles
- [x] Auth per-IP brake + per-user write ceilings on every content endpoint
- [x] Moderation: user reports, admin queue, suspension
- [x] KVKK notice + terms at /gizlilik, named data controller, in-app
      account deletion
- [x] CORS allowlist (fly.toml ships the env)
- [x] Guide (tutorial) data live with hourly refresh

Ops/owner side, still open — the actual go/no-go gates:

- [x] `/deploy-checklist` run 2026-09-10: **v34 is live** (`1ad564c`), all
      gates green, schema-neutral. `/health` ok, both hosts 200, boot log
      `photos: disk (/data/uploads)`, `/gizlilik` and `/kosullar` open
- [ ] Smoke-test a report and an account deletion against production. They
      write real rows, so they are the owner's to run; `/gizlilik` is
      already checked. Split out of the deploy line above, which was
      checked off while two of its three gates had not run (review
      finding)
- [ ] iletisim@pati-app.com mailbox or forward (KVKK requests must land)
- [x] Fly volume snapshots are enabled — checked 2026-09-10: the
      `uploads` volume has scheduled snapshots, 14-day retention
- [ ] TestFlight/internal-testing build from current main (fonts changed:
      needs `npx react-native-asset` + a native build)
- [ ] Store metadata when going past TestFlight: screenshots, privacy
      declaration (the internal rename is done)

Deliberately deferred, with reasons:

- Object storage for photos: Fly volume snapshots cover the pilot's data
  risk; move before user count grows (the migration is cheap while the
  uploads folder is small)
- Incremental migrations: revisit when schema churn slows
- pgvector/AI matching: measured, blocked on accuracy testing (spikes/)

**Legal / stores:**

- [x] KVKK: privacy notice + short terms live at `/gizlilik` (source:
      `web/src/legal.ts`), linked from register screens, profile pages and
      the landing page (Aug 19). Veri sorumlusu filled in (Oğuz Pançuk).
      Remaining: create/forward the iletisim@pati-app.com mailbox (Ops —
      KVKK requests must actually arrive somewhere)
- [x] In-app account deletion (App Store 5.1.1(v) + the KVKK promise):
      DELETE /users/me re-authenticates with the password, anonymizes the
      row in place (community content survives as "Silinmiş Üye"), deletes
      friendships/follows/badge history/avatar file; "hesabı sil" in both
      web and mobile profiles (Aug 19)
- [ ] Store prep: icon, screenshots, privacy declaration
- [x] **Rename internals to pati (REQUIRED before stores)** — done
      2026-09-10 for everything a store can see: the iOS project, target,
      workspace, scheme, entitlements, test target and Podfile are
      `PatiMobile`, verified by a native build and simulator screenshots
      (map and profile). Android needed nothing — `namespace` is
      `com.patiapp`, `app_name` is `pati`, and no "stray" appears anywhere
      under `mobile/android`; the backend already logs as pati. **Left
      deliberately:** the LOCAL Docker container `stray-db` and its
      db/role `stray`. Nothing outside this machine sees them, and renaming
      forces a database reset plus edits to `contracts/init.sh`, the README
      and all four curl harnesses — a morning job with the owner's data in
      front of them, not a night one.
- [x] **Bundle id: `com.oguzpancuk.pati`** (September 2, 2026). `com.patiapp`
      is owned by another team and Apple refuses to register it; the device
      test had already proved this one registers. A domain-derived
      `com.pati-app.pati` was the first choice — it survives a later transfer
      to a company account without a personal name in it — but Android's
      applicationId forbids hyphens, and the two stores should carry the same
      identifier. Owner decision: publish under his own name for now
      (Individual Apple account), so the personal id is coherent. Applied to
      the Xcode project, `applicationId` in build.gradle (Android's
      `namespace` stays `com.patiapp` — it is only the generated R class's
      package, and it belongs to the internal rename below) and the simulator
      scripts. **Permanent once submitted to either store.**
- [x] Remove the location-override code (`mobile/src/location.ts`) —
      done 2026-09-10; the simulator scripts set the OS location instead

**Quality:**

- [x] CI (web/admin/mobile/backend/docker gates on every push —
      `.github/workflows/ci.yml`, August 19)
- [ ] Backend tests (jest + supertest; none exist yet)
- [x] **E-mail confirmation on registration** (September 3, 2026; ADR-0004).
      A six-digit code typed into the registering session — a code rather
      than a link, because a link verifies whoever clicks it. Pending
      accounts are gated server-side (403 `emailUnverified`) and both
      clients show the code screen; a verified address sets
      `email_verified`, so provider sign-in links into it (the ADR-0003
      gap). A pending registration holds its address for 24 hours and then
      becomes replaceable, which retires the "squatting is permanent"
      consequence. Verified by
      `backend/scripts/email-verification-check/run.sh` (93 curl assertions)
      and the code screen screenshots on both clients. **Turns on with
      `RESEND_API_KEY`** (owner: Resend account + DNS, docs/DEPLOYMENT.md);
      until then registration stays as it was. Left for later: "verify my
      e-mail" from the profile for grandfathered accounts, "set a password"
      for social accounts, password reset — all three share the mail
      transport this added.
- [x] **Admin: free a squatted address** — done 2026-09-10.
      `DELETE /api/admin/users/:id` runs exactly the anonymization the
      user's own deletion runs (extracted to `utils/accountDeletion.js` so
      the two cannot drift), refuses the admin's own account, another
      admin, and a row already anonymized, and writes an audit entry
      without the freed address in it. The panel offers "Sil" exactly where
      the server would accept it, with a dialog that says what actually
      happens; a tombstone row offers nothing, since `updateUser` refuses to
      edit one back to life too. Evidence:
      `backend/scripts/admin-check/run.sh`, 25 assertions, the one that
      matters being that the freed address registers again as a NEW
      account.
- [ ] Real background notifications (APNs/FCM) or geofencing

**Distribution:**

- [x] Backend deployed (Fly.io single image + managed PostGIS + volume;
      docs/DEPLOYMENT.md, August 19)
- [ ] TestFlight (iOS) and Play internal testing (Android) builds
- [ ] Pilot with 10–20 real users in a single neighborhood

---

## 🔧 Improvement sprint (planned August 30, 2026)

> **Status (September 2, 2026): every sprint item is now built.** S1–S6 and
> S8 are shipped and live, with two owner feedback rounds on top of them.
> S7 (Apple + Google sign-in) is code-complete on all three sides. What is
> left is the owner-side console work (Apple App ID / Service ID, the Google
> OAuth client ids) plus, for **iOS Google only**, two source edits and a
> native rebuild: the reversed client id in `Info.plist` and the same id in
> `mobile/src/googleClientId.ts`. Everything else — web Google, and Apple
> once the domain is verified — turns on with Fly secrets alone. The bundle
> id it depended on is settled: `com.oguzpancuk.pati` (launch sprint). Until
> the values exist the buttons stay hidden and nothing changes for users.
> Steps: docs/DEPLOYMENT.md.

Twelve owner-reported improvements, grouped into eight sessions — one
session per group, each ends with a code-reviewer pass. Owner decisions
already made are recorded inline; nothing below needs a new decision to
start. Interactive sessions, not the contracts loop (several items carry UX
judgment).

### S1 — Food/water drop UX (items 7, 8, 6)

The bottom map button is ambiguous: users drop food/water **at their
current location** (no map pinning), and the UI must say so. Rework the
control: label becomes "Bıraktım" phrasing (product text stays Turkish),
make the at-your-location semantics visible, add clear confirmation
feedback.

- Also verify item 6 here: with theme = system, map ground and app surfaces
  must match (likely already fixed by the MapLibre migration — prove it,
  don't assume it).
- **Done when:** simulator screenshots of the reworked control (light,
  dark, and system theme) — the system-theme shot closes item 6.

### S2 — Quick wins (items 1, 10)

- Item 1: when location permission is denied, the app offers "Ayarları aç"
  via `Linking.openSettings()` instead of dead-ending.
- Item 10: soften the "iyileşti" (recovered) action's tone — it currently
  reads as a done deal and is easy to tap by mistake — and add an undo
  (clear `recovered_at`; state is derived so nothing else desyncs).
- **Done when:** screenshots of the denied-permission state and of the
  recovered → undo flow.

### S3 — Drop history + delete (items 9, 11)

- **Decision:** history lives on the **profile** as a list (preview 3 +
  `LoadMoreButton`, the existing pagination pattern).
- **Decision:** a drop can be deleted only within a **15-minute window**
  (mistake correction, not history rewriting).
- Backend: history endpoint (limit/offset) + delete endpoint (ownership +
  window check, rate-limited like other content writes). Map circles must
  reflect a deletion.
- **Done when:** curl end-to-end for both endpoints (backend has no tests),
  screenshots of the profile section and delete flow.

### S4 — Add-animal form colors (item 3)

- Color multi-select stays hidden until a species is chosen.
- **Decision:** per-species top-3 popular colors are **fixed in the
  taxonomy** (research the actual most common street colors per existing
  species in Türkiye first), shown first; plus a free-entry "diğer" option
  like species selection has.
- Taxonomy exists in two copies (backend + mobile) — change both.
- **Done when:** screenshots (no species → no colors; species chosen →
  top-3 + diğer), taxonomy parity check passes.

### S5 — Badge catalog (item 4)

A screen listing every obtainable badge and its tiers, browsable before
earning. No decisions needed.

- **Done when:** screenshot of the catalog.

### S6 — AI check for food/water photos (item 5) — real since September 4

After the photo upload, an interstitial "AI kontrol" screen using the same
deliberate-wait pattern as AddAnimal matching (`MIN_MATCHING_MS`).

- **Decision:** it **always approves** for now; the rejection path arrives
  with the real model.
- **Done when:** screenshot of the interstitial; NOTES entry marking the
  placeholder (like the matching one).
- **Real model (September 4, 2026, ADR-0005):** the photo goes up during
  the interstitial (`POST /care-actions/check`), the vision model says whether
  it shows the claimed food/water, and the confirm redeems a signed
  `photoToken` — the photo travels once, the server is what decided. A
  rejected photo shows the model's Turkish reason with "Yeniden çek"; no
  "add anyway". Without the key the check is off and the flow is the old
  one. Both clients, same screens.

### S7 — Apple + Google sign-in (item 2) — built, waiting on the consoles

The largest item; its own session. Native modules (pod install + native
build), new backend auth paths. App Store rule: offering Google sign-in
makes **Sign in with Apple mandatory** — they ship together. Owner-side
work: Apple Developer / Google Cloud console configuration.

- **Done when:** both logins verified on the simulator end to end; token
  flow checked with curl.
- **Built (September 2, 2026):** server-side identity-token verification
  (JWKS, issuer, audience, expiry — ADR-0003), `user_identities`,
  passwordless accounts, provider re-authentication before account
  deletion, and the button row on both clients, drawn only where
  `GET /api/auth/providers` says the provider is configured.
- **Verified:** `backend/scripts/social-auth-check/run.sh` (41 curl
  assertions against a local issuer: create, link, seven kinds of refusal —
  wrong audience, bad signature, expired, `alg:none`, HS256 key confusion,
  an unverified e-mail on a taken _and_ a free address, an unproven account
  — capitalisation, plus deletion); login and deletion screenshots in light and dark on
  both clients; the iOS Apple sheet reached the system dialog on the
  simulator. Six code-reviewer rounds and an evaluator-qa pass found ten
  real defects: two shapes of account takeover through e-mail linking (both
  now asserted, steps 8 and 10), a case-sensitivity hole that turned the
  second rule into a coin flip (fixed by normalising addresses), a
  release-build crash on the Google deletion route (fixed structurally; the
  surviving half-invariant is asserted by
  `mobile/__tests__/googleClientId.test.ts`, though the ObjC exception
  itself is not something a test here can trigger), and a deploy ordering
  window that would have 500ed every sign-in (removed by moving the schema
  change into `migrations/`). Two further rounds found four more, all of
  them left behind by earlier fixes: the case-insensitive lookup had no index
  and scanned `users` on every login, the tie-break picked the oldest row
  rather than the linkable one, a backfill moved into `migrations/` had
  quietly become a rule re-applied on every deploy, and the login tie-break
  could check a password against the wrong row of a case-variant pair. The
  pattern is worth remembering: fixes written under the pressure of a named
  defect are where the next defect comes from.
- **Linking into an existing password account** (September 4): accounts
  verified by code (ADR-0004) link directly; accounts from before
  verification — usable, never proven — get an "enter your password to
  link" dialog on both clients instead of the earlier dead-end 409 (owner
  decision: confirmation, not automatic linking, because a squatted address
  would otherwise merge its owner into the squatter's account). Verified:
  check-suite step 10 (409 with `code`, 403 on a wrong password, 200 and
  `authProviders` on the right one, a second provider then links without
  asking, a wrong password leaves the row unproven, and a right one links
  without burning a user id — 51 assertions),
  and the owner's own Google account on web: a grandfathered fixture on
  `oguzpancuk@gmail.com` got the dialog, took the password and linked (row
  1858: `email_verified` true, password kept, `google` identity at 07:35Z).
  The **mobile modal has not been exercised with a real token** — the same
  test on the simulator needs a fresh grandfathered fixture and the owner.
- **NOT verified — three gaps, stated plainly.** (1) Apple's servers have
  never been in the loop: no App ID exists yet, and Apple sign-in is
  deliberately deferred (its button stays hidden in production by leaving
  `APPLE_*` unset). Google's have, on web (two real sign-ins on September
  4: a fresh account, then the link dialog) and on iOS as far as Google's
  own sign-in page; the iOS sign-in was not completed. (2) **No Android build at all**: there is no SDK
  on the development machine, so the `applicationId` change and Android
  Google sign-in (which needs its own OAuth client + SHA-1) were never
  exercised. (3) **No iOS release build**: the "fails gracefully" evidence
  is from Debug, where the Google SDK's exception is caught; in Release it
  terminates the app, which is why the compiled-in client id guard and its
  test exist. Remaining owner steps (App ID + Service ID, the Google OAuth
  clients, the reversed-client-id URL scheme in `Info.plist` together with
  `mobile/src/googleClientId.ts`, the Fly secrets) are in
  docs/DEPLOYMENT.md → "Apple / Google sign-in". The schema migration needs
  nothing by hand — the release command applies it.

### S8 — Terms of use (item 12)

Legal research first (researcher agent): Law 5199 on animal protection and
its 2021 amendments, liability around feeding/medicating street animals,
relation to the existing KVKK text. Owner approves the final text; it
extends the `/gizlilik` infrastructure (`web/src/legal.ts`), so it ships
without an app-store release. Can run in parallel with any session.

- **Done when:** owner-approved text is live and linked from the app.

## 🧹 Pre-pilot sprint (planned September 7, 2026)

Three owner requests after the photo AI went live. Serial, one session
each, code-reviewer at the end of each; the first needs a production
approval per step.

### P1 — Production reset: demo data out, real accounts stay

- Demo users are the seed's `@stray.test` accounts and the guide bots'
  `@pati.demo` accounts; everything they own goes. Real users keep their
  accounts (identity, password, provider links, avatar, friendships);
  their animal records go too (owner decision) — and, pending the owner's
  answer, their food/water drops and badge awards.
- A script `backend/scripts/purge-demo.js` with a dry run that prints
  per-table counts and an `--apply` that runs in one transaction; the seed
  scripts stay in the repo. Run on production through `fly ssh console`
  after a database snapshot, dry run first, owner approval on the counts.
- **Done when:** dry-run counts shown and approved, apply reported with the
  same counts, a real account still logs in, the animals list is empty.

### P2 — Animals page: nearest first, no radius, infinite scroll

- `GET /animals` with `lat`/`lng` and no radius orders by distance over the
  whole table (PostGIS `<->` on the GIST index); first page sized to fill a
  phone screen, the rest loads on scroll (mobile `onEndReached`, web an
  intersection sentinel). Without a location the list falls back to
  newest first and says why.
- **Done when:** screenshots of both clients with the first page and the
  loaded second page; curl of the ordering.

### P3 — Profile pictures cut from the real photos

- On every animal photo upload the model returns the animal's face box;
  `sharp` cuts a square thumbnail around it (`animal_photos.thumb_url`,
  `face_score`); the animal's picture is the photo with the best face
  score; the SVG avatars stay as the fallback for animals without a usable
  photo. A backfill script for existing photos.
- **Done when:** screenshots of lists and profile headers on both clients
  with real cut-outs; the backfill run on production reported.

### P4 — First production reports (September 8, 2026)

Three problems the owner found on production after v29:

- **Web: "Yeniden çek" after a refused care photo did nothing.** The file
  input lived in the idle branch of the sheet, so the rejected step
  clicked a ref to an unmounted input. Fixed: one input for every step.
  Mobile's button was the same handler as the first shot and works.
- **Add-animal never asked whether the photo shows a cat or a dog.** Every
  animal photo is now screened for the claimed species (ADR-0005,
  amendment 2026-09-08): the match step screens the whole set and hands
  back one `photoToken` per photo, the create step redeems them, a direct
  upload is screened inline; the refused photo leaves the strip with the
  model's reason on both clients. **Done when:** harness sections 11–13
  pass; the refusal screenshot on both clients.
- **The verification code mail never arrives.** Not code: production has
  `RESEND_API_KEY`, but `resend._domainkey.pati-app.com` and
  `send.pati-app.com` do not exist in DNS, so the domain is unverified in
  Resend and every send is a 403 (`verification mail to user N failed` in
  the Fly log; the client shows "Yeni bir kod iste"). Owner-side: publish
  the records Resend lists for `pati-app.com` (docs/DEPLOYMENT.md, ADR-0004
  section), wait for "Verified", register once more.

### P5 — One map: care markers with a depleting ring (owner idea, 2026-09-08)

Owner decisions (2026-09-08): one map for food AND water, no mama/su
toggle; each record is a screen-constant icon (bowl / drop) inside a green
ring that empties clockwise as the record's window runs out — both types
green, the glyph tells them apart; the window numbers stay (food 4 h,
water 6 h); the heatmap idea is deferred; the notification logic (device
asks the server "is there food/water within 100 m of me") is untouched.

- Marker art: `mobile/src/map/careMarkers.ts` (no imports; web reads it via
  `@mobile`) — the SVG generator, the 10-step ring quantisation of the
  server's `weight`, the image keys. Mobile draws the markers from
  pre-rendered PNGs (`mobile/scripts/generate-care-markers.mjs` →
  `mobile/src/map/markers/`) in one SymbolLayer; web rasterises the same
  SVG into `map.addImage` at runtime. Collision placement (fresher wins)
  replaces the 100 m fill circles; icons shrink toward country zoom.
- Bottom sheet: one status line for both types ("mama var, su yok") and
  three tiles — Mama bırak, Su bırak, Hayvan ekle. The FAB and the top
  segment go away.
- **Done when:** jest covers the ring step; simulator and playwright
  screenshots of the single map (light + dark on mobile) with rings at
  different fill levels; the confirm flow still creates a record of the
  chosen type (curl/log).

### P6 — Owner batch of 2026-09-08 (eight items, three tracks)

Owner request after P5 shipped: (1) the ring turns red in the record's
last hour; (2) a care marker, an animal avatar and the user pin on one
spot look bad — needs a design; (3) the sheet actions back to the old
gradient buttons, bigger icons, no discs; (4) user-to-user messaging as a
fourth tab, with named groups, admins who can remove members and delete
messages; (5) badges for animals — to be discussed first; (6) the animal
screen is titled "kedi profili" / "köpek profili"; (7) bigger animal
photos, a tap-to-open viewer, likes with a count (a badge source);
(8) follow vs. care: "takip et" (no condition; followers only like photos
and get notified on comments, sightings, health and vaccination records)
and "bakım ver" (two fresh photos — one since 2026-09-14 C1 — AI-matched against the animal's photos,
then full carer rights); everyone else can only like photos. Follower and
carer counts become animal badges.

Owner asked for the disjoint parts to run in worktrees (/parallel-tracks).
Proposed partition — files are the claim, migrations are numbered up
front so the tracks never collide:

- **Track A — map (main session):** items 1, 2, 3. Files:
  `mobile/src/map/careMarkers.ts` + generated markers, `MapScreen.tsx`,
  `MapPage.tsx`, `web/src/theme.css` (map section only).
- **Track B — messaging (worktree):** item 4. Migration `006_messaging.sql`
  (conversations, conversation_members with role, messages; soft-deleted
  messages keep the row for reports). New `message.controller.js` /
  `message.routes.js`, `mobile/src/api/messages.ts`, new screens
  (Messages list, Conversation, Group settings), `MessagesPage` +
  `ConversationPage` on web, the fourth tab. Shared-file touches limited to
  one Tab.Screen line in `navigation/index.tsx`, one route block in
  `web/src/App.tsx`, one tab in the web shell — merged by the main session.
  Web API calls live in a new `web/src/api/messages.ts` to keep
  `web/src/api.ts` untouched.
- **Track C — animal profile (worktree):** items 6, 7, 8, then 5 once
  decided. Migration `007_animal_social.sql` (animal_photo_likes,
  animal_followers, notifications, animal_badges). `animal.controller.js`,
  `AnimalProfileScreen.tsx`, `AnimalPage.tsx`, `badges.js` (animal
  section), a notifications inbox (bell on the profile tab; polled like
  the care alert — no APNs/FCM yet).

Decisions still owed by the owner (asked 2026-09-08, see NOTES):
item 2 design, item 3 "Hayvan ekle" also gradient?, item 4 who may DM
whom + polling vs. push, item 5 badge list/tiers, item 8 the tightening of
comment/sighting/health rights to carers only.

- **Done when (per track):** A — screenshots of red rings and the
  stacked-marker design on both clients; B — curl end-to-end of DM, group
  create/rename/admin/remove/delete-message, screenshots of the tab on
  both clients; C — screenshots of the renamed profile, the photo viewer
  with likes, follow/care buttons and the match step, the notification
  inbox; badge thresholds unit-tested. Every track ends with code-reviewer;
  the main session merges, runs the full battery and evaluator-qa.

### P7 — Owner's review of the P6 batch (eleven findings, 2026-09-08)

Same three tracks as P6, same claims; the owner asked to talk first.

- **Track A′ — map (main session):** (8) animal avatars from farther out
  (owner-approved: from zoom 15, fetched within 500 m); (9) the location becomes
  a small dot with a halo (Google-style) drawn under everything, the paw
  pin retired — and whenever records and/or animals overlap on screen
  they fan out around the spot automatically (no tap), recomputed on zoom
  end; (10) the sheet's three buttons become one "Ekle" with the paw mark,
  which opens a chooser (mama / su / hayvan) before the existing flows;
  (11) a locate-me button (crosshair) that flies to the user; (13) the
  "Hayvanları görmek için yakınlaştır" hint moves to the top of the map;
  (14) the zoom +/− buttons go (pinch and double-tap remain).
- **Track B′ — messaging (worktree):** (6) sender avatars beside messages;
  (7) quoting a message (reply-to: `messages.reply_to_id`, the quoted
  excerpt rendered above the bubble, tap scrolls to it).
- **Track C′ — animal profile (worktree):** (1) past notifications arriving
  on follow — reproduce first (server rows are written at event time to
  the followers and carers of that moment, so the suspects are carer rows
  and the local care-alert log); (2) "bakım ver" also follows; (3) the
  two highest badges on the header, tap opens the tier ladder like the
  human catalog modal — the same bronze→diamond ladder and "N to the next
  tier" text (owner, 2026-09-08); (4) the "bakım veriyorsun" state keeps
  its outline; (5) follower/carer counts at the top of the header,
  bolder; (12) a new notification kind when someone starts caring
  ("… bakım vermeye başladı") to followers ∪ carers — carers already
  receive the four event kinds.
- **Done when:** per track as in P6 — screenshots on both clients, curl
  harnesses extended (quote, auto-follow, notification timing), jest for
  the fan layout, code-reviewer per track, main merges with full battery
  and evaluator-qa.

### P8 — Owner's review of the P7 batch (2026-09-09)

- **Track A″ — map + messaging (main session):** (1) the "Ekle" button
  carries the pati logo (brand `Logo` on mobile, `logoSvg` on web), not the
  paw glyph; (2) fans lose their spokes on both clients; (4) the
  conversation header's group button (and the DM avatar button) becomes a
  proper round header control — surface disc, hairline, centred glyph,
  theme-correct in dark mode — on both clients.
- **Track C″ — animal profile (worktree):** (3) the profile is reworked
  after the human profile's discipline (`UserProfileScreen` /
  `ProfilePage`): header = avatar + name row with the follower/carer
  counts right-aligned on the name's line, the descriptive line under the
  name, the two badge chips under it, then the takip et / bakım ver pair;
  sections in one order with `SectionHeader`s (fotoğraflar, en son
  görüldüğü yer, aşı kayıtları, sağlık kayıtları, sohbet); the carers-only
  door becomes an inline card at the top of "sohbet" (no sticky overlap);
  "şikayet et" moves to the very bottom as a subtle footer link; the match
  review bar stays as is. Both clients, screenshots light + dark.
- Owner answer recorded: every change lands on web too (parity rule).
- **Done when:** screenshots of the map button, a spokeless fan, the
  conversation header (light + dark) and the reworked profile on both
  clients; code-reviewer per track; merge with the battery and QA.

### Follow-up from the P8 map reviews (2026-09-09)

- The coordinate READ paths (`GET /care-actions`, `/care-actions/status`,
  `GET /animals`) parse with `finiteNumber` but do not range-check, so
  `lat=999` answers 200 about a point PostGIS coerced into the southern
  ocean instead of 400. `coordinate()` in `backend/src/utils/numbers.js`
  is the natural guard; the write paths already use it.
- An absurd `radiusMeters` (1e300) is still accepted on the public care
  routes; an upper clamp belongs with the same pass.
- Web's initial location catch throws away the reason: on an http origin
  the sheet says "Konumunu açınca…" although no permission can help.
  `describeLocationError` already has the accurate sentence.

### P9 — Showcase (demo) data on production (owner, 2026-09-09)

Owner decisions: every district of İstanbul, İzmir and Ankara gets 50
active demo users, each with 3 animals; the animals carry a generated
species/breed avatar as their single photo; the bots comment, drop food
and water regularly, are friends, chat one-to-one and in groups, and look
like a month of use. Demo rows are marked with a **chip only** (names stay
ordinary). One switch hides every demo row everywhere: map records,
animals, chat, comments and notifications ("mama ve suları da silinsin,
bildirim işleri karışmasın").

Two owner decisions arrived mid-build and supersede the original plan:

1. The switch is **on every user's profile**, not in the admin panel
   ("fikrimi değiştirdim, her kullanıcının profilinde demo verisini
   gösterme butonu olsun"): `users.show_demo`, default true.
2. **Bots are off the leaderboard entirely** ("botlar sıralamada
   gözükmesin. profillerinde sıralamalarında demo hesabı yazsın") —
   replacing "they DO appear in the leaderboard". One board for
   everyone, no bot on it, and a showcase profile reads "demo hesabı"
   where the rank would be. This is also what keeps stored ranks
   honest: `users.last_rank` and the badge award rows can never be
   inflated by the seed.

- **Track A — visibility (main session): DONE** (`bd86e3d`). Migration
  `011_demo_data.sql` (`is_demo` on every table a read path touches +
  partial indexes; `users.show_demo`, mirrored into 001 without the
  indexes), `utils/settings.js` (cached preference, `demoFilter(req,
  alias)`), the filter applied to the care list/status, the animal
  list/near/match, user search and notifications (the leaderboard needs no
  filter — see the next bullet), `PUT /users/me/show-demo`, and the toggle
  on BOTH profiles. The public
  map and drop routes took a new `identifyUser` middleware: without a
  parsed token they could not honour a signed-in visitor's choice. Demo
  rows wear a chip on the animal profile, the public profile and the
  leaderboard.
- **Track S — the data (worktree): DONE** (merged as `e017616`).
  `backend/scripts/seed-showcase.js` writes ~106.000 rows across 44
  districts: the rows land in about 2 s, then the badge sync runs over
  2.200 accounts — 4 s on a warm local database, 56 s in the QA pass on a
  clone, so budget for the slow end on a `fly ssh console` run. 2.200
  bots, 6.600 animals with one generated photo
  each, 42.620 drops (a live slice inside the ring window in all three
  cities), comments, health and vaccination records, friendships, DMs and
  a group per district, badges synced at the end. Proven additive (every
  non-demo count identical before and after), idempotent (a second run
  inserts nothing) and exactly reversible (`--remove` restored the
  baseline per-table three times over). 16 tests. Ankara's nine districts
  and 384 real quarters came from OpenStreetMap through a sibling of the
  existing fetcher; the ten animal photos are generated files served by
  the app image, and the script refuses to seed against an origin that
  does not serve them (the URLs are stored, so a wrong origin would bake
  dead links into production). `npm run seed-showcase`, and
  `npm run seed-showcase:remove` to take it all back out.
- **Where the filter reaches** (settled over six review rounds and a QA
  pass): **discovery only** — the care list and status, the animal
  list/near/match, user search, and notifications (counts, the bell poll
  and mark-read included); bots are off the leaderboard for everyone, so
  it needs no filter. Nothing filters a row someone navigates to, or
  anyone's own record: a profile, an animal opened by id, friends, chats,
  an animal's own carers and comments. Every attempt to filter those
  produced either a number that disagreed with a list or a card that 404s
  when tapped — the chip is what marks a demo row a reader does reach.
  Notifications inherit `is_demo` from the actor or the animal, so the
  filter keeps working for rows created at runtime.
- **Still open, and deliberately:** `npm run seed` writes its local demo
  world WITHOUT `is_demo`, so on a freshly seeded dev database the switch
  appears to do nothing — only `seed-showcase.js` sets the flag. And a
  newcomer can send a friend request to a bot and wait forever: 2.200
  accounts that never answer. Auto-accepting would need a job that runs
  after the seed; the request simply sits in "gönderilen istekler".
- **Done when:** both clients show the demo world (screenshots), the
  profile toggle hides and restores it in one tap (screenshots of both
  states, both clients),
  the script is rerunnable and `--remove` leaves no demo row, code-reviewer
  per track, then the production run through `fly ssh console`.

---

## 🌙 Pre-launch night run (2026-09-10)

Owner handed the session an unattended stretch with one instruction: close
everything that must be done before real users arrive. Authority for this
run, decided up front: **commit + push free, no production deploy** — the
deploy stays a morning decision through `/deploy-checklist`.

Owner decisions taken at the start:

- Photo storage: write the **S3-compatible adapter + upload resizing** now,
  provider **Cloudflare R2**; without the env the current disk behaviour is
  unchanged, so it ships dark and turns on with three secrets.
- White-on-orange contrast: **leave it** for now (stays in NOTES §3.13).
- iOS internal rename: **attempt it on a branch**, never on `main`.

| #   | Item                                                                              | Closes                    |
| --- | --------------------------------------------------------------------------------- | ------------------------- |
| L1  | S3-compatible photo storage adapter + `sharp` resizing, disk fallback              | Launch "object storage", NOTES §3.2 |
| L2  | Backend tests (jest + supertest): auth, care distance, badges, leaderboard         | Launch "Backend tests", NOTES §3.5  |
| L3  | Read-path coordinate range checks + `radiusMeters` clamp                           | P8 follow-ups             |
| L4  | Remove the location override (`mobile/src/location.ts`)                            | Launch item, NOTES §3.11  |
| L5  | Admin: delete a user / free a squatted address                                     | Launch "Admin: free a squatted address" |
| L6  | Rate limit the ad impression endpoint                                              | Ads item                  |
| L7  | iOS/Android internal rename to pati — **branch only**                              | Launch "Rename internals" |

Already verified during planning, so struck from the owner's go/no-go list:
**Fly volume snapshots are on** (`uploads`, scheduled, 14-day retention).

**Done when:** each item lands as its own commit with the verify battery
green on a clean HEAD, a code-reviewer pass over the range, and a screenshot
for anything visual on BOTH clients. **Stop when:** the list is done, or an
item fails its battery twice in a row (park it with a note and move on), or
the owner's morning arrives.

**Left open by the review, deliberately — the multi-machine gap.** The
storage driver makes photos durable and serveable from anywhere, but it does
not yet make the app horizontally scalable, and the deploy notes now say so.
Two paths still assume one shared volume: `redeemPhotoToken` (in both
`care.controller.js` and `animal.controller.js`) hands a file from the check
request to the confirm request by name on disk, and `ai.uploadPathFromUrl`
reads the gallery's files for the photo comparison, failing open when they
are missing. Closing it means publishing pending files at upload time,
sweeping them out of the bucket too, and making both readers async through
`storage.localPath`. Worth doing before a second machine, not before the
pilot.

---

## 📝 Demo notes — 15 UX items (2026-09-11)

The owner walked the app and came back with fifteen notes, then asked for a
plan before any code and for parallel execution after it. Four questions went
back; all four are answered, and item 1 came back refined.

**Owner decisions (2026-09-11):**

1. **Back navigation is a rule, not a screen fix** — "navigasyon harici bir
   yerden sayfa değiştiğinde önceki sayfaya dönülebilmeli". The tab bar
   switches roots; everything else pushes and returns to *where you came
   from*. Written up as docs/DESIGN.md §8; the audit is an integration item,
   not a track, because it touches every page on both clients.
2. **Mama & su geçmişi** — a full-width row-button under the level bar
   ("Mama & su geçmişim · N kayıt ›") opening a sheet. The bell moving to the
   top-right frees exactly that space; a fourth top-right icon would crowd it
   and the stat strip has no room for a fourth cell.
3. **Carers vs comments must not look alike** — "bakım verdiğim hayvanlar"
   becomes a horizontal gallery of avatar cards; "son yorumlarım" becomes
   speech-bubble rows with a small animal avatar. Different shape, not just a
   different heading.
4. **Group add is a system message**, not a new notification kind — it lands
   in the group itself, so the unread count, the new tab badge and the inbox
   ordering all follow for free instead of needing three separate paths.
5. **OSM attribution leaves the map entirely** (option b) and moves into the
   settings sheet. ODbL attribution is still discharged, one level deeper.

### Items → tracks

| #   | Item                                                        | Track |
| --- | ----------------------------------------------------------- | ----- |
| 2   | Bildirimler + arkadaşlar as top-right buttons → sheets       | P     |
| 3   | Mama & su geçmişi behind a row-button → sheet                | P     |
| 4   | Settings sheet: görünüm, demo, kvkk, çıkış, hesabı sil       | P     |
| 5   | Carers gallery vs comment bubbles                            | P     |
| 6   | Public profile = own profile's layout; friend button top-right| P    |
| 11  | Friend-request count on the friends button                   | P     |
| 7   | Comments/records/carers link to the person's profile         | H     |
| 8   | Last-seen map opens a responsive sheet with the update date  | H     |
| 9   | "Save to gallery" for photos taken in the app (mobile only)  | H     |
| 10  | Unread message count on the messages tab icon                | M     |
| 12  | Group add shows up like a message                            | M     |
| 13  | Ring sentence out; care markers explain themselves on tap    | M     |
| 14  | Şifremi unuttum + şifremi değiştir                           | Ş     |
| 1   | Back-navigation audit (both clients, every page)             | main  |
| 15  | OSM attribution off the map, into the settings sheet         | main  |

### File claims

Everything outside a track's claims is read-only for that track. `docs/`,
`mobile/src/theme/**`, `web/src/theme.css`, `backend/migrations/001_init.sql`
and `.claude/hooks/verify.sh` belong to the main session alone.

- **P — profil.** `mobile/src/screens/{UserProfile,PublicProfile}Screen.tsx`,
  `mobile/src/components/RecentComments.tsx`,
  `mobile/src/components/profile/**` (new),
  `web/src/pages/{ProfilePage,UserProfilePage}.tsx`,
  `web/src/components/RecentComments.tsx`,
  `web/src/components/profile/**` (new), `web/src/styles/profile.css` (new).
- **H — hayvan profili + kamera.** `mobile/src/screens/{AnimalProfile,AddAnimal,CarePhoto}Screen.tsx`,
  `mobile/src/photoCapture.ts` (new), `mobile/src/components/AnimalLocationSheet.tsx` (new),
  `mobile/ios/PatiMobile/Info.plist`, `mobile/android/app/src/main/AndroidManifest.xml`,
  `web/src/pages/AnimalPage.tsx`, `web/src/components/MiniMap.tsx`,
  `web/src/components/AnimalLocationDialog.tsx` (new), `web/src/styles/animal.css` (new).
- **M — harita + mesajlar.** `mobile/src/screens/{Map,Messages,Conversation}Screen.tsx`,
  `mobile/src/navigation/index.tsx`, `mobile/src/api/{care,messages}.ts`,
  `web/src/App.tsx`, `web/src/pages/{MapPage,MessagesPage,ConversationPage}.tsx`,
  `web/src/api/messages.ts`, `web/src/styles/map.css` (new),
  `backend/src/controllers/{care,message}.controller.js`,
  `backend/migrations/014_message_kind.sql` (new), `backend/test/messageKind.test.js` (new).
- **Ş — şifre.** `backend/src/controllers/auth.controller.js`,
  `backend/src/routes/auth.routes.js`, `backend/src/utils/passwordReset.js` (new),
  `backend/src/middleware/rateLimit.middleware.js`,
  `backend/migrations/013_password_reset.sql` (new),
  `backend/test/passwordReset.test.js` (new),
  `mobile/src/screens/LoginScreen.tsx`, `mobile/src/api/auth.ts`,
  `mobile/src/components/password/**` (new), `web/src/pages/LoginPage.tsx`,
  `web/src/api/password.ts` (new), `web/src/components/password/**` (new),
  `web/src/styles/password.css` (new).

### Contracts between tracks

Set now so no track has to guess, and so no two tracks touch one file:

- **Migration numbers are pre-assigned**: 013 belongs to Ş, 014 to M. Tracks
  write ONLY their own numbered file; **mirroring the new columns into
  `001_init.sql` is the main session's job** at integration, together with the
  double-migrate check against a database built from production's own files.
- **Forgot-password is a sheet on the login screen, not a route.** The code is
  six digits typed in the app (the e-mail verification pattern), so no client
  needs a new route — which is what keeps `navigation/index.tsx` and
  `web/src/App.tsx` in track M's hands alone.
- **Ş exports its change-password UI as a self-contained component**;
  the main session mounts it in P's settings sheet.
- **H owns the capture helper** (`photoCapture.ts`) and wires add-animal and
  care-photo; the main session wires the map's food/water drop after the merge.
- **Each track gets its own stylesheet** under `web/src/styles/`. `theme.css`
  is hand-merged and has swallowed a track before (see verify.sh's "web css"
  comment) — nobody touches it in parallel. The main session extends the
  battery to parse the new files.

### Verification

Tracks run their own typecheck (`npx tsc --noEmit` in mobile/ and web/,
symlinking `node_modules` from the main checkout) and add backend tests where
the change is server-side. **Screenshots, the full battery and the merges stay
in the main session** — one simulator, one dev server, one shared database.

**Done when:** every item lands on BOTH clients (item 9 is mobile-only by
nature — a browser cannot write to the camera roll — and item 14's mail path
degrades exactly like e-mail verification does), each track merged `--no-ff`,
`bash .claude/hooks/verify.sh` green on a clean committed HEAD, screenshots for
every visual change on both clients, code-reviewer over the merged range and
evaluator-qa before any deploy.

**Stop when:** the fifteen items are done and reported, or a track's battery
fails twice in a row (park it with a note, merge the rest), or a merge conflict
appears — a conflict means the partition was wrong and the owner arbitrates.

---

## 🐞 Owner batch of 2026-09-14 — two bugs, two changes — ✅ done; the backend and web halves live in v40, the mobile halves with the next app build

| #   | Item                                                                                          | Kind   |
| --- | --------------------------------------------------------------------------------------------- | ------ |
| B1  | "Bu o — eşleştir" and "bakım ver" on an existing animal do not add the new photos             | bug    |
| B2  | Mobile web chat: opening the keyboard makes the messages jump up                               | bug    |
| C1  | Add-animal and "bakım ver" accept a single photo, and only a photo taken now (no gallery)      | change |
| C2  | Without location permission, every location action asks again before showing the warning     | change |

Plan: a read-only investigation of all four (root cause for the bugs, every
call site for the changes, each verified by an independent skeptic), then
the items land serially on `main`, each on BOTH clients.

**Done when:** B1 has a backend/end-to-end check that fails before and passes
after; B2 has a web measurement of the message list around a keyboard-sized
viewport shrink plus a screenshot (and the stated limit of emulation); C1 and
C2 have screenshots on both clients; `bash .claude/hooks/verify.sh` is green on
a clean committed HEAD; code-reviewer covers the range. No push or deploy
without the owner's per-instance yes.

**Stop when:** the four items are done and reported, or an item fails its
battery twice in a row (park it with a note), or B1 does not reproduce locally
and needs production evidence (report and ask).

**Status (2026-09-14):** all four landed on `main` on both clients, battery
green on a clean HEAD, code-reviewer over the whole range. Evidence, the
platform limits and what stays unverified (Android, real devices) are in
NOTES "2026-09-14 · owner batch". The device behind C2's report turned out to
be Mobile Safari, whose own refusal memory is the cause (see L, 2026-09-16).

---

## 🐞 Owner follow-ups of 2026-09-15 — ✅ done; S's and C3's web halves live in v40, K and the mobile halves with the next app build

| #   | Item                                                                                   | Clients        |
| --- | -------------------------------------------------------------------------------------- | -------------- |
| K   | Native iOS: the keyboard covered part of "Mesaj yaz…" (and "Yorum yaz…")                | mobile         |
| S   | A carer's "fotoğraf ekle" moves from a button into the photo grid's empty slot          | mobile + web   |
| C3  | The animal profile's "Yorum yaz…" scrolls with the page instead of staying pinned       | mobile + web   |

**Done when:** K — composer fully above the soft keyboard on the iPhone 17 Pro
simulator; S — the add tile on both clients (iOS screenshot, web screenshots for
0/3/5/6+ photos and a non-carer), slot helper under jest; C3 — composer out of
view at the top of the page and fully above the keyboard when focused (iOS),
web geometry check before/after; battery green on a clean HEAD; code-reviewer
over the range. All met — details in NOTES "2026-09-15".

---

## 🧰 Owner fixes of 2026-09-15 (evening) — six items — ✅ done; the web halves and the cared-animal ordering fix live in v41, the mobile halves with the next app build

| #   | Item                                                                                   | Clients      |
| --- | -------------------------------------------------------------------------------------- | ------------ |
| M1  | The send button's "›" is not centred in its circle                                      | mobile + web |
| M2  | No "⋯" on messages: tapping a message opens its options                                  | mobile + web |
| G   | Profile "bakım verdiği hayvanlar": all of them by horizontal scroll, no "show more"      | mobile + web |
| L   | Web: without location permission, "mama ekle" shows the warning but no browser prompt    | web (+ check mobile) |
| R   | Animal profile: the comment composer is the last thing; "şikayet et" moves elsewhere     | mobile + web |
| T   | Tab bar items look off-centre with too much space below                                   | mobile + web |

Defaults taken without blocking (owner may redirect): "şikayet et" becomes a
header action on the animal profile; a tap anywhere on a bubble opens the same
options the "⋯" had, while a tap on a quote inside it still jumps to the quoted
message; the tab bar keeps clear of the iPhone home indicator but loses the
extra space. L is reproduced in real Safari (iOS simulator) before any code.

**Done when:** each item has a screenshot on both clients (iOS simulator by the
main session, web by playwright) and, where logic changes, a jest test; battery
green on a clean committed HEAD; code-reviewer over the range. **Stop when:**
done, or an item fails its battery twice (park with a note), or L turns out to
be a browser limit that code cannot change (report the evidence and ask).

**Status (2026-09-16):** all six landed on both clients where they apply
(L is web-only by nature). M, G, R and T were checked in the app on the iOS
simulator, L in Mobile Safari on that same simulator (the real browser, not a
stub — no real device); web by playwright. Deployed as v41 together with the
cared-animal paging tiebreaker. Evidence, the Safari two-refusals-a-day limit
and what stays unverified are in NOTES "2026-09-16".

---

## 🧵 Open follow-up: the user comments list pages without a tiebreaker

`USER_COMMENTS_SQL` (backend/src/controllers/user.controller.js, "ORDER BY
c.created_at DESC") is paged by offset from both clients
(web/src/pages/UserCommentsPage.tsx, mobile/src/screens/UserCommentsScreen.tsx,
30 at a time). Rows that share a timestamp — the seeded worlds are full of
them — have no fixed order between two queries, so the next page (web's
"Daha fazla göster", mobile's scroll to the end) can miss a comment: mobile
appends without a dedupe and repeats one with a duplicate list key, while web
merges by id and instead drifts its offset, re-requesting a row already shown.
The animal-profile chat is NOT affected; its query already sorts by id too. The cared-animal query had the same flaw
and was fixed in 2620392 by adding the id to the sort; this one wants
`, c.id DESC` and the same curl check. Found by the pre-deploy review of that
fix, 2026-09-16; not part of it because it is a separate query with its own
clients to re-check.

The same bare-timestamp ordering is in more queries, and the admin panel is
the worse case: every admin list pages 25 at a time (admin/src/useList.ts)
over `admin.controller.js` queries ordered by a timestamp alone — users,
animals, care actions, vaccinations, the comment-moderation lists, reports and
the audit log (all seven `useList` screens). On the local
database 142 of the moderation list's page boundaries fall inside a tie group,
so a reported comment can sit on no page at all. `/care-actions/mine`
(care.controller.js) has the same ordering but both clients fetch it as a
single page of 100, so it is latent. Fix them with the same one-line
tiebreaker when one of them is next touched.


---

## 🧰 Owner fixes of 2026-09-16 (evening) — six items

| #   | Item                                                                                           | Clients               |
| --- | ---------------------------------------------------------------------------------------------- | --------------------- |
| N   | Tab bar: the items now sit too low (the 2026-09-15 centring overshot)                            | mobile + web          |
| P   | Add-animal form: no example ("Örn. …") placeholders in the text fields                           | mobile + web          |
| F   | "işaretler / notlar" becomes "belirgin fiziksel özellikler (varsa)"                              | mobile + web          |
| B   | Two badges at once show 0 → 20 on both popups; they must read 0 → 10 then 10 → 20                | backend (both clients) |
| E   | Empty "aşı kayıtları" / "sağlık kayıtları" must not look like a text box                          | mobile + web          |
| C   | "bakım veriyorsun" pressed again leaves the animal and drops the carer rights                    | backend + mobile + web |

Defaults taken without blocking (owner may redirect): P removes the example
placeholders from the add-animal form's own text fields (name, the physical
features, the "Diğer" free-text of the pattern and colour pickers) and leaves
the placeholders that are format hints elsewhere (`ornek@eposta.com`, the
`••••••••` password dots, the 6-digit code, "Mesaj yaz…"). N lifts the group by
reserving more of the bottom inset rather than by shrinking the bar. C asks for
a confirmation first, keeps everything the leaver already wrote (records,
comments, photos) and also drops the follow, since "bakım ver" granted it.
B stages the points, the level and the rank per badge inside one batch.

**Done when:** each item has a screenshot on both clients (iOS simulator by the
main session, web by playwright), B has a node:test for its chain and C a
re-runnable curl check (the backend has no HTTP test harness; section 16 of
`backend/scripts/ai-check/checks.sh` is where a check like this belongs),
battery green on a clean committed HEAD, and code-reviewer has covered the
range. **Stop when:** done, or an item fails its battery twice (park it with a
note).

**Status (2026-09-16 evening):** all six landed on both clients, then one
code-reviewer round whose three important findings were fixed (the carer
announcement, the follow a non-carer never granted, and C's missing
re-runnable check — now `checks.sh` section 16, 187/187). Web was driven in
the in-app browser rather than playwright (its chromium is not installed
here). Evidence, the measured tab-bar numbers and what stays unverified are in
NOTES "2026-09-16 (evening)". Not deployed.

Then the owner drove the app on the simulator and sent two more: N was still
not right (third round — settled by rendering three candidates and letting
them pick, rather than guessing a fourth time), and the × in the modal
header's close button was 7 pt off centre. Both fixed and measured; see NOTES
"the tab bar, third try, and the modal ×".

---

## 🧵 Open follow-up: small things the 2026-09-16 review rounds parked

Found by the second code-reviewer pass over `7b50cc5` (which returned
APPROVE, with "I would not spend a third round on any of this"). None can
produce a wrong result for a user today; each belongs to the next touch of
its file.

1. **The sighting door's `care` marker is untested.** `markCareDoor` in
   `reportSighting` (animal.controller.js) is what stops a second
   announcement for someone who joined through "o hayvan bu" and later
   leaves. `ai-check/checks.sh` section 16 drives only the care-photo door,
   and `animal-social/checks.sh` predates the marker. Drop the insert and
   every test in the repo still passes. Cheapest fix: in section 16, let one
   account rejoin through `POST /animals/:id/sightings` instead — which needs
   an unspent `register` hit, so it has to go through the match step first.
2. **The registrant is never marked.** `createAnimal` makes its author the
   first carer without writing a `care` row, so a registrant who leaves and
   comes back is announced once. Bounded (the rejoin writes the marker) and
   arguably right, but `caredBefore`'s docblock says "both doors write one",
   which is not the whole story. Decide which it is and make the code and the
   comment agree.
3. **`care_told()` reads one page.** Section 16 counts `care` notifications
   from `GET /notifications` with no `limit`, i.e. the newest 30. It passes
   today and starts failing spuriously the moment a future section pushes
   that inbox over 30. Wants `notifications?limit=100`, and a status check
   before the JSON parse.
4. **Section 16 reuses `MAIL2`/`JWT2`/`CODE2`**, which sections 3–11 already
   bound to a different account. Safe only because it is the last section.
5. **One tautological assertion** in section 16: `carer: false` is a literal
   in the response, so checking it can never fail. The two 403s after it are
   the real proof; the label promises a database fact it does not read.
6. **`Number.isInteger` is not "a valid animal id".**
   `DELETE /animals/99999999999/care` overflows Postgres' int and 500s
   instead of answering 400 or 404, and `/animals/0x10/care` leaves care of
   animal 16. The sibling endpoints never got the treatment at all:
   `DELETE /animals/abc/follow` still 500s. This belongs in one shared
   `animalIdParam` guard (or `:id(\d+)` on the routes), not in a third copy.
   While there, reconsider `leaveCare`'s 404 pre-read: it is a round trip and
   a TOCTOU window for a case no client can produce, and "takip etme" answers
   200 for an animal that is not there.

Three more from the round over the tab-bar band (`e0c108b`), which returned
APPROVE and recommended against opening a fix round for them — they are a test
assertion and two API/prose details, none of which can produce a wrong result.
Carry them into the next commit that touches these files.

7. **The 19-28 pt insets were changed but never rendered.** `indicatorBand`
   moves the bar 1-3 pt there (iPad, Android gesture nav) and nothing at all
   at 17-18, where the proportional band still leaves the 8 pt floor; the
   evidence in
   NOTES is a re-measurement of inset 34, which the commit did not change.
   An iPad simulator can produce the shot — and can also settle whether its
   inset really is ~20, which the justification assumes.
8. **`tabBarGeometry.test.ts`'s `above < gaps(29).above` assertion passes
   against the flat-band code it is named for** (8 < 13 either way). The real
   guards are the `indicatorBand` equality beside it and the parametric rows
   at insets 20/21/24. Replace it or drop it; a test that passes against the
   bug it was written to catch is worse than no test.
9. **`indicatorBand` is exported without the clamp its doc implies**:
   `indicatorBand(34)` returns 19, past the 16 that `TAB_INDICATOR_BAND`
   defines as a full band. Harmless today (its only caller passes an
   already-clamped value) but it is public API with no test above 29.
10. **`caredBefore`'s comment says "both doors write one"; there are three.**
    `createAnimal` makes its author the first carer and writes no marker, so a
    registrant who leaves and rejoins is announced once. Bounded and arguably
    correct behaviour — the comment is the wrong part. Found by QA before the
    v42 deploy.

## 🍎 App Store readiness (2026-09-16, night) — iOS first, Android parked

Owner: "v42 çıktı. Android'i şimdilik geçelim, iOS'a çıkaralım. Sen eksikleri
tamamla, ben o sırada key'leri alayım; key'leri girince her şey hazır olsun."
So: everything on the code side that an App Store submission needs lands now,
and the owner-side steps (Apple Developer enrollment, App ID + Service ID,
the Fly secrets) are the only thing left when they return. Android's own
items (release keystore, the unused background-location permission, the
first build ever) are parked, not forgotten — see the end of this section.

| #   | Item                                                                                          | Why                                                                 |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| R1 ✅| Info.plist: `ITSAppUsesNonExemptEncryption` false; drop the unimplemented `fetch` background mode; portrait only | Export-compliance prompt on every upload; guideline 2.5.4 (declared background mode with no handler); landscape was never verified |
| R2 ✅| `PrivacyInfo.xcprivacy` declares what the app collects                                        | Today it says "nothing", which contradicts the App Privacy answers   |
| R3 ✅| Block a user (both clients + backend), and report a user from their profile                   | Guideline 1.2: UGC apps must let people block abusive users — there was no way to |
| R4 ✅| Release-configuration build on the simulator + smoke                                          | Every screenshot so far is Debug; Release is what ships              |
| R5 ✅| App Store screenshots (6.9", 1320×2868) from the simulator                                    | Required for the listing                                             |
| R6 ✅| `docs/store/APP-STORE.md`: listing text, App Privacy answers, review notes, the reviewer account recipe, and the exact "keys are in" sequence | So the owner's last step is paste + click |

**Rule for R3, in one sentence:** blocking removes the friendship and closes
every door that friendship opens (DMs, groups through me), refuses new
requests in both directions, hides the two of us from each other's search,
and hides their comments from me; their profile still opens so the block can
be undone. Not covered, deliberately: messages they write in a group a mutual
friend put us both in, and notifications about their actions.

- **Done when:** R1/R2 by diff and a Release build that installs and runs;
  R3 by `backend/scripts/ai-check/checks.sh` section 17 and screenshots of
  the block/unblock flow on both clients; R4 by the Release build's smoke
  screenshots; R5 by the files in `docs/store/screenshots/`; R6 by the file.
  Then code-reviewer over the range.
- **Done 2026-09-16 night** — R1, R2, R3, R5 and R6 are in
  (`f87f702`, `f0b029f`, `cc7ce86`); details and evidence in NOTES.
  R3's evidence: checks.sh section 17, 226/226 ALL PASS, plus the
  block/unblock round trip driven on the simulator and in the browser.
  R4 closed the same night: Release BUILD SUCCEEDED, installed and
  launched on the Pro Max, the built plist carries all three changes, and
  the Google button — drawn because production reports the matching client
  id — reached the system consent sheet **without terminating the app**,
  which is the Release-only failure the S7 notes could never test. No
  sign-in was completed; nothing was written to production.
- **Parked (Android wave):** release signing (`debug.keystore` signs release
  today), `ACCESS_BACKGROUND_LOCATION` (the care-alert timer never runs in
  the background, so the permission buys nothing and Play asks for a
  declaration), the Google Android OAuth client + SHA-1, the first build.
- **Not done, owner's call:** crash reporting (no Sentry or equivalent; the
  first crash on a real device is invisible today).

## 🧵 Open follow-up: what the third review round parked (2026-09-16)

Four small things, read and deliberately left. None blocks the deploy or the
submission; all are written down so the next reader is not rediscovering them.

1. **A simultaneous mutual unblock still leaves the raced request standing.**
   `unblockUser` now sweeps only when it actually lifted a block, which
   closes the destructive case. If A and B unblock each other in the same
   instant, each transaction still sees the other's uncommitted block row and
   skips the sweep, so the pending row survives. Reaching it needs a request
   that landed inside a block's own transaction AND a simultaneous mutual
   unblock — rare squared, and the outcome is a stale friend request, not
   lost data. Closing it properly means `SELECT … FOR UPDATE` on the block
   rows.
2. **A blocked person deleting their account unhides their old
   notifications — and now does it loudly.** The mechanism is not a cascade:
   a *member's* account is never deleted (the hard `DELETE FROM users` paths
   are the demo purge and an abandoned pending registration, neither of which
   can be a notification actor a member blocked — except a showcase bot,
   whose rows the demo filter hides anyway). `anonymizeAccount` keeps the `users` row and
   explicitly runs `DELETE FROM user_blocks WHERE blocker_id = $1 OR
   blocked_id = $1` (`utils/accountDeletion.js`). That delete is what lifts
   the block, while the notification payload keeps the actor's frozen name
   and the first 140 characters of their text.
   The part this batch changed: with `markRead` filtered, those rows stay
   **unread** behind the block instead of being silently consumed. So where
   the rows used to reappear quietly, the blocker's bell now jumps — showing
   the name and words of somebody they blocked, as fresh news. Strictly
   louder than before, which is the price of `markRead` being correct.
   Fixing it means deciding what a block should mean once the other account
   is gone; the cheap half is stamping those rows read at anonymisation —
   **before** the `user_blocks` delete on the line above it, and scoped to
   recipients who had blocked them, or the UPDATE either matches nothing or
   silences that person's notifications for everybody.
3. **The Podfile's signature hook is scoped wider than its comment says.** It
   walks every native target of the user project, so the build phase landed
   on `PatiMobileTests` as well as the app. Harmless — both share
   `$CONFIGURATION_BUILD_DIR` and `rm -rf` on a missing path is a no-op — and
   deliberately not changed now, because the verified archive and the
   exported `.ipa` were built from exactly this project file. Scope it the
   next time the iOS project is touched anyway. Related: the test target has
   no `DEVELOPMENT_TEAM`, so an on-device test run will ask for one.
4. **`PrivacyInfo.xcprivacy` lost its explanatory comment** when a tool
   rewrote the plist during `pod install`. The rationale (the list mirrors
   the App Store Connect answers; nothing serves tracking) now lives only in
   `docs/store/APP-STORE.md`. Restore it the next time that file is edited —
   not now, because the `.ipa` waiting to be uploaded was built from the
   current bytes.
