# ADR-0005: Photo checks and animal matching go through a hosted vision model, and fail open

Status: accepted · Date: 2026-09-04 · Amended 2026-09-07 (provider: Gemini) and 2026-09-08 (animal photos are screened too), see the end

## Context

Two product moments were built as deliberate placeholders waiting for "the
real model": the "AI is checking the photo" interstitial after a food/water
photo (S6, always approved after a two-second wait) and the "is this animal
already registered?" step of the add-animal flow (ROADMAP §1, a rule over
pattern, colour and distance behind a two-second wait). The ROADMAP's plan
for the second was an image-embedding microservice (DINOv2/CLIP in Python)
with `pgvector`; its spike measured the cost and speed but stalled on
accuracy, because trained weights could not be downloaded where the spike
ran and nobody had labelled street-animal pairs to score against.

The owner asked for both to become real now.

## Decision

- **A hosted multimodal model, not an embedding service.** Both moments are
  one request each to a hosted vision API from the existing backend
  (originally the Anthropic Messages API through its Node SDK; since the
  2026-09-07 amendment below, Gemini's `generateContent` over `fetch`). The care photo goes up with the claim
  ("the user says this shows the food they left out") and comes back as a
  verdict; the new animal's first photo goes up together with the cover
  photos of the best field-ranked nearby candidates and comes back as one
  verdict per candidate. No Python service, no vector column, no batch
  vectorisation of existing photos, nothing to train, and the accuracy
  question becomes something the owner can check in an afternoon with the
  live-sample script rather than a research task. The embedding plan is
  retired, not deferred: if a same-individual verdict from a general model
  ever proves too weak, that is the moment to revisit it, with the
  feedback this decision starts collecting.
- **Verdicts, not scores; the user still decides.** The model answers a
  JSON schema (`output_config.format` then, `generationConfig.responseSchema`
  now), so the backend branches on an enum
  and never parses prose. For matching, "same" lifts a candidate to high
  whatever the fields said, "similar" adds a point, "different" sinks it
  to low; the tiers and the "it's this one / new record" choice stay
  exactly as they were — except that, since 2026-09-07 (owner decision),
  only high and medium reach the list, on one page with no cap, and the
  photo is compared with every animal in the 1 km circle that has a cover
  photo (up to 40 per request), not a short field-ranked list. The filter
  applies only when the model answered: without a verdict "low" means
  nothing about the photo, so the fallback keeps the old field-ranked list
  (capped at 20) rather than sending the user straight to "create". Nothing is merged automatically and no percentage
  reaches a screen (the ROADMAP's probability trap).
- **The check is enforced by the server and the photo travels once.**
  `POST /care-actions/check` uploads the photo, runs the check and answers
  with a short-lived signed `photoToken` over the stored file (user, type,
  verdict); the explicit confirm sends the token instead of the photo.
  `POST /care-actions` with a file still works and is checked inline, so a
  client that skips the check step gains nothing. A token is bound to its
  user and action type, expires in fifteen minutes and is redeemable once
  (its id is stored in a unique column, so a replay fails on the index,
  not on a read). A `kind` claim marks it, and `requireAuth` refuses any
  token carrying one: a purpose token is never a session. A rejected photo is
  deleted at once and answered 422 with the model's one-line Turkish reason;
  there is no "add anyway" — the check would be decoration otherwise.
- **Lenient by prompt.** The care check approves anything that plausibly
  shows food or water — a bowl, kibble, a bottle, an animal eating, blur,
  darkness, the bowl out of frame — and rejects only clearly unrelated
  content or a claim that contradicts the picture (food claimed, only water
  shown). Matching judges the individual's markings, not the breed. Both
  prompts are English; the one sentence the user sees is produced in
  Turkish.
- **Everything fails open.** Without the provider key (`ANTHROPIC_API_KEY`
  then, `GEMINI_API_KEY` now), or on a network error, a refusal, a
  malformed answer or an unreadable image, the check
  answers `unavailable` (the photo is accepted, the confirm screen says
  "Fotoğraf hazır" rather than "Uygun görünüyor", nothing is stored in
  `ai_check`) and matching returns the field-only ranking with
  `photoChecked: false`. The product never blocks on the vendor, and a
  production deploy without the key behaves exactly as before this ADR —
  the boot log says which.
- **What the model said is kept.** `care_actions.ai_check` (JSONB: verdict,
  subject, reason, model, milliseconds) records every checked photo. It is
  the raw material for calibrating the prompt against real photos and for
  the moderation queue; it is not shown to users.
- **Images are downscaled before they leave the server.** `sharp` rotates
  by EXIF and fits every photo into 1024 px JPEG: a phone photo is 3–8 MB,
  the providers cap what a request may carry (5 MB per image then, 20 MB
  per request now), and the model reads nothing extra from
  4000 px that it cannot read from 1024. HEIC cannot be decoded by the
  prebuilt binaries, and is treated as unavailable (fail open) — the mobile
  camera produces JPEG, so this only affects gallery picks.
- **Model and candidate count are configuration.** `AI_MODEL` defaulted
  to `claude-opus-5` (the SDK guidance's default; matching is a fine
  visual discrimination task where the strongest model is the cheap choice
  next to a duplicate record) and now to `gemini-3.5-flash` (amendment);
  `AI_MATCH_CANDIDATES` to 8 then and 40 now (every animal in the circle;
  the 1–48 range is what the 20 MB inline limit allows). The care check
  ran at low effort and now
  with thinking off; matching keeps the model's default. Photo matching has its own per-user
  limiter (30/h): one request carries up to 41 images and is the most
  expensive thing a user can trigger; the care photo check has its own too
  (80/h), so the drop budget the route limiter was sized for stays whole.
  The match answer's candidate indexes must cover every candidate sent
  exactly once — checked at runtime rather than by schema range keywords
  (the first provider's format did not document them; the current one
  does, and the runtime check stays so the rule depends on no provider);
  anything else is dropped (fail open) rather than attributed to the wrong
  animal.

## Consequences

- The backend gains `sharp` (Node has no image decoding of its own). The
  first version also added `@anthropic-ai/sdk`; the amendment removed it —
  the Gemini call is plain `fetch`.
- A checked-but-unconfirmed photo stays in the uploads volume (rejected
  ones are deleted). Accepted for now: it is bytes on a volume, not a
  record on the map, and object storage with lifecycle rules is already on
  the roadmap.
- The two-second waits are gone in spirit: the interstitials now show for
  as long as the real request takes. An 800 ms floor remains on the
  matching screen so the field-only answer (instant when the model is off)
  does not flash past as a glitch.
- Verification: `backend/scripts/ai-check/run.sh` drives every branch
  against a fake provider endpoint whose verdict the harness chooses and which
  refuses any request the real API would refuse (92 assertions);
  `backend/scripts/ai-check/live-sample.js` sends real photos to the real
  model, which is how accuracy gets judged, by a person, with the key.

## Amendment (2026-09-07): the provider is Gemini, not Claude

The owner's constraint arrived after the first version shipped locally:
**no separate bill** — the app must not create API charges on top of the
owner's existing subscriptions. A consumer Claude subscription cannot be
used by a server that serves other people, and Anthropic's API has no free
tier, so the calls moved to **Gemini's free tier** (`gemini-3.5-flash` by
default — the newer 3.8 answered 503 to half the calls and timed out on
every comparison on the first live day — `AI_MODEL` to change it; key from Google AI Studio as
`GEMINI_API_KEY`).

What changed and what did not:

- Only `backend/src/utils/ai.js`'s transport changed: a `generateContent`
  request over Node's own `fetch` (no SDK — the same reasoning as the mail
  transport in ADR-0004: thirty lines, and swapping providers means
  changing them, which is exactly what just happened). The prompts, the
  schemas, the verdict handling, the token scheme, the fail-open contract,
  the clients and the harness's assertions are unchanged; the fake in the
  harness now speaks Gemini's shape (`fake-gemini.js`).
