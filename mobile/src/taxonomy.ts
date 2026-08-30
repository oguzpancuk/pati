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
 * The most common street colors per species in Türkiye — the fallback
 * choice list when the pattern is free "Diğer" text.
 */
export const CAT_TOP_COLORS = ['Gri / boz', 'Sarı / turuncu', 'Siyah-beyaz'];
export const DOG_TOP_COLORS = ['Sarı / kahverengi', 'Siyah-sarı (maskeli)', 'Siyah'];

/**
 * Patterns whose color is inherent get NO color picker at all (owner
 * decision, 2026-08-30): a sarman is orange, a calico is white+orange+black
 * by definition, an Akbaş is white by breed standard. The canonical color is
 * auto-stored so profiles never say "Rengi belirtilmemiş" for them.
 */
export const PATTERN_FIXED_COLOR: Record<string, string> = {
  Sarman: 'Sarı / turuncu',
  Siyah: 'Siyah',
  'Üç renk (calico)': 'Beyaz-sarı-siyah',
  Smokin: 'Siyah-beyaz',
  'Akbaş melezi': 'Beyaz',
};

/**
 * Color choices for patterns with real variation — the ONLY options offered
 * besides "Diğer", ordered by street frequency. Researched per pattern
 * (2026-08-30) from Turkish pet sources, breed standards, and coat-color
 * genetics; labels are what a lay Turkish user would say, deliberately NOT
 * limited to the legacy CAT_COLORS/DOG_COLORS palette (the column takes
 * free text — these lists ARE the picker). No label may contain the
 * MULTI_CHOICE_SEPARATOR (", ").
 */
export const PATTERN_COLOR_CHOICES: Record<string, string[]> = {
  // Tabby ground colors named by Turkish pet sources; grey the beloved
  // default, tabby-with-white very common via Mediterranean white-spotting.
  // "Sarı tekir" stays even though sarman is a separate pattern — orange
  // tabbies filed under Tekir need an honest choice.
  Tekir: ['Gri / boz tekir', 'Kahverengi tekir', 'Sarı tekir', 'Tekir-beyaz', 'Gümüş tekir'],
  // Karabaş (fawn + dominant black mask) is the type-defining look; brindle
  // and black are breed-standard-attested; mixing adds piebald.
  'Kangal melezi': [
    'Siyah maskeli sarı (karabaş)',
    'Sarı / boz',
    'Siyah-beyaz alacalı',
    'Kaplan çizgili',
    'Siyah',
  ],
  // "Sarı köpek" is the archetypal Turkish street dog; ordering reasoned
  // from village-dog literature (no urban census exists).
  'Sokak melezi (orta boy)': [
    'Sarı',
    'Siyah',
    'Siyah-beyaz alacalı',
    'Kahverengi',
    'Sarı-siyah (maskeli)',
  ],
  // Dachshund-standard colors dominate this ancestry; red most common.
  'Kısa bacaklı melez': ['Kızıl / sarı', 'Siyah-kahve', 'Çikolata', 'Krem', 'Alacalı'],
  // Pointer/setter/spaniel piebald-ticked coats; Zerdava reinforces the
  // white-brown speckle locally; tricolor from spaniel/hound lines.
  'Av/Terrier melezi': [
    'Beyaz-siyah benekli',
    'Beyaz-kahve benekli',
    'Üç renkli',
    'Kahverengi',
    'Sarı-beyaz',
  ],
};

/** The auto-stored color of a fixed-color pattern, or null. */
export function fixedColorFor(species: Species, pattern?: string | null): string | null {
  if (!pattern || !patternsFor(species).includes(pattern)) return null;
  return PATTERN_FIXED_COLOR[pattern] ?? null;
}

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
 * Color choices for a chosen pattern. Empty for fixed-color patterns (no
 * picker at all — see PATTERN_FIXED_COLOR); the researched per-pattern list
 * otherwise; the species fallback for free-text ("Diğer") patterns. Maps
 * are consulted only for the species' own patterns — colorsFor('dog',
 * 'Tekir') must not answer with cat colors.
 */
export function colorsFor(species: Species, pattern?: string | null): string[] {
  if (fixedColorFor(species, pattern)) return [];
  const choices =
    pattern && patternsFor(species).includes(pattern) ? PATTERN_COLOR_CHOICES[pattern] : undefined;
  return [...(choices ?? (species === 'cat' ? CAT_TOP_COLORS : DOG_TOP_COLORS))];
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
