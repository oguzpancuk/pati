-- Quoting a message (ROADMAP P7 item 7, owner finding 2026-09-08): a reply
-- may point at an earlier message of the same conversation; clients render
-- the quoted excerpt above the bubble and jump to the source on tap.
--
-- The messages table is 006's (production has it), so the column is added
-- here rather than in 006's CREATE TABLE body, which would do nothing on an
-- existing table. Every statement survives being re-run: migrate.js applies
-- this file on every deploy.
--
-- The source stays quotable after a soft delete (the row remains; clients
-- show "Bu mesaj silindi" in the quote). A hard delete of the source —
-- nothing in the app does one today — leaves the reply as a plain message
-- rather than failing.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER
    REFERENCES messages(id) ON DELETE SET NULL;

-- The FK's own lookup (a hard delete of a source scans the referencing
-- side); replies are rare next to plain messages, hence partial.
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages (reply_to_id)
    WHERE reply_to_id IS NOT NULL;
