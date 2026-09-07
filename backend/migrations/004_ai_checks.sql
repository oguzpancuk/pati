-- Photo checks through a hosted vision model (ADR-0005), September 2026.
--
-- 001_init.sql carries the same column for a database built from scratch;
-- this file exists because production is never rebuilt and CREATE TABLE IF
-- NOT EXISTS cannot add a column to the existing care_actions table.
--
-- The column records what the model said about the photo at upload time
-- (verdict, subject, reason, model, milliseconds) — the raw material for
-- calibrating the check later and for the moderation queue to show why a
-- photo passed. NULL means the record predates the check or the check was
-- unavailable when it was made. Idempotent: migrate.js re-applies it on
-- every deploy.

ALTER TABLE care_actions ADD COLUMN IF NOT EXISTS ai_check JSONB;

-- The id of the photoToken a record was confirmed with; the unique index is
-- what makes a token single-use (NULL for direct uploads and older rows —
-- a unique index ignores NULLs).
ALTER TABLE care_actions ADD COLUMN IF NOT EXISTS photo_token_jti TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_care_actions_photo_token_jti ON care_actions (photo_token_jti);
