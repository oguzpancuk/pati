/**
 * Uygulama ikonlarını `src/components/brand/Logo.tsx`'teki aynı SVG yollarından
 * üretir. Elle PNG dışa aktarmak yerine script kullanmamızın sebebi: logo
 * değişirse tek komutla bütün boyutlar yeniden üretilebilsin ve uygulama içi
 * logo ile ana ekran ikonu birbirinden ayrışmasın.
 *
 * Kullanım (Chromium gerekiyor, Playwright ile geliyor):
 *   node scripts/generate-icons.mjs
 *
 * Üretilenler:
 *   ios/StrayMobile/Images.xcassets/AppIcon.appiconset/*.png
 *   ios/StrayMobile/Images.xcassets/LaunchLogo.imageset/*.png
 *   android/app/src/main/res/mipmap-*\/ic_launcher.png
 *   android/app/src/main/res/mipmap-*\/ic_launcher_round.png
 *   android/app/src/main/res/mipmap-*\/ic_launcher_foreground.png
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Marka renkleri — src/theme/colors.ts ile aynı tutulmalı.
const BRAND = '#F47A4A';
const CREAM = '#FFF3E7';
const WHITE = '#FFFFFF';

/** Logo.tsx ile birebir aynı yollar. */
function pawSvg(color, accent) {
  return `
    <g fill="${color}">
      <ellipse cx="16" cy="42" rx="9" ry="12" transform="rotate(-22 16 42)"/>
      <ellipse cx="37" cy="26" rx="9.5" ry="13" transform="rotate(-8 37 26)"/>
      <ellipse cx="63" cy="26" rx="9.5" ry="13" transform="rotate(8 63 26)"/>
      <ellipse cx="84" cy="42" rx="9" ry="12" transform="rotate(22 84 42)"/>
    </g>
    <path d="M50 97 C40 81 29 75 29 66 A21 21 0 1 1 71 66 C71 75 60 81 50 97 Z" fill="${color}"/>
    <path d="M50 73 C50 73 38.5 65.5 38.5 58.6 C38.5 54.4 41.6 51.6 45.2 51.6 C47.5 51.6 49.2 52.9 50 54.2 C50.8 52.9 52.5 51.6 54.8 51.6 C58.4 51.6 61.5 54.4 61.5 58.6 C61.5 65.5 50 73 50 73 Z" fill="${accent}"/>`;
}

/**
 * @param size    kenar uzunluğu (px)
 * @param opts.bg zemin rengi; null ise saydam
 * @param opts.scale logonun kenara oranı
 * @param opts.round yuvarlak maske uygulansın mı
 */
function page(size, { bg, scale, round = false, paw = WHITE, heart = BRAND }) {
  const logo = size * scale;
  const offset = (size - logo) / 2;
  const mask = round ? `border-radius:50%;` : '';
  const pawColor = paw;
  const heartColor = heart;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent}
    .box{width:${size}px;height:${size}px;${bg ? `background:${bg};` : ''}${mask}position:relative;overflow:hidden}
    svg{position:absolute;left:${offset}px;top:${offset}px}
  </style></head><body>
    <div class="box"><svg width="${logo}" height="${logo}" viewBox="0 0 100 100">${pawSvg(pawColor, heartColor)}</svg></div>
  </body></html>`;
}

async function shot(browser, size, opts, outPath) {
  const p = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await p.setContent(page(size, opts));
  // Yuvarlak ikonun köşeleri saydam kalmalı; zemin div'in kendisi boyuyor,
  // sayfa zemini değil. Kare ikonlarda ise alfa kanalı hiç istemiyoruz —
  // App Store 1024px ikonunda saydamlığı reddediyor.
  const buf = await p.screenshot({ omitBackground: !opts.bg || !!opts.round, type: 'png' });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buf);
  await p.close();
  console.log('  ', outPath.replace(ROOT + '/', ''), `${size}px`);
}

// iOS: App Store ikonu saydamlık kabul etmiyor, hepsi dolu zeminli üretiliyor.
const IOS_SIZES = [40, 58, 60, 80, 87, 120, 180, 1024];

// Android mipmap yoğunlukları. Klasik ikon 48dp, uyarlanabilir (adaptive)
// ikonun ön planı 108dp tabanlı.
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

  console.log('iOS uygulama ikonu:');
  for (const size of IOS_SIZES) {
    await shot(
      browser,
      size,
      { bg: BRAND, scale: 0.68 },
      join(ROOT, `ios/StrayMobile/Images.xcassets/AppIcon.appiconset/icon-${size}.png`)
    );
  }

  console.log('iOS açılış ekranı logosu:');
  for (const [suffix, size] of [
    ['', 160],
    ['@2x', 320],
    ['@3x', 480],
  ]) {
    await shot(
      browser,
      size,
      // Açılış ekranı krem zeminli; kalp "delik" olarak zemini gösteriyor.
      { bg: null, scale: 1, paw: BRAND, heart: CREAM },
      join(ROOT, `ios/StrayMobile/Images.xcassets/LaunchLogo.imageset/launch-logo${suffix}.png`)
    );
  }

  console.log('Android ikonları:');
  for (const d of ANDROID_DENSITIES) {
    const base = join(ROOT, 'android/app/src/main/res', d.dir);
    await shot(browser, d.legacy, { bg: BRAND, scale: 0.68 }, join(base, 'ic_launcher.png'));
    await shot(
      browser,
      d.legacy,
      { bg: BRAND, scale: 0.68, round: true },
      join(base, 'ic_launcher_round.png')
    );
    // Uyarlanabilir ikonun ön planı: 108dp tuvalin yalnızca ortadaki 66dp'si
    // güvenli alan, kalanı maske/animasyon için kırpılıyor. 0.42 oranı logoyu
    // o güvenli alanın içinde tutuyor.
    await shot(
      browser,
      d.foreground,
      { bg: null, scale: 0.42 },
      join(base, 'ic_launcher_foreground.png')
    );
  }

  await browser.close();
  console.log('\nTamam.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
