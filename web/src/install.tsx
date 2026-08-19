import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Logo } from './brand';

/**
 * "Ana ekrana ekle" akışı. İki dünya var:
 *  - Android/Chrome: tarayıcı `beforeinstallprompt` verir; saklayıp düğmeye
 *    bağlarız, gerçek yükleme penceresi açılır.
 *  - iOS Safari: API yok; düğme yönerge sayfası açar (Paylaş → Ana Ekrana Ekle).
 * Ana ekrandan açıldıysa (standalone) hiç görünmez. "Sonra" 7 gün gizler.
 */
const DISMISS_KEY = 'pati-install-dismissed';
const DISMISS_DAYS = 7;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
  });
}

export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export function useInstallPrompt() {
  const [canPrompt, setCanPrompt] = useState(!!deferredPrompt);
  const [hidden, setHidden] = useState(() => {
    if (isStandalone()) return true;
    const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - t < DISMISS_DAYS * 86400000;
  });
  useEffect(() => {
    const onPrompt = () => setCanPrompt(true);
    const onInstalled = () => setHidden(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  async function install(): Promise<'prompted' | 'ios' | 'manual'> {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      setCanPrompt(false);
      if (outcome === 'accepted') setHidden(true);
      return 'prompted';
    }
    return isIOS() ? 'ios' : 'manual';
  }
  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setHidden(true);
  }
  return { hidden, canPrompt, install, dismiss };
}

/** Yönerge sayfası: iOS'ta (ve prompt vermeyen tarayıcılarda) adımlar. */
export function InstallSheet({ mode, onClose }: { mode: 'ios' | 'manual'; onClose: () => void }) {
  // Portal: banner harita üst katmanı gibi kendi yığın bağlamı olan bir
  // kutunun içinde durabiliyor; sayfa body'ye taşınmazsa o kutunun z-index'ine
  // hapsolup harita düğmelerinin altında kalıyor.
  return createPortal(
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Ana ekrana ekle</h2>
        <p className="muted">Kısayol olarak ekle; tam ekran açılır, uygulama gibi durur.</p>
        {mode === 'ios' ? (
          <ol className="steps">
            <li>
              Safari'de <b>Paylaş</b> düğmesine dokun (adres çubuğunun yanındaki <b>⋯</b> menüsünde
              ya da alttaki ok simgesi).
            </li>
            <li>
              Listeden <b>Ana Ekrana Ekle</b>'yi seç.
            </li>
            <li>
              Sağ üstten <b>Ekle</b> de — pati ana ekranında.
            </li>
          </ol>
        ) : (
          <ol className="steps">
            <li>Tarayıcı menüsünü aç (⋮ ya da Paylaş).</li>
            <li>
              <b>Ana ekrana ekle</b> / <b>Uygulamayı yükle</b> seçeneğini kullan.
            </li>
          </ol>
        )}
        <button className="btn full" onClick={onClose}>
          Tamam
        </button>
      </div>
    </div>,
    document.body
  );
}

/**
 * Kart: logo + "Ana ekrana ekle" + "Sonra". `compact` harita üstündeki dar
 * şerit; Profilim'de tam kart.
 */
export function InstallBanner({ compact = false }: { compact?: boolean }) {
  const { hidden, install, dismiss } = useInstallPrompt();
  const [sheet, setSheet] = useState<'ios' | 'manual' | null>(null);
  if (hidden) return null;
  async function onInstall() {
    const r = await install();
    if (r !== 'prompted') setSheet(r);
  }
  return (
    <>
      <div className={`install ${compact ? 'compact' : ''}`}>
        <Logo size={compact ? 28 : 40} />
        <div className="grow">
          <strong>{compact ? 'pati’yi ana ekrana ekle' : 'Uygulama gibi kullan'}</strong>
          {!compact && (
            <div className="muted">
              Ana ekrana ekle: tam ekran açılır, konum ve bildirimler daha iyi çalışır.
            </div>
          )}
        </div>
        <button className="btn small" onClick={onInstall}>
          Ekle
        </button>
        <button className="link" onClick={dismiss} aria-label="Sonra">
          ✕
        </button>
      </div>
      {sheet && <InstallSheet mode={sheet} onClose={() => setSheet(null)} />}
    </>
  );
}
