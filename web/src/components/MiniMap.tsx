import * as maplibregl from 'maplibre-gl';
// Same Vite worker workaround as MapPage (see the comment there): without
// the explicit worker entry the map silently renders only its background.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useRef } from 'react';
import patiLight from '@mobile/map/styles/pati-light.json';
import patiDark from '@mobile/map/styles/pati-dark.json';
import { resolvedThemeName } from '../theme';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const styleFor = (name: 'light' | 'dark') =>
  (name === 'dark' ? patiDark : patiLight) as unknown as maplibregl.StyleSpecification;

/**
 * A non-interactive one-spot map (the animal profile's "last seen" thumbnail
 * — mobile parity). The marker is not a maplibre marker: the map is static
 * and centered on the spot, so the caller's child (the animal avatar) is
 * simply overlaid at the center.
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
    return () => {
      cancelAnimationFrame(frame);
      map?.remove();
      mapRef.current = null;
    };
    // Recentering an existing thumbnail is not needed; the profile refetch
    // remounts the card when the animal changes.
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
