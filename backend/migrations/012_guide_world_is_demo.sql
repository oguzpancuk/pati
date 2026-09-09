-- The guide world is a bot world too, and it predates the flag.
--
-- `seed-guides.js` has been putting "… · pati rehberi" accounts, their
-- animals and their food/water drops on production since long before
-- `is_demo` existed, and `DEMO_GUIDE_REFRESH=1` adds fresh drops every hour.
-- Nothing marked them, so with the showcase switched off a reader still got
-- guide drops on the map and guide accounts in search — and, worse, the
-- guides held real leaderboard ranks, which is exactly what the owner ruled
-- out ("botlar sıralamada gözükmesin", 2026-09-09).
--
-- Both bot worlds sign their accounts the same way: an `@pati.demo` address,
-- a domain that cannot receive mail and that no person can register. That is
-- the handle this backfill uses.
--
-- One-shot, claimed through schema_backfills: re-running it every deploy
-- would undo a deliberate `is_demo = false` on a row somebody rescued, and
-- the scan is pointless once it has run. The hourly guide refresh flags the
-- rows it inserts inline rather than re-running these statements, so nothing
-- puts the flag back either (review finding). Every statement here survives a
-- re-run anyway — the claim is a no-op the second time and the block returns
-- before touching a row.
DO $$
DECLARE
  claimed INTEGER;
BEGIN
  INSERT INTO schema_backfills (name) VALUES ('012_guide_world_is_demo') ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS claimed = ROW_COUNT;
  IF claimed = 0 THEN
    RETURN;
  END IF;

  UPDATE users SET is_demo = true WHERE email LIKE '%@pati.demo' AND NOT is_demo;

  -- Everything those accounts made, each row claimed by its AUTHOR — never
  -- by the animal it hangs off. A real volunteer can earn carer rights on a
  -- guide animal and record an injury or upload a photo there; that row is
  -- theirs (review finding).
  UPDATE animals a SET is_demo = true
   FROM users u WHERE u.id = a.created_by AND u.is_demo AND NOT a.is_demo;

  UPDATE animal_photos p SET is_demo = true
   FROM users u WHERE u.id = p.uploaded_by AND u.is_demo AND NOT p.is_demo;

  UPDATE care_actions c SET is_demo = true
   FROM users u WHERE u.id = c.user_id AND u.is_demo AND NOT c.is_demo;

  UPDATE animal_comments c SET is_demo = true
   FROM users u WHERE u.id = c.user_id AND u.is_demo AND NOT c.is_demo;

  UPDATE health_records h SET is_demo = true
   FROM users u WHERE u.id = h.recorded_by AND u.is_demo AND NOT h.is_demo;

  UPDATE vaccinations v SET is_demo = true
   FROM users u WHERE u.id = v.recorded_by AND u.is_demo AND NOT v.is_demo;

  UPDATE user_animal_care uac SET is_demo = true
   FROM users u WHERE u.id = uac.user_id AND u.is_demo AND NOT uac.is_demo;

  UPDATE animal_followers af SET is_demo = true
   FROM users u WHERE u.id = af.user_id AND u.is_demo AND NOT af.is_demo;

  -- Both sides bots. A friendship between a guide and a real person stays
  -- real, like every other row claimed by its author.
  UPDATE friendships f SET is_demo = true
   FROM users a, users b
   WHERE a.id = f.requester_id AND b.id = f.addressee_id
     AND a.is_demo AND b.is_demo AND NOT f.is_demo;
END $$;
