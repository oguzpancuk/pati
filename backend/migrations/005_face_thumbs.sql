-- Profile pictures cut from the animals' own photos (ROADMAP P3, owner
-- decision 2026-09-07). 001_init.sql carries the same columns for a
-- database built from scratch; this file exists because production is
-- never rebuilt. Every statement is idempotent — migrate.js re-applies it
-- on every deploy.
--
-- thumb_url: the square cut-out around the face, a file next to the photo;
-- face_score: how clearly the face shows (0–1), NULL when the model found
-- no face or did not answer — the animal's picture is its photo with the
-- highest score, and the SVG avatar stays when there is none;
-- face_box: what the model returned, kept for re-cutting without a call.

ALTER TABLE animal_photos ADD COLUMN IF NOT EXISTS thumb_url TEXT;
ALTER TABLE animal_photos ADD COLUMN IF NOT EXISTS face_score REAL;
ALTER TABLE animal_photos ADD COLUMN IF NOT EXISTS face_box JSONB;

-- The cover-photo lateral join runs once per listed animal; without this
-- index each one was a sequential scan of animal_photos (review finding).
CREATE INDEX IF NOT EXISTS idx_animal_photos_animal ON animal_photos (animal_id, face_score DESC NULLS LAST, created_at);
