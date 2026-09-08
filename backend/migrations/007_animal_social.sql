-- Animal profile social layer (ROADMAP P6, track C, owner batch of
-- 2026-09-08): photo likes, followers, the match-hit log, the in-app
-- notification inbox, device tokens for a later push sender, and the
-- animal badges. Every statement survives a re-run: migrate.js applies
-- every file on every deploy. 006 belongs to another track of the same
-- batch; the numbers are fixed up front so the tracks never collide.

-- One like per user per photo; the count is a COUNT over this table (the
-- profile lists a few photos, the join is cheap and never drifts).
CREATE TABLE IF NOT EXISTS animal_photo_likes (
    photo_id INTEGER NOT NULL REFERENCES animal_photos(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (photo_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_animal_photo_likes_user ON animal_photo_likes (user_id);

-- "Takip et": no condition, toggles. Followers may only like photos; they
-- receive the animal's notifications. Carer rights live in
-- user_animal_care (unchanged table, tightened rules in the controller).
CREATE TABLE IF NOT EXISTS animal_followers (
    animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (animal_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_animal_followers_user ON animal_followers (user_id);

-- Every time a PHOTO names this animal: `register` rows come from the
-- add-animal match step (similarity = the model's photo verdict, or
-- 'unchecked' when photos were sent and the model gave no answer — the
-- field-only form logs nothing), `care` rows from the "bakım ver" step.
-- A badge source (counted per distinct user), and the evidence a sighting
-- from the add-animal flow stands on (see reportSighting: a register hit
-- within fifteen minutes lets a non-carer confirm "that's the one"). A
-- hit is spent, never deleted: the confirm stamps used_at on ALL of the
-- user's fresh register rows (one photo confirms one animal), and the
-- rows stay as the badge's evidence. Rows are bounded by the match rate
-- limit; nothing prunes them yet.
CREATE TABLE IF NOT EXISTS animal_match_attempts (
    id SERIAL PRIMARY KEY,
    animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('register', 'care')),
    similarity VARCHAR(10),
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Added after the table's first deploy; the body above carries it for a
-- database built from scratch, this line for one that already has the table.
ALTER TABLE animal_match_attempts ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_animal_match_attempts_animal
    ON animal_match_attempts (animal_id, kind);
CREATE INDEX IF NOT EXISTS idx_animal_match_attempts_recent
    ON animal_match_attempts (user_id, animal_id, created_at DESC);

-- The in-app inbox. `payload` carries what the row needs to render without
-- a join that may later fail (the comment body excerpt, the record's
-- description, the actor's name at the time). animal_id/actor_id stay as
-- foreign keys for navigation; the actor may be anonymised later, so the
-- reference is nullable.
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(30) NOT NULL,
    animal_id INTEGER REFERENCES animals(id) ON DELETE CASCADE,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_inbox ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;

-- Where a push would go. Registered by the clients now; no sender exists
-- yet (APNs/FCM is a later batch), the rows just wait. A token belongs to
-- one user at a time: re-registering after a sign-out moves it. Open
-- point for that batch: any signed-in user can claim any token string
-- (the server cannot verify ownership of an APNs/FCM token), so a sender
-- must treat a moved token as the NEW user's device and the clients must
-- delete theirs on sign-out — or the sender verifies tokens with the
-- push service before its first send.
CREATE TABLE IF NOT EXISTS device_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(10) NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens (user_id);

-- Badges an ANIMAL earns (item 5 of the batch, data model only): one row
-- per tier reached, permanent like the user badges. Keys and thresholds
-- live in backend/src/utils/badges.js (ANIMAL_BADGES); the row keeps the
-- key, so a renamed label needs no migration.
CREATE TABLE IF NOT EXISTS animal_badges (
    animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    badge_key VARCHAR(40) NOT NULL,
    tier VARCHAR(10) NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold', 'diamond')),
    earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (animal_id, badge_key, tier)
);
