-- Password reset by 6-digit code, September 2026.
--
-- The e-mail verification flow (ADR-0004) pointed at the one thing a
-- signed-out person can prove: that they can read the address's mail. Same
-- six digits, same per-row salt, same attempt counter — so the table is
-- email_verifications' twin rather than a second design.
--
-- 001_init.sql describes the same table for a database built from scratch;
-- this file exists because production is never rebuilt and it is the only
-- place the table can come from there. Every statement is idempotent —
-- scripts/migrate.js applies every file on every deploy — and there is
-- nothing to backfill: an account with no row simply has no code
-- outstanding, which is the correct starting state for every account.

CREATE TABLE IF NOT EXISTS password_resets (
    -- One outstanding code per account, like email_verifications: asking for
    -- a new code REPLACES the old one instead of leaving a second guessable
    -- secret alive.
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    -- Only the salted hash is stored: the database must not be able to reset
    -- anyone's password.
    code_hash CHAR(64) NOT NULL,
    salt CHAR(32) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    -- Counted before every comparison, so five wrong guesses retire the code
    -- and a sixth cannot share an attempt with them.
    attempts INTEGER NOT NULL DEFAULT 0,
    -- Also the send cooldown: utils/passwordReset.js refuses to replace a row
    -- younger than a minute, which is what stops one address being mailed a
    -- code per request.
    last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
