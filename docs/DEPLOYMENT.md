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
   (the app's bundle id — permanent once submitted), with *Sign in with
   Apple* enabled.
2. **Apple Developer → Identifiers → Services ID** (e.g.
   `com.pati-app.web`) for web sign-in, with `pati-app.com` as the domain
   and `https://pati-app.com/giris` as the return URL. Apple asks you to
   verify the domain with a file it generates.
3. **Google Cloud → APIs & Services → Credentials → OAuth client ID**, twice:
   one *iOS* client (bundle id) and one *Web application* client
   (`https://pati-app.com` as origin). The consent screen needs the app name,
   the support e-mail and the two legal URLs (`/gizlilik`, `/kosullar`).
4. **iOS only, and this one is load-bearing:** paste the Google iOS client's
   *reversed* id (it looks like `com.googleusercontent.apps.123-abc`) into
   `mobile/ios/StrayMobile/Info.plist` as an extra `CFBundleURLSchemes`
   entry next to `pati`, **and** put the plain id into
   `mobile/src/googleClientId.ts` in the same commit, then rebuild natively.
   The app compares the two: iOS draws the Google button only when the
   server's `GOOGLE_IOS_CLIENT_ID` equals the id compiled into the binary,
   so a mismatch hides the button instead of crashing. That guard exists
   because a release build without the matching scheme **does not show an
   error — it terminates**: Google's SDK raises an Objective-C exception and
   the React Native wrapper only catches it under `#if DEBUG`, which is why
   the simulator looked well-behaved. The Sign in with Apple entitlement is
   already in the project (`StrayMobile.entitlements`).

**Then the secrets** — every one of them is a public identifier, not a
password; nothing here is a client *secret*:

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

**Schema:** the sign-in tables are new, and `CREATE TABLE IF NOT EXISTS`
cannot alter the existing `users` table, so production needs the one-off
migration once:

```bash
fly ssh console --app pati-app -C "node scripts/migrate-social-auth-20260902.js"
```

**Local check:** `bash backend/scripts/social-auth-check/run.sh` boots a
throwaway backend and a local issuer and drives the whole flow (create, link,
refuse a forged token, delete). It needs the local database running — and on
a machine whose `stray-db` predates S7, the migration above has to be run
locally first (`cd backend && node scripts/migrate-social-auth-20260902.js`).
`contracts/init.sh` alone is not enough: it runs `001_init.sql`, whose
`CREATE TABLE IF NOT EXISTS` cannot alter the existing `users` table, so the
check fails at step 1 with a NOT NULL violation on `password_hash`.

## Custom domains

```bash
fly certs add app.YOURDOMAIN.com --app pati-app   # add the printed CNAME/A records to DNS
fly certs show app.YOURDOMAIN.com --app pati-app  # https is ready when it says "Ready"
```

## Subsequent deploys

`fly deploy` after `git push`. The schema is a single `IF NOT EXISTS` file, so
migrate runs safely on every deploy; adding columns requires incremental
migrations (see ROADMAP).

## Known limits (pilot)

- Photos sit on a single machine's disk: keep machine count at 1; moving to
  object storage (R2/S3) is on the roadmap.
- `auto_stop_machines`: the machine sleeps without traffic; the first request
  takes ~1-2 s.
- The admin panel is served from the same app: requests arriving at
  `ADMIN_HOST` (admin.pati-app.com) get `admin/dist`
  (add the certificate with `fly certs add admin.pati-app.com`).
- Rate limiting covers only `/api/auth` (30 attempts / 15 min).
