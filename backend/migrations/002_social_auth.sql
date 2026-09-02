-- Apple/Google sign-in (S7), September 2026.
--
-- 001_init.sql already describes all of this for a database built from
-- scratch. This file exists because production is never rebuilt and
-- `CREATE TABLE IF NOT EXISTS` cannot alter an existing `users` table — so
-- without it a deploy would leave the column the sign-in code reads missing,
-- and every provider sign-in would 500 the moment the credentials were set.
--
-- Every statement is idempotent: scripts/migrate.js applies every .sql file
-- here on every deploy (fly.toml release_command), so this must survive
-- being run again and again. That is also why there is no data backfill: a
-- one-off UPDATE becomes a standing rule when it runs on every deploy, and
-- would quietly undo any later correction to the rows it touches.

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS user_identities (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(10) NOT NULL CHECK (provider IN ('apple', 'google')),
    subject VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, subject)
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user ON user_identities (user_id);

CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));
