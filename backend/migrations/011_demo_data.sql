-- The showcase (demo) world: bot users, their animals and everything they
-- do, so someone opening the app sees a neighbourhood in use instead of an
-- empty map (owner, 2026-09-09). Every demo row carries `is_demo`, and each
-- person's own `users.show_demo` hides them all at once — nobody may ever
-- see half a demo world, so the flag lives on every table a read path
-- touches.
--
-- Re-runnable: ADD COLUMN IF NOT EXISTS on each table, partial indexes for
-- the "hide them" queries (a partial index on the demo rows is small and is
-- what the planner wants when the filter is `NOT is_demo`).
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE animals ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE animal_photos ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE care_actions ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE animal_comments ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE health_records ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE vaccinations ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE friendships ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE user_animal_care ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE animal_followers ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_demo ON users (id) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_animals_demo ON animals (id) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_care_actions_demo ON care_actions (id) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_animal_comments_demo ON animal_comments (id) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_conversations_demo ON conversations (id) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_messages_demo ON messages (id) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_notifications_demo ON notifications (id) WHERE is_demo;

-- Whose choice it is: each person decides whether they see the showcase
-- world (owner, 2026-09-09 — it started as one global admin switch and
-- moved onto every profile). On by default: someone opening a fresh app
-- should find a neighbourhood in use, and turn it off when they don't
-- need the tour any more.
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_demo BOOLEAN NOT NULL DEFAULT true;
