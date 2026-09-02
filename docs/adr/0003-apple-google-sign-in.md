# ADR-0003: Apple and Google sign-in verify the identity token server-side

Status: accepted · Date: 2026-09-02

## Context

The app had one way in: e-mail plus password. Sprint item S7 adds Apple and
Google sign-in, and the App Store forces them to arrive together — offering
Google (or any third-party sign-in) makes Sign in with Apple mandatory,
guideline 4.8.

Three questions had to be settled before any code: what the server trusts,
what happens when a provider's e-mail already belongs to an account, and how
an account with no password proves itself when it asks to be deleted (5.1.1(v)
requires in-app deletion to keep working).

## Decision

- **The server verifies the identity token itself** (`backend/src/utils/
  socialAuth.js`). Both providers hand the client a signed OpenID Connect
  JWT; the client posts it to `POST /api/auth/{apple,google}` and the backend
  checks signature (against the provider's published JWKS, RS256 only),
  issuer, audience (our own client ids) and expiry. Trusting a client-side
  "the user is signed in" claim, or trusting a provider's profile endpoint
  without checking the audience, would let anyone replay a token minted for
  another app.
- **Two dependencies were avoided**: `jsonwebtoken` is already in the
  backend, and Node 20 turns a JWK into a public key natively. No provider
  SDK runs on the server.
- **Identities live in their own table** (`user_identities`), keyed by
  `(provider, subject)`. The provider's `sub` is the only stable identifier —
  e-mails change, subjects do not.
- **Resolution order: identity, then proven e-mail, then a new account.**
  Step 2 links only when BOTH sides are proven: the provider says it verified
  the address, *and* the account being linked into has a proven address of
  its own (`users.email_verified`, which only provider sign-in can set).
  `POST /auth/register` confirms nothing, so anyone can register on someone
  else's address; without the second clause the victim's first "Google ile
  giriş" would drop them inside an account the squatter holds a password for.
  Those users get a 409 telling them to sign in with their password. The
  first version of this decision had only the provider-side clause, and
  review reproduced the takeover it left open.
  Addresses are compared case-insensitively and stored lower-cased: providers
  always report lower-case, so an exact match would send anyone who typed a
  capital at registration to a second, empty account instead of the 409.
- **An unverified provider e-mail is refused outright** (403), for linking
  *and* for creating. Refusing the link is the obvious half. Refusing the
  creation is the half the first version of this code got wrong: an account
  created from an unverified address becomes the owner of that address, so
  the address's real owner would be merged into the squatter's account on
  their first verified sign-in — two people, one session each, same account.
  Both halves are in `backend/scripts/social-auth-check/run.sh` step 8 (step
  10 covers the unproven-account rule). The cost is that a provider account
  whose e-mail is not verified cannot sign in at all; it can still register
  with an e-mail and password.
- **Social accounts have no password**: `users.password_hash` is now
  nullable rather than holding a random hash nobody chose. The password login
  path answers such accounts by naming their provider instead of "wrong
  password".
- **Deletion re-authenticates either way**: password accounts type their
  password, social accounts sign in with the provider again and the token is
  matched against *their own* identity row. Deleting an account also deletes
  its identity rows — otherwise the same Apple id would walk straight back
  into the anonymized, suspended account.
- **The clients ask the server which buttons to draw** (`GET /api/auth/
  providers`). A deployment without credentials shows the plain e-mail form
  and loads no third-party script at all, which is also the honest reading of
  the KVKK notice.
- **Google's button on web is Google's own.** Google Identity Services only
  hands out an ID token through the button it renders (or One Tap); a
  hand-drawn button can obtain an access token, which is not what the backend
  verifies. Mobile has no such restriction and draws the pati button. This is
  the one deliberate divergence between the two clients' sign-in rows.

## Consequences

- Sign-in works only where the console values exist: Apple needs an App ID
  with the capability (and a Service ID + verified domain for web), Google
  needs OAuth client ids. Both are owner-side; the steps are in
  docs/DEPLOYMENT.md. Sign in with Apple is bound to the App ID, and
  therefore to the bundle id — settled as `com.oguzpancuk.pati`.
- **Squatting an address is now permanent until support intervenes.**
  Registration proves nothing, so anyone can take `victim@gmail.com`. The
  victim then cannot register (409), cannot sign in with a provider (the new
  409), has no password, and the app has neither password reset, e-mail
  confirmation, nor admin user deletion — so only direct database access
  frees the address. The `/api/auth` rate limit keeps this targeted rather
  than mass. Accepted knowingly: the alternative is the takeover above. The
  ROADMAP carries both cures (e-mail confirmation, an admin path).
- **"The clients ask the server which buttons to draw" cannot be the whole
  story on iOS.** Google's SDK needs the reversed client id as a URL scheme
  in `Info.plist`, which is a build-time value: a runtime-configured
  `iosClientId` can never make Google sign-in work on a build that was not
  already baked for that client id, and the mismatch raises an
  Objective-C exception that a *release* build does not catch. So the id the
  binary was built for is compiled in (`mobile/src/googleClientId.ts`) and
  the iOS button is drawn only when the server reports exactly that id — a
  Fly secret alone can never make a shipped binary tap into a scheme it does
  not carry. The other half of the pairing (that constant ↔ the
  `Info.plist` scheme) is nothing the app can check at runtime, so a jest
  test asserts it instead; review pointed out that prose was holding it
  together.
- On iOS, a Google-only account cannot delete itself while the button guard
  hides the button (rotated secret, a build without the compiled-in id): the
  provider is its only proof of identity. Failing closed beats the crash it
  replaced, but App Store 5.1.1(v) makes this the one flow that must always
  work, so the guard's inputs deserve care.
- A social account cannot fall back to a password: the app has no
  password-set and no password-reset flow, so a user whose provider account
  disappears loses access. Acceptable while the app has no password reset at
  all; when one is added, "set a password" belongs with it.
- Replay of a stolen, still-valid identity token is not separately defended
  against (no server-issued nonce). The window is the provider's token
  lifetime — ten minutes for Apple — and the token never leaves TLS.
- The backend has no test suite, so the flow is covered by
  `backend/scripts/social-auth-check/run.sh`, which stands up a local issuer
  whose signing key the checks control and drives the real endpoints.
- The schema changes ship as `migrations/002_social_auth.sql`, applied by the
  release command like every other migration. They were a one-off script
  first; review pointed out that the documented deploy order then had a
  window where the credentials were live and the column was not, and every
  sign-in 500ed inside it.
