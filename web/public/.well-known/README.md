# `/.well-known/`

Files a third party fetches from `pati-app.com` to prove the domain is ours.
Vite copies everything in `web/public/` into `web/dist/`, and in production
the backend serves that folder, so a file dropped here is live at
`https://pati-app.com/.well-known/<name>` after the next deploy.

## Sign in with Apple, web (Services ID)

Apple Developer → Identifiers → Services IDs → the pati service → Configure →
Web Authentication Configuration. Register `pati-app.com` as a domain and
Apple offers **`apple-developer-domain-association.txt`** to download. Put it
in this folder under exactly that name, commit, deploy, then press Verify in
the console. Apple fetches it over HTTPS with TLS 1.2 or higher, which Fly
already terminates.

Both halves of that path were checked on 2026-09-16 rather than assumed,
because a leading dot is the kind of thing a static file server hides:
`vite build` copies this directory into `dist/` intact, and the backend's
`express.static` serves a `.well-known` path (200 with the file's bytes) —
the dotfile default does not swallow it. Nothing in `app.js` has to change.

Do not put anything secret here. Everything in this folder is public.
