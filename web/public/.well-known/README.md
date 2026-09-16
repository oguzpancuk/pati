# `/.well-known/`

Files a third party fetches from `pati-app.com` to prove the domain is ours.
Vite copies everything in `web/public/` into `web/dist/`, and in production
the backend serves that folder, so a file dropped here is live at
`https://pati-app.com/.well-known/<name>` after the next deploy.

The folder is empty on purpose. It is kept because the serving path was
tested on 2026-09-16 and works — `vite build` copies this dotted directory
into `dist/` intact, and the backend's `express.static` answers 200 with the
file's bytes, which is not obvious for a name beginning with a dot. So when
some service does ask for a verification file, it is a drop-in and no code
has to change.

## Sign in with Apple did NOT need one

Worth writing down, because every guide says otherwise and the owner spent a
round hunting for a download button that was not there. Registering
`pati-app.com` and the return URL `https://pati-app.com/giris` under the
Services ID `com.pati-app.web` (Identifiers → Services IDs → Sign in with
Apple → Configure → Website URLs) was enough on its own: Apple's console
offered no `apple-developer-domain-association.txt` and the configuration
works without it.

How that was settled without touching production — open Apple's own
authorize endpoint in a browser with our values:

```
https://appleid.apple.com/auth/authorize?client_id=com.pati-app.web&redirect_uri=https%3A%2F%2Fpati-app.com%2Fgiris&response_type=code%20id_token&scope=name%20email&response_mode=form_post&state=probe
```

Apple answered with its sign-in page, headed "pati-web uygulamasına giriş
yapmak için…". That is the proof: an OAuth provider validates `client_id`
and `redirect_uri` **before** it will show a sign-in page, or it would be an
open redirect. An unregistered return URL answers `invalid_request` instead.
Use the same probe if the web button ever breaks — it separates "our
configuration is wrong" from "our code is wrong" in one request, and writes
nothing.

Do not put anything secret in this folder. Everything here is public.
