# Deployment (Fly.io)

Single image: Node backend + built web PWA (`/`), landing page (`/tanitim/`),
API (`/api`). Photos live on a persistent Fly volume (`/data/uploads`); the
database is Fly Postgres with PostGIS. Configuration: `Dockerfile` and
`fly.toml` at the repo root.

## First-time setup (once)

```bash
brew install flyctl
fly auth login                                  # opens the browser
fly apps create pati-app                        # if the name is taken, change app in fly.toml
fly postgres create --name pati-db --region fra --vm-size shared-cpu-1x --initial-cluster-size 1 --volume-size 3
fly postgres attach pati-db --app pati-app      # writes the DATABASE_URL secret
fly volumes create uploads --region fra --size 3 --app pati-app
fly secrets set JWT_SECRET="$(openssl rand -hex 32)" JWT_EXPIRES_IN=7d --app pati-app
fly deploy                                      # build + release_command (migrate) + start
fly open                                        # https://pati-app.fly.dev
```

PostGIS ships in the `postgres-flex` image; `CREATE EXTENSION IF NOT EXISTS
postgis` in `001_init.sql` runs in the release step.

First admin: register in the app, then
`fly ssh console --app pati-app -C "node scripts/make-admin.js email@address"`.

## Guide (demo) data

So the app doesn't open onto an empty map, "guide" users can be seeded into
Istanbul's central districts, İzmir's central districts, Antalya/Kaş, and
Milas/Güllük: 10 accounts per area with a month of organic usage history
(~3 animals per week, food/water every other day, chats, vaccination and
health records). Records don't pile up at district centers: each district is
defined by neighborhood anchor points and every guide lives in a "home
neighborhood" (see `DISTRICTS` in `scripts/seed-guides.js`). Their bot nature
is not hidden — names read "… · pati rehberi" and every animal's first comment
says the record is an example; the comments double as a tutorial for how the
app is used. (Seeded content itself is Turkish: it is product-facing.)

```bash
fly ssh console --app pati-app -C "node scripts/seed-guides.js"            # create
fly ssh console --app pati-app -C "node scripts/seed-guides.js --refresh"  # fresh food/water
fly ssh console --app pati-app -C "node scripts/seed-guides.js --remove"   # remove entirely
```

The script only ADDS (unlike `seed-demo.js`, no TRUNCATE); it never touches
existing users/animals/admins, so it is production-safe. Guide passwords are
generated randomly per run and shown only in the script output. Because the
map's green fades in 4-6 hours, `DEMO_GUIDE_REFRESH = "1"` in `fly.toml` makes
the server add a few fresh records hourly (harmlessly inert once the guide
data is removed).

## Apple / Google sign-in (S7)

The buttons appear only where the backend has credentials: `GET
/api/auth/providers` reports what is configured, and both clients hide what
they are not told about. So an environment with none of the secrets below
keeps working exactly as before — the plain e-mail form, no third-party
script — and nothing here has to be done before a deploy.

**Owner-side console work (nobody else can do it):**

