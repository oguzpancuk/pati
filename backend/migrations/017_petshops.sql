-- Petshops on the map (owner, 2026-10-07: petshops are offered a free first
-- month that includes appearing on the map). A business listing, entered and
-- edited by hand in the admin panel; the public map only reads it.
--
-- The listing carries its own visibility window so the free month can run
-- out without anyone deleting the row: the map shows a listing only while
-- `starts_at <= now() < ends_at` (NULL = unbounded on that side) and it is
-- not hidden. Opening hours are free text ("Hafta içi 09:00–20:00, Pazar
-- kapalı"): shops write them every which way, and the map only prints them.
--
-- A new table and nothing else: no existing table changes, so reverting the
-- commit that added this file leaves at most an unused table behind
-- (`DROP TABLE petshops;` removes it). 001_init.sql has the same statements:
-- a fresh database gets the table from there, production from here. Both
-- survive a re-run.
CREATE TABLE IF NOT EXISTS petshops (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    address VARCHAR(300),
    phone VARCHAR(40),
    opening_hours VARCHAR(300),
    website_url VARCHAR(500),
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    hidden BOOLEAN NOT NULL DEFAULT false,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The map asks for its viewport with a planar envelope, like the care
-- markers (010_care_bbox_geometry.sql explains why not geography).
CREATE INDEX IF NOT EXISTS idx_petshops_location_geom
  ON petshops USING GIST ((location::geometry));
