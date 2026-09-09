/**
 * The one place that turns a species + pattern into a demo photo filename.
 *
 * Shared on purpose: generate-demo-animal-photos.mjs writes the files and
 * seed-showcase.js writes the URLs pointing at them. A slug rule that lived
 * in both would drift, and the failure mode is silent — a broken image in
 * the showcase world nobody notices until a demo.
 *
 * CommonJS so the CJS seed can require it; the ESM generator imports the
 * same named export.
 */

// Turkish letters have no useful NFD decomposition for ı/ğ/ş, so they are
// mapped explicitly before the generic strip.
const TR_MAP = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u' };

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[çğıİöşü]/g, (ch) => TR_MAP[ch] ?? ch)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * @param {'cat'|'dog'} species
 * @param {string|null|undefined} pattern a taxonomy pattern, or null/free
 *   text for the neutral fallback face
 * @returns {string} e.g. "cat-uc-renk-calico.png", "dog-other.png"
 */
function demoPhotoFile(species, pattern) {
  const name = pattern ? slug(pattern) : 'other';
  return `${species}-${name || 'other'}.png`;
}

module.exports = { demoPhotoFile, slug };
