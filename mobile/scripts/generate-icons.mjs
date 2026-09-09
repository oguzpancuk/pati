/**
 * Generates the app icons from the same SVG paths as
 * `src/components/brand/Logo.tsx`. A script instead of hand-exported PNGs so
 * that when the logo changes, every size regenerates with one command and the
 * in-app logo never drifts from the home-screen icon.
 *
 * Usage (needs Chromium, ships with Playwright):
 *   node scripts/generate-icons.mjs
 *
 * Üretilenler:
 *   ios/PatiMobile/Images.xcassets/AppIcon.appiconset/*.png
 *   ios/PatiMobile/Images.xcassets/LaunchLogo.imageset/*.png
 *   android/app/src/main/res/mipmap-*\/ic_launcher.png
 *   android/app/src/main/res/mipmap-*\/ic_launcher_round.png
 *   android/app/src/main/res/mipmap-*\/ic_launcher_foreground.png
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Brand colors — keep in step with src/theme/colors.ts (studio aesthetic).
const GRAD_START = '#F4581C';
const GRAD_END = '#F9A052';
const WHITE = '#FFFFFF';
// The gradient as paw fill; a flat color can be passed instead.
const GRAD = 'url(#g)';

/** Same paths as Logo.tsx / shared/logoSvg.ts (viewBox 0 0 120 130). */
function pawSvg(color, accent) {
  const defs =
    color === GRAD
      ? `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
           <stop offset="0" stop-color="${GRAD_START}"/><stop offset="1" stop-color="${GRAD_END}"/>
         </linearGradient></defs>`
      : '';
  return `${defs}
    <g fill="${color}">
      <ellipse cx="18" cy="47" rx="12.5" ry="16.5" transform="rotate(-24 18 47)"/>
      <ellipse cx="44" cy="25" rx="12.5" ry="17.5" transform="rotate(-9 44 25)"/>
      <ellipse cx="76" cy="25" rx="12.5" ry="17.5" transform="rotate(9 76 25)"/>
      <ellipse cx="102" cy="47" rx="12.5" ry="16.5" transform="rotate(24 102 47)"/>
    </g>
    <path d="M60 48C76.6 48 90 61.4 90 78c0 18-22 38-30 44-8-6-30-26-30-44 0-16.6 13.4-30 30-30z" fill="${color}"/>
    <path d="M60 90c-13-9-17-15.5-17-21 0-5.2 3.8-9 8.6-9 3.4 0 6.6 2 8.4 5 1.8-3 5-5 8.4-5 4.8 0 8.6 3.8 8.6 9 0 5.5-4 12-17 21z" fill="${accent}"/>`;
}

/**
 * @param size    kenar uzunluğu (px)
 * @param opts.bg zemin rengi; null ise saydam
 * @param opts.scale logonun kenara oranı
 * @param opts.round yuvarlak maske uygulansın mı
 */
function page(size, { bg, scale, round = false, paw = GRAD, heart = WHITE }) {
  // The artwork is 120×130; scale by width and center both axes.
  const logoW = size * scale;
  const logoH = (logoW * 130) / 120;
  const left = (size - logoW) / 2;
  const top = (size - logoH) / 2;
  const mask = round ? `border-radius:50%;` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent}
    .box{width:${size}px;height:${size}px;${bg ? `background:${bg};` : ''}${mask}position:relative;overflow:hidden}
    svg{position:absolute;left:${left}px;top:${top}px}
  </style></head><body>
    <div class="box"><svg width="${logoW}" height="${logoH}" viewBox="0 0 120 130">${pawSvg(paw, heart)}</svg></div>
  </body></html>`;
}

async function shot(browser, size, opts, outPath) {
  const p = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await p.setContent(page(size, opts));
  // The round icon's corners must stay transparent; the div paints the
  // ground, not the page. Square icons want no alpha channel at all — the
  // App Store rejects transparency in the 1024px icon.
  const buf = await p.screenshot({ omitBackground: !opts.bg || !!opts.round, type: 'png' });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buf);
  await p.close();
  console.log('  ', outPath.replace(ROOT + '/', ''), `${size}px`);
}

// iOS: the App Store icon rejects transparency; all are produced with a
// solid ground. Studio aesthetic: the gradient logo on a white ground.
const IOS_SIZES = [40, 58, 60, 80, 87, 120, 180, 1024];

// Android mipmap densities. The legacy icon is 48dp; the adaptive icon's
// foreground is based on 108dp.
const ANDROID_DENSITIES = [
  { dir: 'mipmap-mdpi', legacy: 48, foreground: 108 },
  { dir: 'mipmap-hdpi', legacy: 72, foreground: 162 },
  { dir: 'mipmap-xhdpi', legacy: 96, foreground: 216 },
  { dir: 'mipmap-xxhdpi', legacy: 144, foreground: 324 },
  { dir: 'mipmap-xxxhdpi', legacy: 192, foreground: 432 },
];

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });

  console.log('iOS app icon:');
  for (const size of IOS_SIZES) {
    await shot(
      browser,
      size,
      { bg: WHITE, scale: 0.66 },
      join(ROOT, `ios/PatiMobile/Images.xcassets/AppIcon.appiconset/icon-${size}.png`)
    );
  }

  console.log('iOS launch-screen logo:');
  for (const [suffix, size] of [
    ['', 160],
    ['@2x', 320],
    ['@3x', 480],
  ]) {
    await shot(
      browser,
      size,
      // The launch screen is white; the heart shows the ground through the
      // "hole". The storyboard's background color must match (white).
      { bg: null, scale: 0.92, paw: GRAD, heart: WHITE },
      join(ROOT, `ios/PatiMobile/Images.xcassets/LaunchLogo.imageset/launch-logo${suffix}.png`)
    );
  }

  console.log('Android icons:');
  for (const d of ANDROID_DENSITIES) {
    const base = join(ROOT, 'android/app/src/main/res', d.dir);
    await shot(browser, d.legacy, { bg: WHITE, scale: 0.66 }, join(base, 'ic_launcher.png'));
    await shot(
      browser,
      d.legacy,
      { bg: WHITE, scale: 0.66, round: true },
      join(base, 'ic_launcher_round.png')
    );
    // The adaptive icon's foreground: only the middle 66dp of the 108dp
    // canvas is the safe zone, the rest is cropped for masks/animation. The
    // 0.42 ratio keeps the logo inside that safe zone.
    await shot(
      browser,
      d.foreground,
      { bg: null, scale: 0.42 },
      join(base, 'ic_launcher_foreground.png')
    );
  }

  await browser.close();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
