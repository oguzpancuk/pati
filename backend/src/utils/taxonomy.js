/**
 * The app's shared taxonomy: pattern, color, illness, injury, vaccine lists.
 * List VALUES are product content and stay Turkish.
 *
 * This is the source of truth. `mobile/src/taxonomy.ts` is an exact copy —
 * the two files must stay in sync (see docs/NOTES.md). It also lives
 * server-side because validation can't be left to the client: someone hitting
 * the API directly must not be able to write values outside the list.
 *
 * ## Why "pattern", not "breed"
 * Turkish street cats aren't purebred; they're "domestic shorthair" and their
 * folk names (tekir, sarman, smokin) describe **coat patterns**, not breeds.
 * Dogs are mostly mixed too — "Kangal melezi", not "Kangal". The column is
 * still `breed` (to keep the schema stable) but the UI says "Tür / Desen".
 *
 * ## How "Diğer (specify)" works
 * Picking OTHER opens a free-text field and that text is stored. So `breed`
 * holds either a listed value or the user's text; there is no separate
 * "other" column.
 */

const OTHER = 'Diğer';

/** The most common street-cat patterns, by prevalence. */
const CAT_PATTERNS = ['Tekir', 'Sarman', 'Siyah', 'Üç renk (calico)', 'Smokin'];

/** Street-dog types. All mixed; purebreds are nearly absent on the street. */
const DOG_PATTERNS = [
  'Kangal melezi',
  'Akbaş melezi',
  'Sokak melezi (orta boy)',
  'Kısa bacaklı melez',
  'Av/Terrier melezi',
];

/** Main body color. Partially overlaps the pattern (sarman is orange by definition). */
const CAT_COLORS = ['Gri / boz', 'Sarı / turuncu', 'Siyah', 'Beyaz', 'Siyah-beyaz'];
const DOG_COLORS = [
  'Sarı / kahverengi',
  'Siyah',
  'Beyaz',
  'Siyah-sarı (maskeli)',
  'Alacalı / benekli',
];

/** Health records have exactly two types: illness and injury. Vaccines live in their own table. */
const HEALTH_RECORD_TYPES = ['illness', 'injury'];

const ILLNESSES = [
  'Üst solunum yolu enfeksiyonu',
  'Parazit (iç/dış)',
  'Uyuz',
  'Deri hastalığı / mantar',
  'Göz enfeksiyonu',
];

/**
 * Injury labels describe **the wound, not the cause**: a cause like "traffic
 * accident" tells the next volunteer nothing actionable and is usually a
 * guess (nobody saw the accident). Where the wound is and what kind it is can
 * be verified by eye and answers "can I approach, is a vet mandatory".
 */
const INJURIES = [
  'Bacak/pati yarası',
  'Baş/göz yarası',
  'Gövde/sırt yarası',
  'Kuyruk/kulak yarası',
  'Kırık / topallama',
];

/**
 * Vaccine types. Rabies first: mandatory under Turkish law 5199, and it's the
 * one municipalities administer to street animals first.
 */
const VACCINE_TYPES = ['Kuduz', 'Karma', 'İç parazit', 'Dış parazit'];

/** Appends "Diğer" (other) to an option list; renders last in the UI. */
function withOther(options) {
  return [...options, OTHER];
}

/**
 * Is the value acceptable? Off-list values are allowed as "other" free text,
 * but empty/overlong text is rejected.
 */
function isValidChoice(value, options, { maxLength = 120 } = {}) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length > maxLength) return false;
  return true;
}

/** Pattern list for a species. */
function patternsFor(species) {
  return species === 'cat' ? CAT_PATTERNS : DOG_PATTERNS;
}

/** Color list for a species. */
function colorsFor(species) {
  return species === 'cat' ? CAT_COLORS : DOG_COLORS;
}

/** Condition list for a health-record type. */
function conditionsFor(recordType) {
  return recordType === 'illness' ? ILLNESSES : INJURIES;
}

module.exports = {
  OTHER,
  CAT_PATTERNS,
  DOG_PATTERNS,
  CAT_COLORS,
  DOG_COLORS,
  HEALTH_RECORD_TYPES,
  ILLNESSES,
  INJURIES,
  VACCINE_TYPES,
  withOther,
  isValidChoice,
  patternsFor,
  colorsFor,
  conditionsFor,
};
