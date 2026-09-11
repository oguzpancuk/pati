-- Badges count what you did, not how many days running you did it (owner,
-- 2026-09-11). The three care badges keep their labels and their meaning to
-- the reader; what changes is the rule behind them and therefore the key,
-- because `streak:` on a count is the kind of untrue name this codebase keeps
-- having to correct. The clients group badges by that prefix.
--
-- Only the RENAME is here. Deciding which tiers the new ladders justify is
-- application logic, not SQL — scripts/recompute-badges.js does that, and is
-- re-runnable. This file is too: a second run matches nothing.
--
-- 001_init.sql describes no badge keys, so there is nothing to mirror.

UPDATE user_badge_awards
   SET badge_key = 'care:' || split_part(badge_key, ':', 2)
 WHERE badge_key IN ('streak:feeder', 'streak:water', 'streak:registrar');

-- featured_badges is a jsonb array of keys the reader chose to show. Rebuilt
-- element by element so a key we do not know about is carried over untouched.
UPDATE users
   SET featured_badges = (
     SELECT jsonb_agg(
              CASE WHEN element #>> '{}' LIKE 'streak:%'
                   THEN to_jsonb('care:' || split_part(element #>> '{}', ':', 2))
                   ELSE element
              END
            )
       FROM jsonb_array_elements(users.featured_badges) AS element
   )
 WHERE featured_badges IS NOT NULL
   AND featured_badges::text LIKE '%streak:%';
