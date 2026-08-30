import { useEffect, useRef } from 'react';
import { maplibregl, styleFor } from '../mapSetup';
import { resolvedThemeName } from '../theme';

/**
 * A non-interactive one-spot map (the animal profile's "last seen" thumbnail
 * — mobile parity). The marker is not a maplibre marker: the map is static
 * and centered on the spot, so the caller's child (the animal avatar) is
 * simply overlaid at the center. Callers must pass a `key` when the spot can
 * change under the same mounted component (e.g. key={animal.id}) — the map
 * is built once and does not recenter.
 */
export function MiniMap({
  lat,
  lng,
  height = 160,
  zoom = 15.5,
  children,
}: {
  lat: number;
  lng: number;
  height?: number;
  zoom?: number;
  children?: React.ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

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
        interactive: false,
        // The on-map control covered half the thumbnail; the required OSM
        // attribution renders as a caption below the map instead.
        attributionControl: false,
      });
      mapRef.current = map;
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

  return (
    <div>
      <div style={{ position: 'relative', height, borderRadius: 16, overflow: 'hidden' }}>
        <div ref={el} style={{ position: 'absolute', inset: 0 }} />
        {children && (
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
      </div>
      <div className="subtle" style={{ fontSize: 10.5, marginTop: 4, textAlign: 'right' }}>
        © OpenStreetMap katkıda bulunanları · OpenFreeMap
      </div>
    </div>
  );
}
