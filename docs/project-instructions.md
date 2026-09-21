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
- Build order: [run /mvp-scope — `docs/ROADMAP.md` is organised by sprint,
  not as skeleton / v1 / deferred. Sections open today: App Store
  readiness (2026-09-16), three "open follow-up" sections from the
  2026-09-16 review rounds, AI animal matching (rule-based version live),
  the launch sprint (deferred), donations (deferred).]
<!-- 2026-09-21: product and areas copied from CLAUDE.md by /update-stack;
     the build order is NOT written — /mvp-scope writes it. Paste again
     afterwards. -->

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
  this pull request's preview URL (CLAUDE.md, Preview) — without it the
  pull request is not ready for me; what else it carries, CLAUDE.md says.
- A `manual check` clause is listed in the body as "awaiting the owner's
  check on a device", with what to try and which TestFlight build. I check
  before merging; the thread does not report that item done. After review
  fixes, do not trigger a new build yourself — I ask for one when I want
  to look again.
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
- Anything outward-facing: pushing a release tag, deploys, DNS, third-party
  dashboards, production data.
- A schema or API change that is not reversible in one commit.
- A dependency that is not clearly better than the standard library.

## Memory
- Project memory stays in this project. What is about the repository — a
  pitfall, a template improvement, a battery miss — also goes into
  `docs/NOTES.md`, under the section CLAUDE.md names. Only the repo reaches
  the other products.
