# ADR-0004: E-mail registration is verified with a typed code, and gated until then

Status: accepted · Date: 2026-09-03

## Context

`POST /auth/register` proved nothing about the address. ADR-0003 spelled out
the two costs: a provider sign-in could never link into a password account
(linking into an unproven address is a takeover), and anyone could register
on someone else's address and hold it forever — the real owner could not
register, could not sign in with a provider, and had no reset. The ROADMAP
listed one confirmation flow as the cure for both.

The owner asked for "a confirmation mail whose link completes the
registration, or whatever the modern standard is".

## Decision

- **A six-digit code, typed into the session that registered — not a
  link.** The account is created at once, in a _pending_ state, together
  with a session token; the mail carries the code; `POST /auth/verify-email`
  with that token and that code proves the address. Proving an address
  therefore needs the mailbox _and_ the password. A link would verify
  whoever clicks it, and people click "confirm your e-mail" mails they never
  asked for: someone registering on another person's address could get that
  person to confirm it, ending up with a proven account on the address —
  precisely the thing provider sign-in then links into. The code cannot be
  typed into an attacker's app by the victim. (Six digits also work on the
  web, and iOS fills them from the Mail notification.)
- **Pending accounts are gated server-side.** `requireAuth` reads
  `users.email_verification_pending` on every request, like suspension, and
  answers 403 with `emailUnverified: true`. Only the verification endpoints
  and the account's own `GET`/`DELETE /users/me` accept a pending session
  (deletion must always work — App Store 5.1.1(v)). Both clients show the
  code screen and nothing else while the flag is set, and treat that 403
  from anywhere as "switch to the code screen".
- **The pending flag is its own column.** `email_verified` keeps its
  ADR-0003 meaning (proven, linkable) and is set by the code. The new
  column's default — false — is the grandfathering rule: accounts from
  before this feature stay usable and unproven, with no backfill to re-run
  on every deploy (the trap NOTES records from S7).
- **Guessing is bounded by a cap, a cooldown and a limiter.** Only the
  salted SHA-256 of the code is stored; the attempt is counted in the same
  statement that reads the row, so concurrent guesses cannot share one; a
  code retires itself after five wrong guesses; a resend has a 60-second
  cooldown per account and a per-user limit of six an hour; verification
  attempts are limited to thirty an hour per user. Codes expire after
  fifteen minutes.
- **A pending registration holds its address for 24 hours, then becomes
  replaceable — by deleting the row, never by updating it.** Holding it is
  what stops someone from re-registering under a registration whose code
  is about to be typed and swapping in their own password. Releasing it is
  what makes squatting temporary: the squatter knows a password but never
  sees the mailbox, so the account never leaves pending, and after a day
  the real owner's registration replaces it. The replacement is a fresh
  row: a fresh id means every token the old registration was ever issued
  is dead. The first version updated the row in place, and review
  reproduced the consequence — the squatter's still-valid seven-day token
  became a session on the victim's verified account. Retire-then-insert
  runs in one transaction, so concurrent replacements queue on the row lock
  and only one gets in. A verified account is never replaceable.
- **A verified provider e-mail takes a pending registration over at once,
  hold or no hold.** The provider proved the mailbox; the pending
  registrant never did. Without this a squatted address stayed closed to
  its owner's Apple/Google sign-in for as long as the squatter re-registered
  daily (review finding). Grandfathered accounts — usable, never proven —
  are still refused with "use your password", as ADR-0003 decided; only the
  gated, pending kind is retired.
- **Login is allowed while pending** — it is how someone who closed the app
  gets back to the code screen — but sends no mail; the screen has a resend
  button. An automatic mail per login would let anyone holding the password
  fill the address's inbox.
- **Mail goes through Resend's HTTP API with Node's own `fetch`.** No SDK,
  no SMTP library: the call is fifteen lines and swapping providers means
  changing them. Without `RESEND_API_KEY`, development uses a transport
  that prints to stdout (and to `MAIL_OUTBOX_FILE`, which is how the check
  harness reads the code back), and production **turns verification off**
  — registration behaves as before, the boot log says so. A pending account
  nobody can ever reach would be worse than the old behaviour.

## Consequences

- Provider linking now has a way to become possible for password accounts:
  once verified, `email_verified` is true and ADR-0003 step 2 links. Older
  accounts stay unproven until they verify — a "verify my e-mail" action
  from the profile would reuse the same endpoints and is the obvious next
  step, together with "set a password" for social accounts and a password
  reset (all three share the mail transport this adds).
- The registration screens hand the user to a code screen; a mistyped
  address is recovered by signing out and registering again (the wrong
  address is held for a day, which only matters if it was someone else's).
- Sending requires the domain to be verified at Resend (DNS records; owner
  side, docs/DEPLOYMENT.md). Until the secret exists nothing changes for
  users.
- The dev transport means the code shows up in the backend log; the check
  harness `backend/scripts/email-verification-check/run.sh` drives the whole
  flow (pending, gate, wrong/expired/retired codes, cooldown, hold expiry,
  replacement with the old session dying, concurrent replacement, provider
  takeover of a pending row, deletion, and the ADR-0003 link that
  verification unlocks).
- `AUTH_RATE_LIMIT` (ignored in production) lets that harness exceed the
  30-per-15-minutes brake on `/api/auth`.
- **Accepted:** a squatter who re-registers every day renews the hold, so
  the password-vs-password race on an address neither side has proven is
  won by whoever registers first each day. The provider takeover above is
  the proof-based exit; a password-only owner of a persistently squatted
  address waits for the squatter to miss a day. Also accepted: the 409 now
  distinguishes "pending" from "taken", a small new signal that someone
  registered on the address recently, in exchange for telling the honest
  registrant to log in and resend rather than to give up.
- Not built: cleanup of pending rows that were never verified (they cost a
  row each and free their address after a day anyway), and admin visibility
  of the pending flag.
