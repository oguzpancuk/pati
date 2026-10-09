# ADR-0006: The health-record ad slot is never sold to veterinarians, and keeps its key

Status: accepted · Date: 2026-10-09

## Context

Ads shipped on 2026-08-18 with three slots: `food_popup`, `water_popup` and
`vet_health_record`, the last shown under the health-record and vaccine
dialogs on an animal's profile. The name, and the pilot plan in
`docs/pilot/`, assumed veterinary clinics would be that slot's first
customers.

They cannot be. Turkish law forbids veterinarians to advertise (Law 6343 on
veterinary practice and the veterinary chambers' professional rules), so
selling a clinic a banner in the app is off the table. The owner will sell
the slot to other advertisers, petshops first (2026-10-09). PR #18 already
took the word "veteriner" out of the admin panel's slot label, so nobody
choosing a slot sees it.

What is left is the key itself. It is written in many places: the `CHECK`
constraints on `advertisers.slot` and, from migration 017 of PR #18, on
`advertisers.slots`; every `advertisers` and `ad_events` row in that slot,
and `ad_serves`; the `slot` query parameter of `GET /ads`; and the slot
lists of the backend, admin, web and mobile. The iOS build in the App Store
sends `slot=vet_health_record`, so the server must accept that string for as
long as that build is in use.

## Decision

- **The slot is not sold to veterinarians or veterinary clinics**, whatever
  the campaign. The admin panel has no advertiser category, so this is a
  sales rule, recorded here and in `docs/NOTES.md`; it is not enforced in
  code.
- **The key `vet_health_record` stays.** It is an internal identifier that
  no user sees. Renaming it would need a migration over two constraints and
  three tables, plus a permanent alias for the installed iOS build, to buy a
  better name for developers only. The slot lists carry a comment pointing
  here instead.
- What people see calls it the health-record slot ("Sağlık kaydı").

## Consequences

- Anyone reading the key must read it as "health-record slot". Reports,
  labels and documents never present it as a veterinary placement.
- The pilot plan that offered clinics "in-app visibility" was retired with
  this decision (`docs/NOTES.md`, 2026-10-09).
- If the key is ever renamed after all, the old string has to stay accepted
  by the API until no build that sends it is in use.
