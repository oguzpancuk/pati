/**
 * Web PWA'nın bir sayfasını telefon boyutunda (390×844, 2x) çekip PNG yazar.
 *   node scripts/shot.mjs <url> <cikti.png> [eposta sifre]
 * E-posta/şifre verilirse önce API'den giriş yapıp token'ı localStorage'a
 * yazar (giriş ekranını elle geçmeden). URL'nin kökü API olarak kullanılır.
 * playwright + chromium gerekir: `npx playwright install chromium`.
 */
import { chromium } from 'playwright';
const [url, out, email, pass] = process.argv.slice(2);
if (!url || !out) { console.error('kullanım: node scripts/shot.mjs <url> <cikti.png> [eposta sifre]'); process.exit(1); }
const origin = new URL(url).origin;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
if (email) {
  const r = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pass }) });
  const d = await r.json();
  if (!d.token) { console.error('giriş başarısız:', JSON.stringify(d)); process.exit(1); }
  await page.goto(origin + '/');
  await page.evaluate((t) => localStorage.setItem('pati-token', t), d.token);
}
await page.goto(url);
await page.waitForTimeout(3000);
await page.screenshot({ path: out });
console.log('ekran:', out, '| hatalar:', errors.length ? errors.join(' | ') : 'yok');
await browser.close();
