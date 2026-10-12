-- The showcase (demo) world is off by default (owner, 2026-10-12): the app is
-- live and has real users, so the map opens on what people actually did, and
-- the tour is one tap away in the profile ("demo verileri").
--
-- Two halves. The column default is what every new sign-up gets; 001 mirrors
-- it for a database built from scratch, where this ALTER is a no-op. The
-- UPDATE switches it off for everyone who already has an account — on
-- production that is every person, since true was the default and nothing
-- told a deliberate "on" apart from an untouched one.
--
-- The UPDATE is one-shot, claimed through schema_backfills (as 012 is):
-- re-running it on every deploy would switch the showcase off again for
-- anyone who turned it back on after this ran. Every statement survives a
-- re-run — the claim is a no-op the second time and the block returns
-- before touching a row.
--
-- Reversing it: `ALTER ... SET DEFAULT true` restores the default; there is
-- no record of who had it on before, so the UPDATE can only be undone for
-- everyone at once.
ALTER TABLE users ALTER COLUMN show_demo SET DEFAULT false;

DO $$
DECLARE
  claimed INTEGER;
BEGIN
  INSERT INTO schema_backfills (name) VALUES ('019_show_demo_default_off') ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS claimed = ROW_COUNT;
  IF claimed = 0 THEN
    RETURN;
  END IF;

  UPDATE users SET show_demo = false WHERE show_demo;
END $$;
