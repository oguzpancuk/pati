/**
 * The basemap's credit, in one place because both clients and every map
 * surface owe the same sentence.
 *
 * The tiles come from OpenFreeMap's planet build of OpenMapTiles, whose data
 * is OpenStreetMap's. ODbL requires the credit to be discoverable wherever
 * the data is shown; the owner decided (2026-09-11, demo note 15) that it
 * leaves the map itself and lives one level deeper, always visible in the
 * settings sheet rather than behind a further tap. The style JSON carries no
 * `attribution` field of its own — it is generated from OpenFreeMap's liberty
 * style by shared/mapstyle/build.mjs — so this string, not the renderer, is
 * what discharges it.
 *
 * web reaches it through the `@mobile/*` path alias, the way it already
 * imports the taxonomy and the care markers.
 */
export const MAP_ATTRIBUTION = '© OpenStreetMap katkıda bulunanları · OpenFreeMap';

/** The label the credit sits under in the settings sheet. */
export const MAP_ATTRIBUTION_LABEL = 'Harita verisi';
