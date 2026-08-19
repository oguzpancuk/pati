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
