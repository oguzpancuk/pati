/**
 * Rehber (demo) bölgelerini canlı tutan zamanlayıcı.
 *
 * Haritadaki yeşil, mama 4 / su 6 saatte soluyor; rehber verisinin bir aylık
 * geçmişi haritayı yeşil tutmaz. DEMO_REHBER_TAZELE=1 verilirse sunucu
 * açılışta ve sonra saatte bir, rehber kullanıcılar adına birkaç taze mama/su
 * kaydı ekler (bkz. scripts/seed-rehber.js#tazele).
 *
 * Fly'da makine trafik yokken uyur (auto_stop). Bu bilinçli olarak sorun
 * değil: makine uyuyorsa haritaya bakan da yoktur; ilk istek makineyi
 * uyandırır, açılıştaki tazeleme haritayı yine yeşil karşılar.
 */
const { tazele } = require('../../scripts/seed-rehber');

const INTERVAL_MS = 60 * 60 * 1000;
const BOOT_DELAY_MS = 15 * 1000; // açılışta migrate/health'in önüne geçmesin

function startDemoTazele() {
  if (process.env.DEMO_REHBER_TAZELE !== '1') return;

  const run = async () => {
    try {
      const n = await tazele({ sessiz: true });
      if (n > 0) console.log(`[demo-tazele] ${n} taze mama/su eklendi`);
    } catch (err) {
      // Demo süsü uygulamayı düşürmemeli: logla ve bir sonraki turu bekle.
      console.error('[demo-tazele] başarısız:', err.message);
    }
  };

  setTimeout(run, BOOT_DELAY_MS);
  const timer = setInterval(run, INTERVAL_MS);
  timer.unref(); // kapanışta süreci bekletmesin
}

module.exports = { startDemoTazele };
