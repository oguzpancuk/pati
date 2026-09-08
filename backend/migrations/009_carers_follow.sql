-- Carers are followers (ROADMAP P7, track C′, item 2): from this batch on
-- every path that inserts a user_animal_care row inserts the follower row
-- too (animal.controller.js addCarer). This backfills the animals that
-- exist already — a registrant, or someone who came in through the
-- add-animal door, would otherwise show "takip et" next to "bakım
-- veriyorsun" until they pressed it. No notification is written: nobody
-- "started caring" now. Every statement survives a re-run: migrate.js
-- applies every file on every deploy. 008 belongs to another track of
-- the same batch.
INSERT INTO animal_followers (animal_id, user_id, created_at)
SELECT c.animal_id, c.user_id, c.created_at
FROM user_animal_care c
ON CONFLICT DO NOTHING;

-- The follower counts moved, and the badge sync only runs on events: put
-- the `followed` tiers those counts already reach on record, so a profile
-- read before the next event shows the same ladder the sync would write.
-- Thresholds mirror COUNT_THRESHOLDS in backend/src/utils/badges.js (a
-- one-off backfill, not a second source of truth).
INSERT INTO animal_badges (animal_id, badge_key, tier)
SELECT f.animal_id, 'followed', t.tier
FROM (SELECT animal_id, count(*) AS n FROM animal_followers GROUP BY animal_id) f
JOIN (VALUES ('bronze', 1), ('silver', 5), ('gold', 20), ('diamond', 100)) AS t(tier, min_count)
  ON f.n >= t.min_count
ON CONFLICT DO NOTHING;