- The runtime guard on candidate indexes stays the only enforcement of
  "every candidate exactly once"; Gemini documents `minimum`/`maximum`
  as supported, but the guard no longer depends on any provider.
- `AI_BASE_URL` (honoured outside production only) is how the harness
  points the backend at its fake, the same pattern as the JWKS overrides
  in ADR-0003.
- **The trade-off is data use.** Google's free tier states that content
  sent to it may be used to improve their products; the paid tier does
  not. Users' care photos and animal photos therefore leave the service
  under those terms, and the privacy text must say so before the feature
  is turned on in production. Rate limits on the free tier are per
  project and per model (one key was observed; a second key in the same
  project shares the quota) —
  observed on the first live day (2026-09-07): after about 25 calls the
  API answered every request with 429 `generate_content_free_tier_requests,
  limit: 20` for the rest of the afternoon, on `gemini-3.5-flash`, so the
  free tier is **roughly 20 requests per project per day**, shared by every
  user of the app — enough to test, not to run. When exhausted the checks
  fail open (429 → `unavailable`, not retried), so the product degrades to
  the old behaviour rather than blocking anyone. A 503 "high demand"
  answer is retried once under the same 45 s deadline. Running it for real
  therefore means either Google's paid tier (a billing account on the same
  key; flash pricing is a fraction of a cent per photo, and paid traffic is
  not used to improve their products) or leaving the checks off — an owner
  decision recorded in NOTES when made.
