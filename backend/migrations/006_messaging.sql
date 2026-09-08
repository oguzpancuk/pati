-- User-to-user messaging (ROADMAP P6 item 4, owner decisions 2026-09-08):
-- friends message one-to-one; a user creates a named group from their own
-- friends; admins (the creator and whoever an admin promotes) rename, remove
-- members and delete any message; a member leaves. Delivery is polling.
--
-- Every statement survives being re-run: migrate.js applies this file on
-- every deploy. These tables are new, so they live here alone — nothing in
-- 001_init.sql has to change for a database built from scratch, and the
-- content_reports constraint below replaces the one 001 creates.

CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('direct', 'group')),
    -- Groups only; a direct conversation is titled by the other member.
    name VARCHAR(80),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    -- Direct conversations: "<lower id>:<higher id>", so the unique index
    -- below makes "start a DM" idempotent for both sides. NULL for groups.
    direct_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Denormalised for the inbox ordering; NULL until the first message.
    last_message_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_direct_key
    ON conversations (direct_key) WHERE direct_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- The unread count is "messages after this from someone else"; NULL
    -- means never opened, so everything counts.
    last_read_at TIMESTAMPTZ,
    PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON conversation_members (user_id);

CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    -- Kept nullable: an account deletion must not erase what others said in
    -- reply, and a report on the message still needs the row.
    sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Soft delete: the row stays (the report queue may point at it, and the
    -- moderator must be able to read what was reported); clients see a
    -- placeholder. deleted_by tells "the sender took it back" from "an
    -- admin removed it".
    deleted_at TIMESTAMPTZ,
    deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Polling reads "messages after id N in this conversation"; the inbox
-- reads the last one per conversation. Both walk this index.
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, id);

-- Messages are reportable through content_reports. The target list is a
-- CHECK constraint inside 001's CREATE TABLE, which cannot be altered in
-- place: drop and re-add (both idempotent). Postgres names the inline
-- constraint <table>_<column>_check, which is what 001 produced.
ALTER TABLE content_reports DROP CONSTRAINT IF EXISTS content_reports_target_type_check;
ALTER TABLE content_reports ADD CONSTRAINT content_reports_target_type_check
    CHECK (target_type IN ('animal', 'comment', 'care_action', 'user', 'message'));
