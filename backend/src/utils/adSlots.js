/**
 * Where an ad may appear, and the admin form's choice of them. One ad can
 * run in several slots (owner, 2026-10-09); `advertisers.slots` holds the
 * list and `advertisers.slot` its first entry (017_ad_targeting.sql says
 * why both). Kept apart from the controllers so the parser can be pinned
 * without a database (test/adSlots.test.js).
 */

// The same three values are the CHECK constraints in 001 and 017.
const SLOTS = ['food_popup', 'water_popup', 'vet_health_record'];

/** The SQL for an ad row's slot list, for rows that predate `slots`. */
const AD_SLOTS_SQL = 'COALESCE(slots, ARRAY[slot])';

/**
 * The form's slots. `slots` (a list) wins over the single `slot` older
 * callers send; both absent means "not sent", which an edit reads as
 * "leave as is". Duplicates collapse and the order is SLOTS', so the
 * first entry — what `advertisers.slot` stores — does not depend on the
 * order of the checkboxes.
 *   -> { slots: undefined } | { slots: [...] } | { error }
 */
function parseAdSlots({ slots, slot }) {
  if (slots === undefined && slot === undefined) return { slots: undefined };
  const list = slots !== undefined ? slots : [slot];
  if (!Array.isArray(list) || list.length === 0) {
    return { error: 'En az bir reklam yerleşimi seçin' };
  }
  if (!list.every((s) => SLOTS.includes(s))) return { error: 'Geçersiz reklam yerleşimi' };
  return { slots: SLOTS.filter((s) => list.includes(s)) };
}

module.exports = { SLOTS, AD_SLOTS_SQL, parseAdSlots };
