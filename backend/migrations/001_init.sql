-- pati - initial database schema
-- Enable the PostGIS extension (for geo queries)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'vet', 'admin')),
    avatar_url TEXT,
    -- Keys of up to 3 badges featured on the profile (e.g. "breed:Tekir").
    -- Badges are derived from computed data, so only the selection is stored.
    featured_badges JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Snapshot of the last computed rank and points, to show "previous rank /
    -- new rank" in the badge-award popup. The rank also shifts as other people
    -- earn points, so it cannot be reconstructed after the fact.
    last_rank INTEGER,
    last_points INTEGER NOT NULL DEFAULT 0,
    -- Accounts suspended from the admin panel. We suspend instead of delete so
    -- the care actions and comments the user left (data others can see) are
    -- not lost. When set, the API returns 403.
    suspended_at TIMESTAMPTZ,
    suspended_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Animals
CREATE TABLE IF NOT EXISTS animals (
    id SERIAL PRIMARY KEY,
    species VARCHAR(10) NOT NULL CHECK (species IN ('cat', 'dog')),
    name VARCHAR(120),
    color VARCHAR(120),
    -- Breed/pattern. The app offers a fixed list per species (see
    -- src/utils/taxonomy.js), but picking "Diğer" (other) puts the user's free
    -- text here; hence no CHECK, and the field is as wide as color.
    breed VARCHAR(120),
    markings TEXT,
    -- Where the animal was last seen. Updated whenever someone reports a
    -- sighting via "this animal is already registered" — it holds the current
    -- location, not a fixed registration spot.
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    location_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_animals_location ON animals USING GIST (location);

-- Animal photos
CREATE TABLE IF NOT EXISTS animal_photos (
    id SERIAL PRIMARY KEY,
    animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    uploaded_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Health records: ILLNESS and INJURY only.
-- Vaccinations live in their own table: a vaccine has no "recovered" state,
-- it has a booster date, and "who administered it" is a different question
-- (municipality/vet). One shared table would model both records poorly.
-- Follow-up state is not a separate column; the "treatment not started /
-- started" distinction is derived from whether a comment is attached to the
-- record (see animal_comments). Only "recovered" is stored here, because it
-- is the one permanent marker.
CREATE TABLE IF NOT EXISTS health_records (
    id SERIAL PRIMARY KEY,
    animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    record_type VARCHAR(20) NOT NULL CHECK (record_type IN ('illness', 'injury')),
    -- Title picked from the list, or the user's free text if "Diğer" (other) was picked.
    description TEXT NOT NULL,
    vet_verified BOOLEAN NOT NULL DEFAULT false,
    recorded_by INTEGER NOT NULL REFERENCES users(id),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    recovered_at TIMESTAMPTZ,
    recovered_by INTEGER REFERENCES users(id)
);

-- Vaccination and antiparasitic treatment records.
-- `vaccine_type` is a value from the list, or free text if "Diğer" was picked.
-- `next_due_at` is NULL when unknown: nobody can guarantee a stray's next
-- dose, and making it required would manufacture fake data.
CREATE TABLE IF NOT EXISTS vaccinations (
    id SERIAL PRIMARY KEY,
    animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    vaccine_type VARCHAR(120) NOT NULL,
    note TEXT,
    -- Marked when administered by the municipality/a vet; it must stand apart
    -- from user claims for badges and trustworthiness.
    vet_verified BOOLEAN NOT NULL DEFAULT false,
    administered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    next_due_at TIMESTAMPTZ,
    recorded_by INTEGER NOT NULL REFERENCES users(id),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vaccinations_animal ON vaccinations (animal_id, administered_at DESC);
CREATE INDEX IF NOT EXISTS idx_vaccinations_recorder ON vaccinations (recorded_by);

-- The chat on an animal's profile. A comment can optionally attach to a
-- health record, so clicking a record lists only its own comments.
-- Vaccination records have NO chat: a vaccine is a one-off, verifiable event
-- with no "is it healing, how is it going" follow-up. When the comment field
-- was open it sat empty and got confused with health records.
CREATE TABLE IF NOT EXISTS animal_comments (
    id SERIAL PRIMARY KEY,
    animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    health_record_id INTEGER REFERENCES health_records(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_animal_comments_animal ON animal_comments (animal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_animal_comments_health_record ON animal_comments (health_record_id);

-- The care (follow) relationship between a user and an animal
CREATE TABLE IF NOT EXISTS user_animal_care (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, animal_id)
);

-- Care points: the exact locations where users left food/water.
-- There is no region/administrative-boundary concept; the map is colored as a
-- heatmap by the density of these points, and "is there care near me" is
-- computed from them (radius and time window live in care.controller.js:
-- 100 m, food 4 h / water 6 h).
CREATE TABLE IF NOT EXISTS care_actions (
    id SERIAL PRIMARY KEY,
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('food', 'water')),
    photo_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_care_actions_location ON care_actions USING GIST (location);

-- Friend requests/relationships. If the other side also sends a request while
-- a row is 'pending', the application layer auto-accepts it (see
-- friendship.controller.js). An accepted relationship is queryable from both
-- directions; requester/addressee only records who initiated.
CREATE TABLE IF NOT EXISTS friendships (
    id SERIAL PRIMARY KEY,
    requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at TIMESTAMPTZ,
    CHECK (requester_id <> addressee_id),
    UNIQUE (requester_id, addressee_id)
);

-- The moment a badge was earned. The badge itself is derived data (see
-- utils/badges.js), but showing the "you earned a new badge" popup requires
-- storing when it was first earned and the points/rank/level at that moment —
-- that information cannot be recomputed later.
CREATE TABLE IF NOT EXISTS user_badge_awards (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_key VARCHAR(160) NOT NULL,
    tier VARCHAR(20) NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold', 'diamond')),
    label VARCHAR(200) NOT NULL,
    points_awarded INTEGER NOT NULL DEFAULT 0,
    points_before INTEGER,
    points_after INTEGER,
    rank_before INTEGER,
    rank_after INTEGER,
    level_before INTEGER,
    level_after INTEGER,
    -- Set after the popup is shown; NULL means "not shown yet".
    seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, badge_key, tier)
);

CREATE INDEX IF NOT EXISTS idx_user_badge_awards_unseen
    ON user_badge_awards (user_id, created_at DESC) WHERE seen_at IS NULL;

-- For listing a user's recent comments on their profile.
CREATE INDEX IF NOT EXISTS idx_animal_comments_user ON animal_comments (user_id, created_at DESC);

-- A record of every change made from the admin panel. In a panel where data
-- can be manipulated, "who deleted this animal?" is unanswerable without it.
-- target_type/target_id are free-form: no foreign key, so the schema doesn't
-- change when a new entity type appears (the trail must survive even if the
-- record is deleted).
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(60) NOT NULL,
    target_type VARCHAR(40) NOT NULL,
    target_id INTEGER,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log (target_type, target_id);

-- Advertisers. Our own simple ad server instead of an off-the-shelf network
-- (AdMob etc.): brands are entered by hand in the admin panel and placements
-- are very specific (a food brand in the food popup, a water brand in the
-- water popup, a vet clinic when adding a health record).
CREATE TABLE IF NOT EXISTS advertisers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    slot VARCHAR(30) NOT NULL CHECK (slot IN ('food_popup', 'water_popup', 'vet_health_record')),
    headline VARCHAR(120),
    body VARCHAR(200),
    image_url TEXT,
    target_url TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    -- Campaign date range; NULL = unbounded.
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_advertisers_slot ON advertisers (slot, sort_order, id);

-- Impression and click records. Required to tell brands "this many
-- impressions, this many clicks" — without this measurement ads can't be sold.
--
-- slot is copied (denormalized) from advertisers: historical reports stay
-- intact even if the advertiser is deleted, and the rotation counter can be
-- computed per placement with a single index.
CREATE TABLE IF NOT EXISTS ad_events (
    id SERIAL PRIMARY KEY,
    advertiser_id INTEGER REFERENCES advertisers(id) ON DELETE SET NULL,
    slot VARCHAR(30) NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    type VARCHAR(12) NOT NULL CHECK (type IN ('impression', 'click')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rotation order is derived from the user's impression count in that
-- placement, so this index sits on the hot path (every popup open).
CREATE INDEX IF NOT EXISTS idx_ad_events_rotation ON ad_events (user_id, slot, type);
CREATE INDEX IF NOT EXISTS idx_ad_events_report ON ad_events (advertiser_id, type);
