---
name: simulator-view
description: Open the pati app on a specific screen in the iOS simulator, take a screenshot, and verify it visually. Use when asked to "check the simulator", "show that screen". Only the Ops session on the Mac.
---

# Simulator view

Prerequisites: Metro (`localhost:8081`) and the backend (`localhost:3000`)
running, an iPhone simulator booted (`xcrun simctl list devices booted`).
Otherwise run `/start`.

Screens open via deep links (`mobile/src/navigation/index.tsx` → `linking`):
`pati://map`, `pati://animals`, `pati://profile`, `pati://add-animal`,
`pati://animal/<id>`, `pati://animal/<id>?matchReview=true`, `pati://user/<id>`,
`pati://leaderboard`, `pati://friends`, `pati://comments`.

1. If there is no session: `mobile/scripts/simulator-login.sh <email> <password>`
   (local admin: `oguzpancuk@gmail.com` — ask the user for the password, never
   write it down).
2. `mobile/scripts/simulator-goto.sh pati://<path> "$CLAUDE_JOB_DIR/tmp/screen.png" 8`
3. Open the PNG with `Read` and judge it BY EYE: clipping, drift, blank screen,
   wrong text. Visual bugs escape the tests in this project — never say "fine"
   without looking.
4. If flow verification is needed (animation/pagination), don't hack temporary
   patches; produce the required data via API/DB and reopen the screen.

Note: deep links always open on top of the tab stack (a back button exists).
You cannot scroll; for below-the-fold sections either ask the user to look or
arrange the data so it appears on top.
