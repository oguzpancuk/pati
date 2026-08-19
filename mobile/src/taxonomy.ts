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

export function colorsFor(species: Species): string[] {
  return species === 'cat' ? CAT_COLORS : DOG_COLORS;
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
