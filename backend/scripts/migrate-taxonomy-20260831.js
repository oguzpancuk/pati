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
const { MULTI_CHOICE_SEPARATOR } = require('../src/utils/taxonomy');

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

function migrateColor(breed, color) {
  if (!color) return color;
  const parts = color.split(MULTI_CHOICE_SEPARATOR).map((part) => {
    const mapped = COLOR_MAP[part] ?? part;
    if (breed === 'Sokak melezi (orta boy)') {
      return STREET_MIX_ONLY_COLOR_MAP[mapped] ?? mapped;
    }
    return mapped;
  });
  return [...new Set(parts)].join(MULTI_CHOICE_SEPARATOR);
}

async function main() {
  const { rows } = await pool.query('SELECT id, breed, color FROM animals');
  let changed = 0;
  for (const row of rows) {
    let breed = BREED_MAP[row.breed] ?? row.breed;
    let color = row.color;
    // A black kangal-mix reads better as a street mix than as a kangal with
    // a color the picker no longer offers.
    if (breed === 'Kangal melezi' && color === 'Siyah') {
      breed = 'Sokak melezi (orta boy)';
    }
    color = migrateColor(breed, color);
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