- Cost lever kept: a paid Gemini key or a different model is a secret
  change; moving back to Claude is the thirty lines again.

**Decided the same day (2026-09-07): Google's paid tier.** Once the daily
cap was measured the owner withdrew the no-bill constraint: billing goes
on the same AI Studio project and key, the code and the default model stay
as they are, the cap goes away, and paid traffic is outside the free
tier's data-use clause. What remains of the constraint is the shape of the
bill — fractions of a cent per photo on a flash model, capped by the
per-user limiters. The runbook (docs/DEPLOYMENT.md) makes enabling billing
the first step. The privacy text naming Google as a processor went live in
the same deploy that first ran the checks (v27); the key itself had been
set one release earlier (v26), on an image without the AI code, so no
user photo reached Google from production before the text was published
(the same day's accuracy runs used the owner's own photos, from the dev
machine).

## Amendment (2026-09-08): every animal photo is screened for the species

The first real registrations on production showed the gap: the add-animal
flow compared the new photo with the neighbours' cover photos, but nothing
ever asked whether it showed a cat or a dog at all — and with an empty
circle (production after the demo purge) no model call looked at it. A
photo of a person, a bowl, or a dog on a "cat" record went straight into
the gallery.

- **A third check, same contract.** `checkAnimalPhoto(file, species)` in
  `ai.js`: lenient prompt (small, blurred, asleep, from behind, several
  animals, kittens — all fine; a cat-or-dog that is hard to tell apart is
  accepted), verdict + one Turkish sentence, and it fails open exactly like
  the care check. Rejected only when the model is sure the photo shows no
  live animal of the claimed species: nothing, another animal, the other
  species than the user picked, a toy or drawing, unsuitable content.
- **Enforced the way the care photos are.** `POST /animals/match` takes the
  form's whole set (`photos`; the older single `photo` still works), screens
  each photo in parallel before the comparison, answers 422 `photoRejected`
  naming every refused photo (`photoIndexes`; `photoIndex` is the first,
  whose reason is shown), and otherwise hands back one
  signed `photoToken` per photo (kind `animalPhoto`; user, species, file,
  what the model said; fifteen minutes). `POST /animals/:id/photos` redeems
  a token — the species must be the animal's — or screens a direct upload
  inline, so a client that skips the match step gains nothing. The photos
  travel once; both clients fall back to the file when a token has expired
  (a long look at the candidates).
- **Single use is a read, not a column.** A token whose file is already in a
  gallery answers 409 `photoAlreadyUsed`, found by file name so the Host the
  URL was built under does not matter. Unlike the care photos there is no
  unique index behind it: two redeems of one token racing both pass the
  read (reproduced in review), and the duplicate is a second row on the
  same file in one gallery, not a second drop on the map — not worth a
  migration.
- **Clients: no "add anyway".** The refused photo leaves the strip with the
  model's reason under it; the user picks another. A photo that fails
  after the record exists lands the user on the profile with the reason —
  never back on a form whose save would register the animal twice.
- **Cost.** A registration is now up to `MAX_PHOTOS` + 1 small image
  requests (six screenings and the comparison) instead of one; each is a
  single downscaled image with thinking off, the cheapest call the
  service makes. The match limiter (30/hour/user) still bounds it.
- **Pending files, swept.** The match step used to delete its scratch
  upload on every outcome; a photo behind a token has to stay. It stays as
  `pending-<name>` (its own multer store), the token names the final
  `<name>`, and the redeem renames the file into it (atomic on one
  volume) so the sweeper leaves it alone; a redeem that finds only the
  final file is let through for the single-use read to judge. If the
  insert then fails the file goes back under the prefix, so the token
  still redeems and, failing that, the sweeper owns it. Most match
  calls end in "that one is already registered" or a step back, never in
  a create, so a sweeper (`config/upload.js`, at boot because the machine
  autostops when idle, then every five minutes) deletes pending files
  older than thirty minutes. It never touches a file without the prefix,
  and no row ever references a prefixed file, so it needs no database.
  The care check's abandoned file (one per cancelled drop) is the same
  class of leak and is not on this scheme yet.
- **Not stored.** `animal_photos` has no `ai_check` column and the token
  carries nothing about the verdict either; the screening is enforced,
  not audited. Add the column when the answers need auditing, as
  `care_actions.ai_check` does today.
- **Evidence.** `scripts/ai-check/checks.sh` sections 11–15: tokens issued
  and redeemed once (pending → final rename), bent tokens refused, the
  refusal naming the second of two photos, the inline screening of a
  direct upload, fail-open with the model down, the sweeper sparing fresh
  and real files, multer's limits answered as Turkish 400s.
