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

/**
 * Separator used when a multi-select (e.g. colors) is flattened into its
 * single free-text DB column. Lives here so mobile and web write the same
 * string; no listed value may ever contain it.
 */
const MULTI_CHOICE_SEPARATOR = ', ';

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

/**
 * The three most common street colors per species in Türkiye, pinned first in
 * the picker (owner decision, 2026-08-30 improvement sprint item 3).
 *
 * Cats: the archetypal Turkish street cat is the grey/brown tabby (tekir),
 * then the orange tabby (sarman), then black-and-white bicolors (smokin) —
 * urban colonies are dominated by these three coats.
 * Dogs: street dogs are overwhelmingly Kangal/Anatolian-shepherd mixes, so
 * tan/brown bodies come first, the kangal-type tan-with-black-mask second,
 * and black/mostly-black mixes third (white Akbaş types are rarer in cities).
 */
const CAT_TOP_COLORS = ['Gri / boz', 'Sarı / turuncu', 'Siyah-beyaz'];
const DOG_TOP_COLORS = ['Sarı / kahverengi', 'Siyah-sarı (maskeli)', 'Siyah'];

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

/**
 * Color list for a species, top-3 street colors first, then the rest.
 * Derived (not a second hand-kept list) so the two orderings cannot drift.
 */
function colorsFor(species) {
  const all = species === 'cat' ? CAT_COLORS : DOG_COLORS;
  const top = species === 'cat' ? CAT_TOP_COLORS : DOG_TOP_COLORS;
  return [...top, ...all.filter((color) => !top.includes(color))];
}

/** Condition list for a health-record type. */
function conditionsFor(recordType) {
  return recordType === 'illness' ? ILLNESSES : INJURIES;
}

module.exports = {
  OTHER,
  MULTI_CHOICE_SEPARATOR,
  CAT_PATTERNS,
  DOG_PATTERNS,
  CAT_COLORS,
  DOG_COLORS,
  CAT_TOP_COLORS,
  DOG_TOP_COLORS,
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
