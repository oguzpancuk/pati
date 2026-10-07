-- Location-targeted ads. Until now every live ad in a slot rotated to every
-- user in the country; a petshop pays to reach the people near its shop. An
-- ad may now carry a target point and a radius: getNextAd serves it only to
-- a viewer whose location falls inside that circle, and never to one whose
-- location is unknown. An ad without a target stays nationwide, which is
-- what every existing row becomes on the deploy that adds this — so no live
-- campaign changes reach.
--
-- 001_init.sql mirrors the two columns inside its CREATE TABLE body for a
-- database built from scratch; on production that body is a no-op, so the
-- ALTERs below are what add them there. The constraint and the index name
-- the new columns (or sit on a table 001 already created), so they live in
-- this file only (CLAUDE.md, v28). Every statement survives a re-run.
--
-- Reversible in one commit: drop the constraint, the index and the two
-- columns; nothing else reads them.
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS target_location GEOGRAPHY(POINT, 4326);
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS target_radius_m INTEGER;

-- A point without a radius (or the reverse) would be an ad nobody can reason
-- about; the bounds are the admin form's (100 m to 200 km).
ALTER TABLE advertisers DROP CONSTRAINT IF EXISTS advertisers_target_check;
ALTER TABLE advertisers ADD CONSTRAINT advertisers_target_check CHECK (
  (target_location IS NULL AND target_radius_m IS NULL)
  OR (target_location IS NOT NULL AND target_radius_m BETWEEN 100 AND 200000)
);

-- A viewer who sends no location is placed at their most recent care drop
-- (ad.controller.js). care_actions had no index on user_id at all, so that
-- lookup — on every popup open — would otherwise scan the table.
CREATE INDEX IF NOT EXISTS idx_care_actions_user_recent
  ON care_actions (user_id, created_at DESC);
