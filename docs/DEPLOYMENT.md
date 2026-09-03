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

- Photos sit on a single machine's disk: keep machine count at 1; moving to
  object storage (R2/S3) is on the roadmap.
- `auto_stop_machines`: the machine sleeps without traffic; the first request
  takes ~1-2 s.
- The admin panel is served from the same app: requests arriving at
  `ADMIN_HOST` (admin.pati-app.com) get `admin/dist`
  (add the certificate with `fly certs add admin.pati-app.com`).
- Rate limiting covers only `/api/auth` (30 attempts / 15 min).
