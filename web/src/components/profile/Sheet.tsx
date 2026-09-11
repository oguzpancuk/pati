import { useCallback, useEffect, useRef } from 'react';
import { CloseIcon } from './icons';

type SheetEntry = {
  /** Whether this sheet added a history entry of its own. */
  owns: boolean;
  /** Set the moment the way out is taken, before the browser answers. */
  closing: boolean;
  close: () => void;
};

/**
 * The sheets open at the moment, in open order. Escape closes the topmost
 * one; a back press closes the topmost sheet that owns a history entry, and
 * anything stacked above it — a popup over a sheet goes with the sheet
 * rather than leaving a history entry nobody can consume.
 */
const openSheets: SheetEntry[] = [];
let nextSheetId = 0;

function closeDownTo(index: number) {
  // Top first, so a popup over a sheet disappears before the sheet does.
  const removed = openSheets.splice(index);
  for (let i = removed.length - 1; i >= 0; i -= 1) removed[i].close();
}

/** The topmost sheet that has a history entry to give back, or -1. */
function topOwningIndex() {
  for (let i = openSheets.length - 1; i >= 0; i -= 1) if (openSheets[i].owns) return i;
  return -1;
}

/**
 * Per DESIGN.md §8 point 3 a sheet is not a page: Escape closes it, and the
 * browser's back button closes it instead of leaving the page. A sheet adds
 * one history entry when it opens and gives it back when it closes, so one
 * back press never lands on the same page twice.
 *
 * Returns the way out to wire to the close button and the backdrop: it hands
 * the history entry back, and the resulting popstate is what closes the
 * sheet. A link inside a sheet should navigate with `replace: true` instead
 * — that consumes the same entry.
 *
 * Popups nested inside a sheet pass `history: false`: they close on Escape
 * and on their own buttons, and a back press closes them together with the
 * sheet they sit on.
 */
export function useSheetDismiss(open: boolean, onClose: () => void, history = true) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Stable across StrictMode's double-invoked effects, which is what lets the
  // second run recognise the entry the first run already pushed.
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = ++nextSheetId;
  const id = idRef.current;
  // The way out, filled by the effect while the sheet is open.
  const dismissRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!open) return;
    const entry: SheetEntry = { owns: history, closing: false, close: () => closeRef.current() };
    openSheets.push(entry);
    if (history && (window.history.state as { patiSheet?: number } | null)?.patiSheet !== id) {
      // The router's own state fields are carried over: react-router tracks
      // its history index in `state.idx`, and dropping it confuses its
      // back/forward bookkeeping.
      window.history.pushState({ ...window.history.state, patiSheet: id }, '');
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (openSheets[openSheets.length - 1] !== entry) return;
      dismiss();
    };
    const onPop = () => {
      const index = topOwningIndex();
      if (index < 0 || openSheets[index] !== entry) return;
      closeDownTo(index);
    };
    const dismiss = () => {
      const index = openSheets.indexOf(entry);
      // `closing` guards the gap before popstate arrives: a held Escape key
      // repeats, and each repeat would give back one more history entry —
      // the second one belonging to the page, not to a sheet.
      if (index < 0 || entry.closing) return;
      entry.closing = true;
      // An owned entry is given back to the browser; the popstate that
      // follows is what actually closes the sheet.
      if (entry.owns && (window.history.state as { patiSheet?: number } | null)?.patiSheet === id) {
        window.history.back();
        return;
      }
      closeDownTo(index);
    };
    dismissRef.current = dismiss;

    document.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPop);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
      dismissRef.current = null;
      const index = openSheets.indexOf(entry);
      if (index >= 0) openSheets.splice(index, 1);
    };
  }, [open, history, id]);

  return useCallback(() => {
    if (dismissRef.current) dismissRef.current();
    else closeRef.current();
  }, []);
}

export function Sheet({
  open,
  onClose,
  title,
  action,
  fill = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The link on the right of the sheet header (e.g. "arkadaş bul"). */
  action?: React.ReactNode;
  /** Give the sheet a tall, fixed body — for a list that scrolls itself. */
  fill?: boolean;
  children: React.ReactNode;
}) {
  const dismiss = useSheetDismiss(open, onClose);
  if (!open) return null;
  return (
    <div className="backdrop" onClick={dismiss} role="presentation">
      <div
        className={`sheet profile-sheet${fill ? ' fill' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="profile-sheet-head">
          <h2>{title}</h2>
          {action}
          <button className="profile-sheet-close" onClick={dismiss} aria-label="Kapat">
            <CloseIcon />
          </button>
        </div>
        <div className="profile-sheet-body">{children}</div>
      </div>
    </div>
  );
}
