import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Logo } from './brand';

/**
 * The "add to home screen" flow. Two worlds:
 *  - Android/Chrome: the browser fires `beforeinstallprompt`; we stash it,
 *    wire it to the button, and the real install dialog opens.
 *  - iOS Safari: no API; the button opens an instruction page
 *    (Share → Add to Home Screen).
 * Never shown when opened from the home screen (standalone). "Later" hides
 * it for 7 days.
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

/** Instruction page: the steps on iOS (and browsers without the prompt). */
export function InstallSheet({ mode, onClose }: { mode: 'ios' | 'manual'; onClose: () => void }) {
  // Portal: the banner can sit inside a box with its own stacking context
  // (like the map's top layer); unless the page moves to body it gets trapped
  // in that box's z-index and ends up under the map buttons.
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
 * The card: logo + "add to home screen" + "later". `compact` is the narrow
 * strip over the map; the full card lives on the profile page.
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
