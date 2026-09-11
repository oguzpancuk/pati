import { Link } from 'react-router-dom';
import type { ThemeMode } from '../../theme';
import { Sheet } from './Sheet';

const THEME_OPTIONS: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'sistem' },
  { key: 'light', label: 'açık' },
  { key: 'dark', label: 'koyu' },
];

/**
 * The settings that used to be scattered down the profile, gathered behind
 * the gear (owner, 2026-09-11). Order is the owner's: görünüm, demo
 * verileri, then the account block below a hairline.
 */
export function SettingsSheet({
  open,
  onClose,
  theme,
  onSelectTheme,
  showDemo,
  demoBusy,
  onToggleDemo,
  onLogout,
  deleteAccount,
}: {
  open: boolean;
  onClose: () => void;
  theme: ThemeMode;
  onSelectTheme: (mode: ThemeMode) => void;
  /** `false` means the showcase world is hidden; absent means on. */
  showDemo: boolean;
  demoBusy: boolean;
  onToggleDemo: () => void;
  onLogout: () => void;
  /** The account-deletion link with its own dialog, owned by the page. */
  deleteAccount: React.ReactNode;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Ayarlar">
      <div className="label">görünüm</div>
      <div className="segmented">
        {THEME_OPTIONS.map((o) => (
          <button
            key={o.key}
            className={`chip ${theme === o.key ? 'selected' : ''}`}
            onClick={() => onSelectTheme(o.key)}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* The showcase (demo) world is each person's own choice (owner,
          2026-09-09): on by default so a new user finds a neighbourhood in
          use, off with one tap when the tour is over. */}
      <div className="label">demo verileri</div>
      <div className="row" style={{ gap: 12 }}>
        <div className="grow">
          <strong>Demo verileri</strong>
          <div className="subtle">
            {showDemo
              ? 'Örnek mahalleler haritada ve listelerde görünüyor.'
              : 'Sadece gerçek kayıtlar görünüyor.'}
          </div>
        </div>
        {/* "görünüyor / gizli", not "açık / kapalı": the theme chips sit
            directly above and one of THEM is called "açık" (light) — same
            word, different meaning (QA). */}
        <button
          className={`chip ${showDemo ? 'selected' : ''}`}
          disabled={demoBusy}
          onClick={onToggleDemo}
        >
          {showDemo ? 'görünüyor' : 'gizli'}
        </button>
      </div>

      <div className="hairline" />

      {/* TODO(main): mount ChangePassword here — track Ş ships the
          "şifremi değiştir" form as a self-contained component. */}

      <div className="subtle" style={{ textAlign: 'center' }}>
        {/* `replace` consumes the sheet's own history entry, so one back
            press from the legal page returns to a clean profile. */}
        <Link to="/gizlilik" replace className="subtle" onClick={onClose}>
          gizlilik (kvkk)
        </Link>
        {' · '}
        <Link to="/kosullar" replace className="subtle" onClick={onClose}>
          kullanım koşulları
        </Link>
      </div>

      <button className="textlink" onClick={onLogout}>
        çıkış yap
      </button>

      {deleteAccount}

      {/* TODO(main): mount the map attribution line here — item 15 takes the
          OpenStreetMap credit off the map and into this sheet. */}
    </Sheet>
  );
}
