import { useEffect, useRef, useState } from 'react';
import { MiniMap } from './MiniMap';
import { AnimalAvatar } from '../avatars';
import '../styles/animal.css';

/** Marks the history entry this sheet pushes, so only its own pop closes it. */
const SHEET_STATE = 'animalLocation';

/** Is the entry the browser is standing on the one the sheet pushed? */
function onSheetEntry(): boolean {
  return (window.history.state as { patiSheet?: string } | null)?.patiSheet === SHEET_STATE;
}

/**
 * "En son görüldüğü yer" as a real map (demo item 8): the page keeps the
 * static thumbnail as the affordance, and a click brings the same spot up
 * in a sheet you can pan and zoom. Clicking the marker reveals when the
 * location was last updated — the date comes in already formatted, so the
 * sheet and the page can never print it differently.
 *
 * A sheet is not a page (DESIGN §8): the backdrop, Escape and the browser's
 * back button all close it and leave the animal profile where it was. Back
 * works because opening pushes a history entry; closing any other way pops
 * that entry again so the page's own back still leaves the page.
 *
 * Forward is the other half of that: a popped entry stays in the forward
 * stack, so landing back ON the sheet's entry has to reopen the sheet.
 * Without it (review finding) Forward re-entered an identical-looking page
 * and the next Back appeared to do nothing at all.
 */
export function AnimalLocationDialog({
  open,
  onOpen,
  onClose,
  species,
  breed,
  photoUrl,
  lat,
  lng,
  updatedAtLabel,
}: {
  open: boolean;
  /** Called when a pop lands back on the sheet's own history entry. */
  onOpen: () => void;
  onClose: () => void;
  species: 'cat' | 'dog';
  breed: string | null;
  photoUrl?: string | null;
  lat: number;
  lng: number;
  /** Already formatted by the page, e.g. "5 Eyl 14:30". */
  updatedAtLabel: string;
}) {
  const [dateShown, setDateShown] = useState(false);
  // The effects below must not re-run when a callback's identity changes.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  // Always listening, open or not: whether a pop opens or closes the sheet
  // is decided by the entry it lands on, and the entry the sheet pushed
  // survives in the forward stack after it is popped.
  useEffect(() => {
    const onPop = () => {
      if (onSheetEntry()) openRef.current();
      else closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    setDateShown(false);
    // Reopened by a Forward into the entry we already pushed: it is the
    // current one, so pushing again would bury it and cost the user a
    // second Back. Otherwise: safe under StrictMode's double-invoke, since
    // this component stays mounted with open=false and the setup only ever
    // runs on the open transition. React Router's own state (its `idx`
    // bookkeeping) is carried over — the entry is the same URL, only
    // flagged.
    if (!onSheetEntry()) {
      window.history.pushState(
        { ...(window.history.state as object | null), patiSheet: SHEET_STATE },
        ''
      );
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // Closed by Escape, Kapat or the backdrop: our entry is still the
      // current one and has to go, or the user's next "back" would only
      // undo the sheet they already closed. Closed BY back: the entry is
      // behind us already.
      if (onSheetEntry()) window.history.back();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="backdrop" onClick={() => onClose()}>
      <div
        className="sheet animal-location-sheet"
        role="dialog"
        aria-label="En son görüldüğü yer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <h2>En son görüldüğü yer</h2>
        <p className="muted animal-location-lead">
          Haritayı kaydırıp yakınlaştırabilirsin. Tarihi görmek için işarete tıkla.
        </p>
        <MiniMap
          lat={lat}
          lng={lng}
          // The sheet must fit a landscape phone without the map pushing
          // "Kapat" past its 86% cap.
          height="min(320px, 45vh)"
          zoom={16}
          interactive
          markerLabel="Son güncelleme tarihini göster"
          onMarkerClick={() => setDateShown((shown) => !shown)}
        >
          {/* The callout is absolutely positioned so the marker element's own
              box stays the avatar's size — otherwise showing the date would
              grow it and slide the avatar off the spot. */}
          <span className="animal-location-marker">
            {dateShown && <span className="animal-location-callout">{updatedAtLabel}</span>}
            <AnimalAvatar species={species} breed={breed} photoUrl={photoUrl} size={38} />
          </span>
        </MiniMap>
        <button className="btn full animal-location-close" onClick={() => onClose()}>
          Kapat
        </button>
      </div>
    </div>
  );
}
