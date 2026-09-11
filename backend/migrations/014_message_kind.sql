-- Group events are messages (owner decision, 2026-09-11, demo note 12):
-- "being added to a group should show up like a message". A system row in
-- the group itself — rather than a new notification kind — means the unread
-- count, the messages tab badge and the inbox ordering all follow from the
-- messages table instead of needing three separate paths.
--
-- The messages table is 006's (production has it), so the column is added
-- here rather than in 006's CREATE TABLE body, which would do nothing on an
-- existing table. Every statement survives being re-run: migrate.js applies
-- this file on every deploy.
--
-- The default is 'user', so every row that already exists stays a person's
-- message and no read path changes meaning on the deploy that adds this.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'user';

-- The CHECK lives outside the CREATE TABLE body, so it is re-added rather
-- than altered in place (ALTER TABLE cannot change a constraint); both
-- statements are no-ops on a second run.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_kind_check;
ALTER TABLE messages ADD CONSTRAINT messages_kind_check CHECK (kind IN ('user', 'system'));
