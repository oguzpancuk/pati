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
 * The most common street colors per species in Türkiye — the fallback
 * choice list when the pattern is free "Diğer" text.
 */
const CAT_TOP_COLORS = ['Gri / boz', 'Sarı / turuncu', 'Siyah-beyaz'];
const DOG_TOP_COLORS = ['Sarı / kahverengi', 'Siyah-sarı (maskeli)', 'Siyah'];

/**
 * Patterns whose color is inherent get NO color picker; the canonical color
 * is auto-stored. Rationale lives with the mobile copy
 * (mobile/src/taxonomy.ts); keep the two maps identical.
 */
const PATTERN_FIXED_COLOR = {
  Sarman: 'Sarı / turuncu',
  Siyah: 'Siyah',
  'Üç renk (calico)': 'Beyaz-sarı-siyah',
  Smokin: 'Siyah-beyaz',
  'Akbaş melezi': 'Beyaz',
};

/**
 * Researched per-pattern color choices (labels are lay Turkish, not limited
 * to the legacy palette; none may contain MULTI_CHOICE_SEPARATOR). Keep
 * identical to the mobile copy.
 */
const PATTERN_COLOR_CHOICES = {
  Tekir: ['Gri / boz tekir', 'Kahverengi tekir', 'Sarı tekir', 'Tekir-beyaz', 'Gümüş tekir'],
  'Kangal melezi': [
    'Siyah maskeli sarı (karabaş)',
    'Sarı / boz',
    'Siyah-beyaz alacalı',
    'Kaplan çizgili',
    'Siyah',
  ],
  'Sokak melezi (orta boy)': [
    'Sarı',
    'Siyah',
    'Siyah-beyaz alacalı',
    'Kahverengi',
    'Sarı-siyah (maskeli)',
  ],
  'Kısa bacaklı melez': ['Kızıl / sarı', 'Siyah-kahve', 'Çikolata', 'Krem', 'Alacalı'],
  'Av/Terrier melezi': [
    'Beyaz-siyah benekli',
    'Beyaz-kahve benekli',
    'Üç renkli',
    'Kahverengi',
    'Sarı-beyaz',
  ],
};

/** The auto-stored color of a fixed-color pattern, or null. */
function fixedColorFor(species, pattern) {
  if (!pattern || !patternsFor(species).includes(pattern)) return null;
  return PATTERN_FIXED_COLOR[pattern] ?? null;
}

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
function colorsFor(species, pattern) {
  // Empty for fixed-color patterns (no picker); researched choices
  // otherwise; species fallback for free-text patterns. Maps are consulted
  // only for the species' own patterns.
  if (fixedColorFor(species, pattern)) return [];
  const choices =
    pattern && patternsFor(species).includes(pattern) ? PATTERN_COLOR_CHOICES[pattern] : undefined;
  return [...(choices ?? (species === 'cat' ? CAT_TOP_COLORS : DOG_TOP_COLORS))];
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
  PATTERN_FIXED_COLOR,
  PATTERN_COLOR_CHOICES,
  fixedColorFor,
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
