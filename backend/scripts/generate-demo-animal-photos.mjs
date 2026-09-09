/**
 * Renders the animal pattern avatars (shared/animalAvatarSvg.ts) to PNGs so
 * every showcase animal can carry exactly one photo.
 *
 *   node scripts/generate-demo-animal-photos.mjs
 *
 * Writes demo-assets/animals/<species>-<pattern-slug>.png — one file per
 * species × taxonomy pattern, plus the neutral fallback face. The app image
 * serves that directory at /demo (there is no uploads volume in production,
 * and a demo photo must survive a redeploy), so the seed can point
 * animal_photos.url at a stable URL instead of uploading anything.
 *
 * Committed output: rerun and re-commit when a face in
 * shared/animalAvatarSvg.ts changes — the same rule the mobile care markers
 * follow. Chromium comes from web/'s Playwright, as in
 * mobile/scripts/generate-care-markers.mjs.
 */
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { animalAvatarSvg } from '../../shared/animalAvatarSvg.ts';
import { CAT_PATTERNS, DOG_PATTERNS } from '../src/utils/taxonomy.js';
import { demoPhotoFile } from './lib/demoPhotos.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'demo-assets', 'animals');
// Big enough for the animal detail screen's hero image without being a
// heavy binary in git: the source is flat vector art, so it stays a few kB.
const SIZE = 512;

const targets = [
  ...CAT_PATTERNS.map((pattern) => ({ species: 'cat', pattern })),
  ...DOG_PATTERNS.map((pattern) => ({ species: 'dog', pattern })),
  // The neutral faces animalAvatarSvg() falls back to for a free-text
  // pattern; kept so a "Diğer" animal is never photoless.
  { species: 'cat', pattern: null },
  { species: 'dog', pattern: null },
];

const requireFromWeb = createRequire(join(ROOT, '..', 'web', 'package.json'));
const { chromium } = requireFromWeb('playwright');

mkdirSync(OUT, { recursive: true });
for (const stale of readdirSync(OUT)) {
  if (stale.endsWith('.png')) rmSync(join(OUT, stale));
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: SIZE, height: SIZE } });
const page = await context.newPage();
let total = 0;
for (const { species, pattern } of targets) {
  const file = demoPhotoFile(species, pattern);
  await page.setContent(
    `<body style="margin:0;background:transparent">${animalAvatarSvg(
      species,
      pattern,
      SIZE
    )}</body>`
  );
  const png = await page.screenshot({ omitBackground: true, type: 'png' });
  const target = join(OUT, file);
  writeFileSync(target, png);
  total += statSync(target).size;
  console.log(`  ${file}  ${(statSync(target).size / 1024).toFixed(1)} kB`);
}
await context.close();
await browser.close();
console.log(`${targets.length} avatars → ${OUT} (${(total / 1024).toFixed(1)} kB total)`);
