-- E-mail verification on registration (ADR-0004), September 2026.
--
-- 001_init.sql describes the same column and table for a database built
-- from scratch; this file exists because production is never rebuilt and
-- CREATE TABLE IF NOT EXISTS cannot add a column to the existing users table.
--
-- Every statement is idempotent — scripts/migrate.js applies every file on
-- every deploy. There is deliberately no backfill: the column's default
-- (false) IS the grandfathering rule. Accounts that registered before this
-- existed keep working, and stay unproven (email_verified false) until they
-- verify — nothing here has to be re-asserted on the next deploy.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_pending BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS email_verifications (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    code_hash CHAR(64) NOT NULL,
    salt CHAR(32) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
