import { useEffect, useRef, useState } from 'react';
import { MiniMap } from './MiniMap';
import { AnimalAvatar } from '../avatars';
import '../styles/animal.css';

/** Marks the history entry this sheet pushes, so only its own pop closes it. */
const SHEET_STATE = 'animalLocation';

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
 */
export function AnimalLocationDialog({
  open,
  onClose,
  species,
  breed,
  photoUrl,
  lat,
  lng,
  updatedAtLabel,
}: {
  open: boolean;
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
  // The effect below must not re-run when the callback identity changes.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    setDateShown(false);
    // Safe under StrictMode's double-invoke: this component stays mounted
    // with open=false, so the setup only ever runs on the open transition.
    // React Router's own state (its `idx` bookkeeping) is carried over —
    // the entry is the same URL, only flagged.
    window.history.pushState(
      { ...(window.history.state as object | null), patiSheet: SHEET_STATE },
      ''
    );
    const onPop = () => closeRef.current();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      // Closed by Escape or the backdrop: our entry is still on the stack
      // and has to go, or the user's next "back" would only undo the sheet
      // they already closed. Closed BY back: the entry is gone already.
      if ((window.history.state as { patiSheet?: string } | null)?.patiSheet === SHEET_STATE) {
        window.history.back();
      }
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
