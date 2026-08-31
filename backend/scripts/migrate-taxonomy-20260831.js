/**
 * One-off data migration for the 2026-08-31 taxonomy trim (owner decision):
 * dog patterns "Kısa bacaklı melez" and "Av/Terrier melezi" were removed
 * (folded into the generic street mix), several color choices were dropped,
 * and "Beyaz" joined the street-mix palette. This script rewrites EXISTING
 * animals so the database only holds values the form can still produce.
 *
 * Idempotent — safe to run more than once. Run locally after pulling, and
 * against production via
 *   fly ssh console --app pati-app -C "node scripts/migrate-taxonomy-20260831.js"
 * as part of the next deploy (see docs/NOTES.md).
 */
require('dotenv').config();
const pool = require('../src/config/db');
const {
  CAT_PATTERNS,
  DOG_PATTERNS,
  PATTERN_COLOR_CHOICES,
  PATTERN_FIXED_COLOR,
  MULTI_CHOICE_SEPARATOR,
} = require('../src/utils/taxonomy');

// Color rewriting only applies to preset patterns (current or removed):
// free-text ("Diğer") breeds carry user-typed colors that must never be
// silently rewritten (review finding).
const PRESET_PATTERNS = new Set([
  ...CAT_PATTERNS,
  ...DOG_PATTERNS,
  'Kısa bacaklı melez',
  'Av/Terrier melezi',
]);

// Removed patterns fold into the generic street mix.
const BREED_MAP = {
  'Kısa bacaklı melez': 'Sokak melezi (orta boy)',
  'Av/Terrier melezi': 'Sokak melezi (orta boy)',
};

// Removed color choices map to the nearest surviving label. Keys may be
// conditioned on the (post-remap) breed: "Siyah-beyaz alacalı" is still a
// Kangal choice but left the street-mix list.
const COLOR_MAP = {
  'Sarı tekir': 'Sarı / turuncu',
  'Gümüş tekir': 'Gri / boz tekir',
  'Tekir-beyaz': 'Gri / boz tekir',
  'Kaplan çizgili': 'Sarı / boz',
  'Kızıl / sarı': 'Sarı',
  'Siyah-kahve': 'Kahverengi',
  Çikolata: 'Kahverengi',
  Krem: 'Sarı',
  Alacalı: 'Beyaz',
  'Beyaz-siyah benekli': 'Beyaz',
  'Beyaz-kahve benekli': 'Beyaz',
  'Üç renkli': 'Kahverengi',
  'Sarı-beyaz': 'Sarı',
};
const STREET_MIX_ONLY_COLOR_MAP = {
  'Siyah-beyaz alacalı': 'Beyaz',
  'Sarı-siyah (maskeli)': 'Sarı',
};

// Per-pattern remaps for the legacy species-level palette (the era before
// per-pattern choices) — targeted, meaning-preserving translations.
const PATTERN_LEGACY_COLOR_MAP = {
  Tekir: { 'Gri / boz': 'Gri / boz tekir', Kahverengi: 'Kahverengi tekir' },
  'Kangal melezi': {
    'Siyah-sarı (maskeli)': 'Siyah maskeli sarı (karabaş)',
    'Sarı / kahverengi': 'Sarı / boz',
    'Alacalı / benekli': 'Siyah-beyaz alacalı',
    Beyaz: 'Sarı / boz',
  },
  'Sokak melezi (orta boy)': {
    'Siyah-sarı (maskeli)': 'Sarı',
    'Alacalı / benekli': 'Beyaz',
    'Sarı / kahverengi': 'Sarı',
  },
};

// The legacy palettes: parts from these sets that survive the maps above
// collapse to the pattern's first choice. Anything OUTSIDE these sets is
// user-typed "Diğer" text and stays untouched on choice patterns.
const LEGACY_PALETTE = new Set([
  'Gri / boz',
  'Sarı / turuncu',
  'Siyah',
  'Beyaz',
  'Siyah-beyaz',
  'Sarı / kahverengi',
  'Siyah-sarı (maskeli)',
  'Alacalı / benekli',
  'Kahverengi',
]);

function migrateColor(breed, color) {
  if (!color) return color;
  // Fixed-color patterns take no color choice at all any more — the
  // canonical value replaces whatever history left behind.
  if (PATTERN_FIXED_COLOR[breed]) return PATTERN_FIXED_COLOR[breed];

  const choices = PATTERN_COLOR_CHOICES[breed] ?? [];
  const parts = color.split(MULTI_CHOICE_SEPARATOR).map((part) => {
    let mapped = COLOR_MAP[part] ?? part;
    mapped = PATTERN_LEGACY_COLOR_MAP[breed]?.[mapped] ?? mapped;
    if (breed === 'Sokak melezi (orta boy)') {
      mapped = STREET_MIX_ONLY_COLOR_MAP[mapped] ?? mapped;
    }
    if (choices.includes(mapped)) return mapped;
    // Remaining legacy-palette values collapse to the first choice;
    // genuinely custom text survives.
    return LEGACY_PALETTE.has(mapped) ? choices[0] : mapped;
  });
  return [...new Set(parts)].join(MULTI_CHOICE_SEPARATOR);
}

async function main() {
  const { rows } = await pool.query('SELECT id, breed, color FROM animals');
  let changed = 0;
  for (const row of rows) {
    let breed = BREED_MAP[row.breed] ?? row.breed;
    let color = row.color;

    // Free-text breeds keep their user-typed colors untouched.
    if (PRESET_PATTERNS.has(row.breed)) {
      let parts = (color ?? '').split(MULTI_CHOICE_SEPARATOR).filter(Boolean);

      // Orange tabbies belong under Sarman now (the new taxonomy comment
      // says so); refile only when the orange label was the sole color —
      // otherwise drop that part and stay a Tekir. "Sarı / turuncu" is
      // included because this script's earlier revision mapped Sarı tekir
      // there before the refile rule existed.
      const orangeTabby = ['Sarı tekir', 'Sarı / turuncu'];
      if (breed === 'Tekir' && parts.some((part) => orangeTabby.includes(part))) {
        if (parts.length === 1) {
          breed = 'Sarman';
          parts = ['Sarı / turuncu'];
        } else {
          parts = parts.filter((part) => !orangeTabby.includes(part));
        }
      }

      // A black kangal-mix reads better as a street mix; with other colors
      // alongside, keep the kangal and drop the no-longer-offered "Siyah"
      // part instead (multi-select rows exist on prod — review finding).
      if (breed === 'Kangal melezi' && parts.includes('Siyah')) {
        if (parts.length === 1) {
          breed = 'Sokak melezi (orta boy)';
        } else {
          parts = parts.filter((part) => part !== 'Siyah');
        }
      }

      if (PATTERN_FIXED_COLOR[breed]) {
        // Fixed-color patterns canonicalize even a NULL color — profiles
        // must never say "Rengi belirtilmemiş" for a sarman.
        color = PATTERN_FIXED_COLOR[breed];
      } else if (parts.length > 0) {
        color = migrateColor(breed, parts.join(MULTI_CHOICE_SEPARATOR));
      }
    }

    if (breed !== row.breed || color !== row.color) {
      await pool.query('UPDATE animals SET breed = $1, color = $2 WHERE id = $3', [
        breed,
        color,
        row.id,
      ]);
      changed += 1;
    }
  }
  console.log(`taxonomy migration: ${changed}/${rows.length} animals updated`);
  await pool.end();
}

main().catch((err) => {
  console.error('taxonomy migration failed:', err);
  process.exit(1);
});
