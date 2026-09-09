/**
 * Renders the two care photos the showcase drops carry — a full food bowl
 * and a full water bowl — to PNGs.
 *
 *   node scripts/generate-demo-care-photos.mjs
 *
 * Writes demo-assets/care/{food,water}.png. Every real drop is confirmed by
 * a photo of the bowl (that is what the AI check looks at, ADR-0005), so a
 * seeded drop pointing at an animal's face taught the wrong thing wherever
 * the field is shown — the admin panel's care list shows it today (QA
 * finding, 2026-09-09).
 *
 * The art is the map marker itself (mobile/src/map/careMarkers.ts, the same
 * single source the marker PNGs come from) at a full ring: a drop whose
 * photo is the icon of what was left is honest about being a demo.
 *
 * Committed output: rerun and re-commit when the marker art changes.
 * Chromium comes from web/'s Playwright, as in the animal-photo generator.
 */
import { createRequire } from 'node:module';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { careMarkerSvg, RING_STEPS } from '../../mobile/src/map/careMarkers.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'demo-assets', 'care');
const SIZE = 512;

const requireFromWeb = createRequire(join(ROOT, '..', 'web', 'package.json'));
const { chromium } = requireFromWeb('playwright');

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: SIZE, height: SIZE } });
const page = await context.newPage();
for (const type of ['food', 'water']) {
  // A full ring on the light theme: the photo stands for the drop as it was
  // made, not as it is now.
  const svg = careMarkerSvg(type, RING_STEPS, 'light');
  await page.setContent(
    `<body style="margin:0;background:transparent;display:grid;place-items:center;height:${SIZE}px">
       <div style="width:${SIZE}px;height:${SIZE}px">${svg.replace('<svg', '<svg width="100%" height="100%"')}</div>
     </body>`
  );
  const png = await page.screenshot({ omitBackground: true, type: 'png' });
  const target = join(OUT, `${type}.png`);
  writeFileSync(target, png);
  console.log(`  ${type}.png  ${(statSync(target).size / 1024).toFixed(1)} kB`);
}
await context.close();
await browser.close();
console.log(`2 care photos → ${OUT}`);
