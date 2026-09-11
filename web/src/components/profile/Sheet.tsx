import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { CloseIcon } from './icons';

type SheetEntry = {
  /** Whether this sheet added a history entry of its own. */
  owns: boolean;
  /** Set the moment the way out is taken, before the browser answers. */
  closing: boolean;
  /** Set once the entry has been given back or consumed, so it is counted once. */
  released: boolean;
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

/**
 * How many entries this document pushed that are STILL behind us — pushed
 * when a sheet opens, given back when it closes, and deliberately left
 * counted when a link inside the sheet consumes it with `replace` (there
 * really is a page behind us then). Read by PageHeader's `hasAppHistory`.
 *
 * Counting pushes and never releasing them made the arrow on a deep-linked
 * animal page leave the site once any dialog had been opened and closed
 * (review, 2026-09-11): nothing was behind us, but the counter still said so.
 * Module state, so it resets on reload — the safe direction, since the
 * fallback root is a small surprise and a dead arrow is what §8 is about.
 */
let entriesPushed = 0;

export function sheetEntriesPushed(): number {
  return entriesPushed;
}

/**
 * An entry stops standing behind us exactly once, however it goes: handed
 * back by `dismiss`, handed back by the cleanup, or consumed by the browser
 * travelling backwards over it. The flag is what lets all three call this —
 * counting in only some of them is what left the counter high after a Back
 * press, and a page whose own back arrow then walked off the site.
 */
function releaseEntry(entry: SheetEntry) {
  if (!entry.owns || entry.released) return;
  entry.released = true;
  entriesPushed -= 1;
}

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
  // Read by the cleanup to tell a real close from an effect re-run; set
  // during render, so it is already false when a close's cleanup runs.
  const openRef = useRef(open);
  openRef.current = open;
  // Stable across StrictMode's double-invoked effects, which is what lets the
  // second run recognise the entry the first run already pushed.
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = ++nextSheetId;
  const id = idRef.current;
  // The way out, filled by the effect while the sheet is open.
  const dismissRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!open) return;
    const entry: SheetEntry = {
      owns: history,
      closing: false,
      released: false,
      close: () => closeRef.current(),
    };
    openSheets.push(entry);
    if (history && (window.history.state as { patiSheet?: number } | null)?.patiSheet !== id) {
      // The router's own state fields are carried over: react-router tracks
      // its history index in `state.idx`, and dropping it confuses its
      // back/forward bookkeeping.
      window.history.pushState({ ...window.history.state, patiSheet: id }, '');
      // Counted because react-router's own `state.idx` is NOT incremented by
      // this push (it is carried over so the router's bookkeeping survives),
      // and a link inside a sheet then navigates with `replace`, which does
      // not increment it either. Without this counter a page opened through a
      // sheet from the entry the app loaded on looks to PageHeader like a page
      // with nothing behind it, and its back button goes to the fallback root
      // instead of to the profile the sheet was standing on.
      entriesPushed += 1;
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (openSheets[openSheets.length - 1] !== entry) return;
      dismiss();
    };
    const onPop = () => {
      const index = topOwningIndex();
      if (index < 0 || openSheets[index] !== entry) return;
      // The browser has already travelled over it — by the time this runs
      // `history.state` is the page's again, so the cleanup below cannot
      // recognise the entry as ours. Account for it here or nowhere.
      releaseEntry(entry);
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
        releaseEntry(entry);
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

      // A sheet does NOT only close through `dismiss`. A "Vazgeç" button, a
      // "Tamam", a successful save — all of them just set the state false, and
      // every one of those used to strand the entry this sheet pushed, so the
      // user's next Back press was silently swallowed (review, 2026-09-11:
      // three presses to leave an animal page after two cancels). Requiring
      // every close path in every dialog to route through `dismiss` is a rule
      // nobody can keep; handing the entry back here means the dialog may
      // close however it likes.
      //
      // Three things are NOT a close and must not hand anything back:
      //   - an effect re-run (StrictMode invokes mount/cleanup/mount): `open`
      //     is still true, because a real close has already re-rendered with
      //     it false by the time this runs;
      //   - a dismissal already in flight, which gave the entry back itself;
      //   - unmounting while still open, e.g. a link inside the sheet — the
      //     entry is consumed by that navigation and the page it led to is
      //     genuinely behind us.
      if (openRef.current || entry.closing || !entry.owns) return;
      if ((window.history.state as { patiSheet?: number } | null)?.patiSheet !== id) return;
      releaseEntry(entry);
      window.history.back();
    };
  }, [open, history, id]);

  return useCallback(() => {
    if (dismissRef.current) dismissRef.current();
    else closeRef.current();
  }, []);
}

const SheetDismissContext = createContext<(() => void) | null>(null);

/**
 * The way out of the sheet you are rendered inside, for a control that ends by
 * unmounting the page UNDER the sheet — logging out, deleting the account.
 * Those never reach `dismiss`: the app swaps the route's element, the sheet
 * disappears with its popstate listener, and the history entry it pushed is
 * stranded, so the user's next Back press is silently swallowed and a second
 * one is needed to leave. Take the way out first, then do the thing.
 */
export function useSheetExit() {
  return useContext(SheetDismissContext);
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
        <div className="profile-sheet-body">
          <SheetDismissContext.Provider value={dismiss}>{children}</SheetDismissContext.Provider>
        </div>
      </div>
    </div>
  );
}
