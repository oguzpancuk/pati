import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { maplibregl, styleFor } from '../mapSetup';
import { resolvedThemeName } from '../theme';

/**
 * A one-spot map, in two shapes.
 *
 * Static (the default): the animal profile's "last seen" thumbnail — mobile
 * parity. The marker is not a maplibre marker; the map cannot move, so the
 * caller's child is simply overlaid at the center.
 *
 * Interactive (`interactive`): the same spot inside the location sheet
 * (demo item 8), pannable and zoomable. A map that moves needs a marker
 * that moves with it, so the child is portaled into a real maplibre marker
 * — and can be given a click.
 *
 * Callers must pass a `key` when the spot can change under the same mounted
 * component (e.g. key={animal.id}) — the map is built once and does not
 * recenter.
 */
export function MiniMap({
  lat,
  lng,
  height = 160,
  zoom = 15.5,
  interactive = false,
  onOpen,
  openLabel,
  openHint,
  markerLabel,
  onMarkerClick,
  children,
}: {
  lat: number;
  lng: number;
  /** A number of px, or any CSS length — the sheet caps its map against the viewport. */
  height?: number | string;
  zoom?: number;
  /** Pan and zoom. Off for the thumbnail, on inside the sheet. */
  interactive?: boolean;
  /** Makes the (static) map box a button — the thumbnail's "open the sheet". */
  onOpen?: () => void;
  openLabel?: string;
  /** The pill drawn on the map to say the box opens (mobile parity). */
  openHint?: string;
  markerLabel?: string;
  /** Interactive maps only: the marker becomes a button. */
  onMarkerClick?: () => void;
  children?: React.ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // One element for the lifetime of the component: maplibre owns its
  // position, React owns what is inside it (through the portal below).
  const [markerHost] = useState<HTMLButtonElement | null>(() => {
    if (!interactive) return null;
    const host = document.createElement('button');
    host.type = 'button';
    host.className = 'minimap-marker';
    return host;
  });
  // A ref so the listener never goes stale without re-creating the element.
  const markerClick = useRef(onMarkerClick);
  markerClick.current = onMarkerClick;

  useEffect(() => {
    if (!markerHost) return undefined;
    if (markerLabel) markerHost.setAttribute('aria-label', markerLabel);
    const onClick = () => markerClick.current?.();
    markerHost.addEventListener('click', onClick);
    return () => markerHost.removeEventListener('click', onClick);
  }, [markerHost, markerLabel]);

  useEffect(() => {
    if (!el.current || mapRef.current) return;
    let map: maplibregl.Map | null = null;
    // Deferred one frame for the same StrictMode double-mount reason as
    // MapPage: create/remove/create in one tick leaves the second map's
    // style permanently unparsed (maplibre-gl 6.6.0).
    const frame = requestAnimationFrame(() => {
      if (!el.current) return;
      map = new maplibregl.Map({
        container: el.current,
        style: styleFor(resolvedThemeName()),
        center: [lng, lat],
        zoom,
        interactive,
        // North stays up: a rotated basemap is disorienting at this size.
        dragRotate: false,
        pitchWithRotate: false,
        // The on-map control covered half the thumbnail; the required OSM
        // attribution renders as a caption below the map instead.
        attributionControl: false,
      });
      mapRef.current = map;
      if (markerHost) {
        new maplibregl.Marker({ element: markerHost }).setLngLat([lng, lat]).addTo(map);
      }
    });
    // The OS can flip light/dark while the profile is open; keep the
    // thumbnail's basemap in step with the page CSS (same as MapPage).
    const scheme = matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => mapRef.current?.setStyle(styleFor(resolvedThemeName()));
    scheme.addEventListener('change', onScheme);
    return () => {
      cancelAnimationFrame(frame);
      scheme.removeEventListener('change', onScheme);
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const box = (
    <div style={{ position: 'relative', height, borderRadius: 16, overflow: 'hidden' }}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      {markerHost
        ? createPortal(children, markerHost)
        : children && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }}
            >
              {children}
            </div>
          )}
      {/* The label already reaches a screen reader through the button's
          aria-label; the pill is the visible half of the same hint. */}
      {openHint && (
        <span className="minimap-hint" aria-hidden="true">
          {openHint}
        </span>
      )}
    </div>
  );

  return (
    <div>
      {onOpen ? (
        <button type="button" className="minimap-open" aria-label={openLabel} onClick={onOpen}>
          {box}
        </button>
      ) : (
        box
      )}
      {/* Kept outside the button on purpose: the attribution is a credit,
          not part of the control. */}
      <div className="subtle" style={{ fontSize: 10.5, marginTop: 4, textAlign: 'right' }}>
        © OpenStreetMap katkıda bulunanları · OpenFreeMap
      </div>
    </div>
  );
}
