import { Link } from 'react-router-dom';
import { MAP_ATTRIBUTION, MAP_ATTRIBUTION_LABEL } from '@mobile/map/attribution';
import type { ThemeMode } from '../../theme';
import { Sheet, useSheetExit } from './Sheet';

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
  changePassword,
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
  /** Track Ş's ChangePasswordForm; the page owns `me` and the reload. */
  changePassword: React.ReactNode;
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
          {/* No heading of its own: the label above already names the
              section, and the two together read as the words repeating
              (mobile parity). */}
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

      {changePassword}

      <div className="hairline" />

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

      <LogoutLink onLogout={onLogout} />

      {deleteAccount}

      {/* The basemap credit, off every map and onto the last line of this
          sheet (owner, demo note 15). ODbL wants it discoverable, so one
          level deeper is as far as it goes — a scroll, never another tap.
          Both clients read the same two strings from @mobile/map/attribution. */}
      <div className="hairline" />
      <div className="label" style={{ marginTop: 0 }}>
        {MAP_ATTRIBUTION_LABEL}
      </div>
      <div className="subtle">{MAP_ATTRIBUTION}</div>
    </Sheet>
  );
}

/**
 * Signing out swaps the whole route element, so the sheet vanishes without
 * ever reaching its own dismissal and the history entry it pushed is stranded:
 * the user's first Back press afterwards does nothing at all. The way out is
 * taken first, then the logout (review finding).
 */
function LogoutLink({ onLogout }: { onLogout: () => void }) {
  const exitSheet = useSheetExit();
  return (
    <button
      className="textlink"
      onClick={() => {
        exitSheet?.();
        onLogout();
      }}
    >
      çıkış yap
    </button>
  );
}
