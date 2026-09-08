-- The map is worldwide since 2026-09-09 and asks for its viewport. A
-- geography envelope has great-circle edges, so past roughly 150° of
-- longitude it stops covering its own interior and the query answered
-- with zero rows (verified on the dev database: the world box returned 0
-- of 7771 records). The viewport filter therefore compares planar
-- geometries; this index is what keeps that comparison off a seq scan.
-- The radius queries (ST_DWithin, "care within 100 m") stay on the
-- geography column and its own GIST index — meters must stay meters.
CREATE INDEX IF NOT EXISTS idx_care_actions_location_geom
  ON care_actions USING GIST ((location::geometry));
