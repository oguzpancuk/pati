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
- **Resolution order: identity, then verified e-mail, then a new account.**
  A provider e-mail that is verified and already registered links to that
  account, so someone who registered with a password and later taps "Google
  ile giriş" lands in their own account instead of a duplicate. An
  *unverified* e-mail may never do this; it is refused with 409. That single
  rule is the difference between convenience and account takeover.
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
  docs/DEPLOYMENT.md. Sign in with Apple is bound to the App ID, so it is
  also bound to the bundle-id decision still open in the ROADMAP.
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
