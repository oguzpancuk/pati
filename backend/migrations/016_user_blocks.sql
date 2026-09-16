-- Blocking a user (App Store guideline 1.2: an app with user-generated
-- content must let people block abusive users; ROADMAP "App Store
-- readiness", R3). One row per (blocker, blocked); the block's effects are
-- application logic (user.controller.js blockUser and the readers that
-- consult the table), so this file only carries the table.
--
-- 001_init.sql has the same statements: a fresh database gets the table from
-- there, and production — never rebuilt — gets it from here. Both survive a
-- re-run.
CREATE TABLE IF NOT EXISTS user_blocks (
    blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);
-- "Who blocked me" is asked as often as "whom did I block" (friend requests
-- and search check both directions); the primary key only serves the latter.
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks (blocked_id);