1. **Apple Developer → Identifiers → App ID** for `com.oguzpancuk.pati`
   (the app's bundle id — permanent once submitted), with _Sign in with
   Apple_ enabled.
2. **Apple Developer → Identifiers → Services ID** (e.g.
   `com.pati-app.web`) for web sign-in, with `pati-app.com` as the domain
   and `https://pati-app.com/giris` as the return URL. Apple asks you to
   verify the domain with a file it generates.
3. **Google Cloud → APIs & Services → Credentials → OAuth client ID**: one
   _iOS_ client whose bundle id is **`com.oguzpancuk.pati`** (a Google iOS
   client is bound to that string — the old `com.patiapp` would produce a
   client that can never work), and one _Web application_ client with
   `https://pati-app.com` as an origin. When Android ships it needs a third,
   _Android_ client, registered against the **applicationId**
   (`com.oguzpancuk.pati`) and the signing SHA-1 — not the `namespace`
   (`com.patiapp`) that appears throughout the Android sources; getting that
   pair wrong yields `DEVELOPER_ERROR` on every Android sign-in. The consent
   screen needs the app name, the support e-mail and the two legal URLs
   (`/gizlilik`, `/kosullar`).
4. **iOS only, and this one is load-bearing:** paste the Google iOS client's
   _reversed_ id (it looks like `com.googleusercontent.apps.123-abc`) into
   `mobile/ios/StrayMobile/Info.plist` as an extra `CFBundleURLSchemes`
   entry next to `pati`, **and** put the plain id into
   `mobile/src/googleClientId.ts` in the same commit, then rebuild natively.
   The app compares the _server's_ id to the compiled-in one and draws the
   iOS button only when they match, so a stale Fly secret hides the button
   instead of crashing it. Nothing at runtime can read `Info.plist`, so the
   remaining pairing — compiled-in id ↔ URL scheme — is asserted by
   `mobile/__tests__/googleClientId.test.ts`, which the battery and CI run.
   Until the id is filled in, that test only checks that no stray scheme is
   present; filling it in is what switches the pairing assertion on. That guard exists
   because a release build without the matching scheme **does not show an
   error — it terminates**: Google's SDK raises an Objective-C exception and
   the React Native wrapper only catches it under `#if DEBUG`, which is why
   the simulator looked well-behaved. The Sign in with Apple entitlement is
   already in the project (`StrayMobile.entitlements`).

**Then the secrets** — every one of them is a public identifier, not a
password; nothing here is a client _secret_:

```bash
fly secrets set --app pati-app \
  APPLE_CLIENT_IDS="<bundle id>,<service id>" \
  APPLE_SERVICE_ID="<service id>" \
  APPLE_WEB_REDIRECT_URI="https://pati-app.com/giris" \
  GOOGLE_CLIENT_IDS="<ios client id>,<web client id>" \
  GOOGLE_IOS_CLIENT_ID="<ios client id>" \
  GOOGLE_WEB_CLIENT_ID="<web client id>"
```

`APPLE_CLIENT_IDS` / `GOOGLE_CLIENT_IDS` are the audiences a token may carry;
a token issued for any other app is refused. The remaining three are handed
to the clients so they can configure their SDKs without a rebuild.

**Schema:** nothing to do by hand. `migrations/002_social_auth.sql` carries
the changes `001_init.sql` cannot make to an existing `users` table, and the
release command applies it on every deploy (idempotent). It was a manual
one-off script at first, which left a window where the secrets could be live
before the column existed — every sign-in 500ed inside it.

**Local check:** `bash backend/scripts/social-auth-check/run.sh` boots a
throwaway backend and a local issuer and drives the whole flow (create, link,
refuse a forged token, delete). It needs the local database running;
`contracts/init.sh` is enough, since its `npm run migrate` applies
`002_social_auth.sql` along with the rest.

## E-mail verification (ADR-0004)

Registration mails a six-digit code and holds the account until it is
typed — **only where the backend can send mail**. Without the secret below,
production registers accounts unverified exactly as before, and the boot
log prints `mail: NOT CONFIGURED — e-mail verification is off`.

**Owner-side, once:** create a [Resend](https://resend.com) account, add
`pati-app.com` under _Domains_ and publish the DNS records it shows (DKIM
TXT, plus the SPF/MX pair for the bounce subdomain). Sending from an
unverified domain is refused with a 403 that ends up in the backend log as
`Resend answered 403`.

**Then the secret** (the only one that is actually secret):

```bash
fly secrets set --app pati-app RESEND_API_KEY="re_…"
# optional, defaults to "Pati <noreply@pati-app.com>":
fly secrets set --app pati-app MAIL_FROM="Pati <noreply@pati-app.com>"
```

**Schema:** nothing by hand — `migrations/003_email_verification.sql` adds
the column and table, idempotently, on every deploy. Existing accounts are
untouched: the column default is what keeps them usable.

**Local check:** `bash backend/scripts/email-verification-check/run.sh`
boots a throwaway backend whose mail goes to a file and drives the flow end
to end (93 assertions). In ordinary development the code is printed to the
backend log (`/tmp/pati-backend.log`) — there is no mail to open.

## Photo checks and photo matching (ADR-0005)

The food/water photo check, the species screening of every animal photo and
the photo comparison in the add-animal flow call Gemini from the backend on
**Google's paid tier** (owner decision,
2026-09-07: the free tier is about 20 requests per project per day —
enough to test, not to run — and its data-use terms are unwanted; see the
ADR amendment). Both are **off until the key exists**: photos are accepted
unchecked and matching is field-only, exactly as before, and the boot log
prints `ai: NOT CONFIGURED …`. A registration costs up to seven small
image requests (six screenings at most, one comparison), a drop costs one.
To turn them on:

1. In Google AI Studio, enable billing on the project that owns the key
   (AI Studio → API keys → the project → billing). Without this step the
   key still works, but on the free tier: after ~20 requests in a day
   every check fails open for the rest of it, and the photos go out under
   the free tier's data-use clause. Confirm on the AI Studio rate-limit
   page that the project shows a paid tier before the next step.
2. Set the secret:

```bash
fly secrets set --app pati-app GEMINI_API_KEY="AIza…"
# optional, defaults to gemini-3.5-flash. Any other model must accept
# generationConfig.thinkingConfig (gemini-3.5-flash-lite does not: every
# care check would 400 and fail open while matching kept working).
fly secrets set --app pati-app AI_MODEL="gemini-3.5-flash"
```

3. Before the key reaches production, the privacy text must name Google
   as a processor of uploaded photos.

After the deploy the boot log says `ai: gemini-3.5-flash (photo checks and
photo matching on)`. A dead key or an exhausted quota never
blocks users — every failure fails open and is logged with an `[ai:…]`
tag, so grep the Fly log for that after turning it on.

**Schema:** `migrations/004_ai_checks.sql` adds `care_actions.ai_check`
idempotently on every deploy.

**Local check:** `bash backend/scripts/ai-check/run.sh` boots a throwaway
backend against a fake Gemini endpoint and drives every branch (approve,
reject, dead model, matching); `node backend/scripts/ai-check/live-sample.js`
sends real photos to the real model with your key — that is the accuracy
check; it counts against the key's quota.

## Photo storage (Cloudflare R2 or any S3-compatible bucket)

Without configuration nothing changes: photos are written to the machine's
disk (`UPLOADS_DIR=/data/uploads`, the Fly volume, scheduled snapshots with
14-day retention). That is one copy on one machine — fine for the pilot,
not for growth, which is why the launch sprint lists object storage first
under data safety.

With a bucket configured the bucket becomes the copy of record and the
volume becomes a cache. **Stored URLs do not change**: photos are served by
us at `/uploads/<file>` either way, so every row already in the database
keeps working and no migration is needed.

1. Cloudflare dashboard → R2 → *Create bucket* (`pati-uploads`, region
   Automatic). The free tier is 10 GB of storage, and R2 charges nothing
   for egress.
2. R2 → *Manage API tokens* → *Create API token*, permission **Object Read
   & Write**, scoped to that bucket. Note the access key id, the secret and
   the S3 endpoint (`https://<account-id>.r2.cloudflarestorage.com`).
3. Set the secrets and deploy:

```bash
fly secrets set --app pati-app \
  S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com \
  S3_BUCKET=pati-uploads \
  S3_ACCESS_KEY_ID=... \
  S3_SECRET_ACCESS_KEY=...
```

4. Confirm from the release log — `photos: s3 (...)` on boot, `photos: disk
   (...)` when any of the four is missing. Then upload one photo and check
   it appears in the bucket.

`S3_REGION` defaults to `auto` (R2's); AWS S3 needs the real region.
`S3_PREFIX` puts every object under a folder, if a bucket is shared.

**Photos already on the volume are not copied up.** The bucket owns what is
uploaded after it is configured; older photos keep being served from the
volume, and the fallback fetch only runs when the volume does not have the
file. Copying the backlog is a one-off `rclone`/`aws s3 sync` of
`/data/uploads` into the bucket, safe to run at any time.

**A bucket does NOT yet let you run two machines.** What it gives is
durability and the ability to serve a photo this machine never received.
Two flows still hand a file between requests through the local volume: the
care-photo check and the add-animal match write a file in one request and
redeem it by name in the next (`redeemPhotoToken`), and the AI's comparison
reads the gallery's files from disk (`uploadPathFromUrl`), quietly
accepting a match unchecked when they are not there. On two machines the
second request lands on the other one about half the time, and the user is
told to re-shoot a photo that was fine. Keep `min_machines_running`/scale at
1 until those two paths go through the driver as well (roadmap).

## Custom domains

```bash
fly certs add app.YOURDOMAIN.com --app pati-app   # add the printed CNAME/A records to DNS
fly certs show app.YOURDOMAIN.com --app pati-app  # https is ready when it says "Ready"
```

## Subsequent deploys

`fly deploy` after `git push`. The release command applies every file in
`backend/migrations/` in order, all of them idempotent, so migrate runs safely
on every deploy; a change to an existing table goes into a new numbered file
as well as `001_init.sql` (see CLAUDE.md).

## Known limits (pilot)

- Keep the machine count at 1. Without a bucket the photos exist only on
  that machine's volume; with one they are durable, but two upload flows
  still pass a file between requests through the local volume (see "Photo
  storage" above).
- `auto_stop_machines`: the machine sleeps without traffic; the first request
  takes ~1-2 s.
- The admin panel is served from the same app: requests arriving at
  `ADMIN_HOST` (admin.pati-app.com) get `admin/dist`
  (add the certificate with `fly certs add admin.pati-app.com`).
- Rate limiting covers only `/api/auth` (30 attempts / 15 min).
