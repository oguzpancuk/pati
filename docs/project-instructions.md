# Project instructions — pati

<!-- SOURCE of the project's instructions field (Project settings > Memory).
     Edit here, commit, paste again. Rules about the repository itself live
     in CLAUDE.md, which every thread reads from its clone. -->

## About
<!-- Written by /mvp-scope from docs/PRD.md and docs/ROADMAP.md; re-run it
     and paste again whenever the ROADMAP changes. The coordinator has no
     clone: this block is what it knows about the product. -->
- Product: mobile app coordinating street-animal care — a map of
  food/water drop points, animal profiles, health records, badges and a
  leaderboard. Turkish users; English codebase.
- Areas: `backend/` (Express, PostgreSQL + PostGIS) · `mobile/` (React
  Native — the primary app) · `web/` (Vite PWA, a full third client kept
  in sync with mobile) · `admin/` (panel) · `shared/` (SVG generators, the
  basemap builder).
- Walking skeleton: shipped — the PRD's §5 (registration, the map and its
  areas, food/water actions, animal profiles, health records,
  notifications). The product is live (v42).
- v1, open, in this order (`docs/ROADMAP.md`, "Build order from
  2026-09-21", has every clause in full):
  1. Paged lists get a tiebreaker — manual check: the harnesses page a
     seeded tie group and every id appears exactly once.
  2. Anonymising an account must not resurface what a block hid — manual
     check: the blocker's unread count does not move.
  3. One shared animal-id guard — test: a `node --test` file refuses
     `99999999999`, `0x10`, `abc`; manual check: no 500s.
  4. The care-marker harness tells the truth — manual check: section 16
     goes red with the marker insert removed.
  5. Crash reporting, before the pilot — manual check: a forced Release
     crash arrives symbolicated. Ask me first: the provider.
  In parallel and mine: the App Store submission (its code side is done).
  The pilot waits for item 5.
- Deferred: the parity test for the three mirrors · admin 2FA / IP
  allowlist · accessibility (contrast, screen-reader labels) · the Android
  wave and background notifications · the App Review Notes fix (before the
  first advertiser) · donations (external blockers) · small review-parked
  debts. Reasons are in the ROADMAP.

## Work
- The plan is `docs/ROADMAP.md`, written by me. Threads execute it in
  order; nobody re-plans it here. Whatever I paste is the task; if a
  ROADMAP item already covers it, say so instead of starting a second
  thread.
- One feature per thread. A second problem found on the way goes into
  `docs/NOTES.md`, not into the fix.
- When a thread reports back, it names the ROADMAP item it completed and
  the next unstarted one. The coordinator has no clone; this is how it
  knows where the build order stands.
- Propose threads before starting them; at most two at a time until I say
  otherwise.

## Pull requests
- Start from `main`, work on your own branch, open one pull request per
  thread. The body names the done-when clause it satisfies and carries
  screenshots of what changed on the web surface (CLAUDE.md, Looking at
  it); what else it carries, CLAUDE.md says.
- A `manual check` clause is listed in the body as "awaiting the owner's
  check on a device", with what to try. I check before merging, from a
  local session on the web or in the simulator; the thread does not
  report that item done and never triggers a build.
- `main` is protected: CI green and up to date with `main`, or no merge.
  When `main` moves under your open pull request, merge it into your branch
  yourself.

## Review
- When a thread opens a pull request, start a review thread for it. Its
  task: `/code-review --comment` on the pull request — never `--fix`. If
  `--comment` cannot post from the thread, post each finding as a pull
  request comment yourself, file and line included.
- In a summary comment it also checks that every new test covers the clause
  it claims and that the body shows its red run, then ends with APPROVE or
  NEEDS_WORK and one sentence why.
- The review thread keeps watching the pull request. After each push it
  reviews the delta the same way, until its summary says APPROVE. The
  authoring thread fixes what the review posts.

## Ask me first
- Deploys and release tags are not done from this project at all: I run
  them from a local session. Anything else outward-facing — DNS,
  third-party dashboards, production data — ask me first.
- A schema or API change that is not reversible in one commit.
- A dependency that is not clearly better than the standard library.

## Memory
- Project memory stays in this project. What is about the repository — a
  pitfall, a template improvement, a battery miss — also goes into
  `docs/NOTES.md`, under the section CLAUDE.md names. Only the repo reaches
  the other products.
