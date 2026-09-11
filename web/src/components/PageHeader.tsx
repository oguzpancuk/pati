import type { ReactNode } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import { sheetEntriesPushed } from './profile/Sheet';

/**
 * Is there an entry of OUR OWN behind the one the browser is standing on?
 *
 * `history.length` cannot answer that: it counts the whole tab, entries from
 * before pati was opened included, and an installed PWA starts a session
 * where the number means something else again. React Router keeps its own
 * position in `history.state.idx` — 0 on the entry the app was loaded on, one
 * higher for every navigation it pushes (@remix-run/router's
 * `getUrlBasedHistory`) — so `idx > 0` is exactly "the app itself put
 * something behind us". It survives a reload, because `history.state` does,
 * and the sheets that push raw entries carry it over deliberately.
 *
 * No stamp at all means we cannot prove there is one, and the fallback root
 * is then the safe answer: a back button that goes one level up is a small
 * surprise, one that does nothing at all is the dead end DESIGN §8 is about.
 */
function hasAppHistory(): boolean {
  const idx = (window.history.state as { idx?: number | null } | null)?.idx;
  if (typeof idx === 'number' && idx > 0) return true;
  // `idx` undercounts by design: a sheet pushes its entry with the router's
  // state carried over unchanged, and a link inside a sheet then navigates
  // with `replace`. Both leave `idx` where it was while the browser really
  // does have our profile behind us, so the sheets keep their own tally.
  return sheetEntriesPushed() > 0;
}

/**
 * Back, as DESIGN §8 defines it: the previous page, whatever it was — a user
 * profile opened from an animal returns to that animal, never to a friends
 * list. `fallback` is only for the page that has no previous page: a shared
 * link, a PWA cold start, a typed URL. Reached that way the fallback replaces
 * the current entry rather than stacking on it, because it IS the root this
 * visit started from.
 */
export function goBack(navigate: NavigateFunction, fallback: string): void {
  if (hasAppHistory()) navigate(-1);
  else navigate(fallback, { replace: true });
}

/** `goBack` bound to this page's fallback, for a back control outside the header. */
export function useGoBack(fallback: string): () => void {
  const navigate = useNavigate();
  return () => goBack(navigate, fallback);
}

function BackIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </svg>
  );
}

/**
 * The web client's one page header (DESIGN §8): back on the left, the title
 * centred, an optional control on the right. Every page that is not a tab
 * root wears it, so the way out is the same shape in the same place — the
 * three different answers this replaced (two different glyphs and a "‹ Geri"
 * text link, plus two pages with no way back at all) were the owner's first
 * demo note.
 *
 * The four tab roots carry NO header: there is nothing behind them.
 */
export function PageHeader({
  title,
  action,
  fallback = '/',
  className,
  children,
}: {
  /** The centred micro label; omit it and pass `children` for a richer block. */
  title?: string;
  /** The control on the right of the bar (a link, a menu). */
  action?: ReactNode;
  /** Where back goes when this page was opened with no history behind it. */
  fallback?: string;
  /** Extra class on the bar — the conversation page has its own metrics. */
  className?: string;
  /** A title block that replaces the label (a name over a member count). */
  children?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className={className ? `topbar ${className}` : 'topbar'}>
      <button
        type="button"
        className="back"
        aria-label="Geri"
        onClick={() => goBack(navigate, fallback)}
      >
        <BackIcon />
      </button>
      {children ?? <div className="micro">{title}</div>}
      {action ?? <span />}
    </div>
  );
}
