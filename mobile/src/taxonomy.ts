/**
 * The app's shared vocabulary — must stay **identical** to
 * `backend/src/utils/taxonomy.js`. Why two copies: the server can't delegate
 * validation to the client (anyone hitting the API directly could write
 * values not on the list), and the client shouldn't fetch a list over the
 * network for every picker.
 *
 * If one of the lists changes, update **both files together**.
 *
 * ## Why "pattern", not "breed"
 * Turkish street cats don't belong to a breed; their common names (tekir,
 * sarman, smokin) describe coat patterns, not breeds. Dogs are mostly mixed
 * too. The database column stayed `breed`; the UI label is "Tür / Desen".
 */

export const OTHER = 'Diğer';

/**
 * Separator used when a multi-select (e.g. colors) is flattened into its
 * single free-text DB column. Lives here so mobile and web write the same
 * string; no listed value may ever contain it.
 */
export const MULTI_CHOICE_SEPARATOR = ', ';

export type Species = 'cat' | 'dog';

/** The cat patterns most common on the street (in order of prevalence). */
export const CAT_PATTERNS = ['Tekir', 'Sarman', 'Siyah', 'Üç renk (calico)', 'Smokin'];

/** Street dog types. All mixed; purebreds are almost never seen on the street. */
export const DOG_PATTERNS = [
  'Kangal melezi',
  'Akbaş melezi',
  'Sokak melezi (orta boy)',
  'Kısa bacaklı melez',
  'Av/Terrier melezi',
];

/** Main body color. Partially overlaps the pattern (sarman is already orange). */
export const CAT_COLORS = ['Gri / boz', 'Sarı / turuncu', 'Siyah', 'Beyaz', 'Siyah-beyaz'];
export const DOG_COLORS = [
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
export const CAT_TOP_COLORS = ['Gri / boz', 'Sarı / turuncu', 'Siyah-beyaz'];
export const DOG_TOP_COLORS = ['Sarı / kahverengi', 'Siyah-sarı (maskeli)', 'Siyah'];

export const ILLNESSES = [
  'Üst solunum yolu enfeksiyonu',
  'Parazit (iç/dış)',
  'Uyuz',
  'Deri hastalığı / mantar',
  'Göz enfeksiyonu',
];

/**
 * Injury titles describe **the wound, not the cause**: a cause like "traffic
 * accident" tells the volunteer seeing the record nothing about what to do,
 * and is usually a guess (nobody saw the accident). Where the wound is and
 * what kind it is can be verified by eye and answers "can I approach, is a
 * vet required".
 */
export const INJURIES = [
  'Bacak/pati yarası',
  'Baş/göz yarası',
  'Gövde/sırt yarası',
  'Kuyruk/kulak yarası',
  'Kırık / topallama',
];

/**
 * Vaccine types. Rabies first: mandatory under Law No. 5199, and
 * municipalities administer it to street animals with priority.
 */
export const VACCINE_TYPES = ['Kuduz', 'Karma', 'İç parazit', 'Dış parazit'];

/** Appends "Diğer" (other) to an option list; renders last in the UI. */
export function withOther(options: string[]): string[] {
  return [...options, OTHER];
}

export function patternsFor(species: Species): string[] {
  return species === 'cat' ? CAT_PATTERNS : DOG_PATTERNS;
}

/**
 * Color list for a species, top-3 street colors first, then the rest.
 * Derived (not a second hand-kept list) so the two orderings cannot drift.
 */
export function colorsFor(species: Species): string[] {
  const all = species === 'cat' ? CAT_COLORS : DOG_COLORS;
  const top = species === 'cat' ? CAT_TOP_COLORS : DOG_TOP_COLORS;
  return [...top, ...all.filter((color) => !top.includes(color))];
}

export function conditionsFor(recordType: 'illness' | 'injury'): string[] {
  return recordType === 'illness' ? ILLNESSES : INJURIES;
}

/**
 * Tells whether a stored value is one of the listed options or free text.
 * The UI consults this to decide which chip comes pre-selected when editing
 * a registered animal.
 */
export function isPresetChoice(value: string | null | undefined, options: string[]): boolean {
  return !!value && options.includes(value);
}
