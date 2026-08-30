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
 * The three most common street colors per species in Türkiye — the fallback
 * ordering when no pattern is chosen or the pattern is free "Diğer" text.
 */
export const CAT_TOP_COLORS = ['Gri / boz', 'Sarı / turuncu', 'Siyah-beyaz'];
export const DOG_TOP_COLORS = ['Sarı / kahverengi', 'Siyah-sarı (maskeli)', 'Siyah'];

/**
 * The three most common street colors per PATTERN in Türkiye — the ONLY
 * choices offered besides "Diğer" (owner decision, 2026-08-30: "tür
 * seçilince o türün en fazla görülen 3 rengi", sadece 3 renk + Diğer).
 * Orderings grounded in coat-color genetics and breed standards (no Turkish
 * frequency data exists in accessible form); per-row rationale below.
 * Values need not come from CAT_COLORS/DOG_COLORS — the column takes free
 * text, and these lists ARE the picker.
 */
export const PATTERN_TOP_COLORS: Record<string, string[]> = {
  // Wild-type grey-brown mackerel dominates Anatolian tabbies; brown is a
  // continuum with it; orange tabby (elevated in Turkey) third.
  Tekir: ['Gri / boz', 'Kahverengi', 'Sarı / turuncu'],
  // Orange by definition; Mediterranean white-spotting makes orange-white
  // the runner-up, dilute cream third.
  Sarman: ['Sarı / turuncu', 'Sarı-beyaz', 'Krem'],
  // White chest lockets are extremely common on black strays; dilute black
  // (grey/blue) third.
  Siyah: ['Siyah', 'Siyah-beyaz', 'Gri / boz'],
  // Calico = white base + orange + black patches; white covers most area.
  'Üç renk (calico)': ['Beyaz', 'Sarı / turuncu', 'Siyah'],
  // Tuxedo is black-and-white by definition; blue/grey tuxedo the common
  // dilute; tabby-and-white the frequent street variant.
  Smokin: ['Siyah-beyaz', 'Gri / boz', 'Tekir-beyaz'],
  // The black mask is dominant (E^m) and the breed standard, so it persists
  // in mixes; maskless fawn second; pied chest markings from mixing third.
  'Kangal melezi': ['Siyah-sarı (maskeli)', 'Sarı / kahverengi', 'Alacalı / benekli'],
  // The breed is always white; mixes break to white-with-patches.
  'Akbaş melezi': ['Beyaz', 'Alacalı / benekli', 'Sarı / kahverengi'],
  // Village-dog surveys show fawn/sable dominance, then dominant black;
  // black-masked fawn common in Anatolia via Kangal admixture.
  'Sokak melezi (orta boy)': ['Sarı / kahverengi', 'Siyah', 'Siyah-sarı (maskeli)'],
  'Kısa bacaklı melez': ['Sarı / kahverengi', 'Siyah', 'Alacalı / benekli'],
  // Pointer/setter/spaniel ancestry: piebald/ticked signature look first.
  'Av/Terrier melezi': ['Alacalı / benekli', 'Sarı / kahverengi', 'Beyaz'],
};

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
 * Color choices for a chosen pattern: ONLY that pattern's three most common
 * street colors (owner decision — the full palette is not offered; anything
 * else goes through the "Diğer" free text the picker appends itself).
 * Free-text ("Diğer") patterns fall back to the species top-3.
 */
export function colorsFor(species: Species, pattern?: string | null): string[] {
  return [
    ...((pattern ? PATTERN_TOP_COLORS[pattern] : undefined) ??
      (species === 'cat' ? CAT_TOP_COLORS : DOG_TOP_COLORS)),
  ];
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
