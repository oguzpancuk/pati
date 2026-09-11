import { useEffect, useRef } from 'react';
import { CloseIcon } from './icons';

/**
 * The sheets open at the moment, in open order. A back press or Escape
 * closes only the topmost one — nested sheets (a care-history group opening
 * a record's detail) would otherwise all close at once.
 */
const openSheets: { close: () => void }[] = [];

/**
 * Per DESIGN.md §8 point 3 a sheet is not a page: Escape closes it, and the
 * browser's back button closes it instead of leaving the page. Opening a
 * sheet pushes one history entry; closing it from inside takes that entry
 * back out, so one back press never lands on the same page twice.
 *
 * A link inside a sheet should navigate with `replace: true` — that consumes
 * the sheet's own entry, which is exactly what should disappear.
 */
export function useSheetDismiss(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const entry = { close: () => closeRef.current() };
    openSheets.push(entry);
    const depth = openSheets.length;
    // The router's own state fields are carried over: react-router tracks its
    // history index in `state.idx`, and dropping it confuses its back/forward
    // bookkeeping.
    window.history.pushState({ ...window.history.state, patiSheet: depth }, '');

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (openSheets[openSheets.length - 1] !== entry) return;
      entry.close();
    };
    const onPop = () => {
      if (openSheets[openSheets.length - 1] !== entry) return;
      openSheets.pop();
      entry.close();
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPop);

    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
      const index = openSheets.indexOf(entry);
      // Gone already: the back button consumed both the entry and the sheet.
      if (index < 0) return;
      openSheets.splice(index, 1);
      const state = window.history.state as { patiSheet?: number } | null;
      // Only when our own entry is still the current one — a navigation out
      // of the sheet has already replaced it.
      if (state?.patiSheet === depth) window.history.back();
    };
  }, [open]);
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
  useSheetDismiss(open, onClose);
  if (!open) return null;
  return (
    <div className="backdrop" onClick={onClose} role="presentation">
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
          <button className="profile-sheet-close" onClick={onClose} aria-label="Kapat">
            <CloseIcon />
          </button>
        </div>
        <div className="profile-sheet-body">{children}</div>
      </div>
    </div>
  );
}
