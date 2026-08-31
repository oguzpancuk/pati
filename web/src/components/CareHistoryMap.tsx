import { useEffect, useRef } from 'react';
import { maplibregl, styleFor } from '../mapSetup';
import { resolvedThemeName } from '../theme';
import type { MyCareAction } from '../api';

// The same stroke icons as the history rows once used; static markup, no
// user data (safe for innerHTML).
function careIconSvg(type: 'food' | 'water') {
  const shape =
    type === 'food'
      ? '<path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0Z"/><path d="M7.5 8.5c0-1.4 1-1.9 1-2.9M12 8.5c0-1.4 1-1.9 1-2.9M16.5 8.5c0-1.4 1-1.9 1-2.9"/>'
      : '<path d="M12 3.4s6.2 6.5 6.2 10.2a6.2 6.2 0 0 1-12.4 0C5.8 9.9 12 3.4 12 3.4Z"/>';
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="1.8" stroke-linecap="round">${shape}</svg>`;
}

/**
 * The profile's drop history as a map (owner decision, 2026-08-31): every
 * drop is a tappable marker; the parent shows the date/delete popup on
 * select. Fits its camera to all markers; a single spot gets a street-scale
 * center instead (a zero-size bounds box over-zooms).
 */
export function CareHistoryMap({
  actions,
  onSelect,
  height = 200,
}: {
  actions: MyCareAction[];
  onSelect: (action: MyCareAction) => void;
  height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  // Refs so the one-time map effect and the marker sync never go stale.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!el.current || mapRef.current) return;
    let map: maplibregl.Map | null = null;
    // Same StrictMode double-mount deferral as MiniMap/MapPage.
    const frame = requestAnimationFrame(() => {
      if (!el.current) return;
      map = new maplibregl.Map({
        container: el.current,
        style: styleFor(resolvedThemeName()),
        center: [29.0277, 40.9905],
        zoom: 12,
        pitchWithRotate: false,
        dragRotate: false,
        // Attribution renders as the caption below, like MiniMap.
        attributionControl: false,
      });
      mapRef.current = map;
    });
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

  // Markers follow the data; the map itself is built once above. Polling
  // until the deferred map exists keeps the first sync from racing it.
  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      if (cancelled) return;
      const map = mapRef.current;
      if (!map) {
        requestAnimationFrame(sync);
        return;
      }
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = actions.map((action) => {
        const [lng, lat] = action.location.coordinates;
        const dot = document.createElement('button');
        dot.className = 'care-history-marker';
        dot.setAttribute('aria-label', action.action_type === 'food' ? 'Mama kaydı' : 'Su kaydı');
        dot.innerHTML = careIconSvg(action.action_type);
        dot.addEventListener('click', () => onSelectRef.current(action));
        return new maplibregl.Marker({ element: dot }).setLngLat([lng, lat]).addTo(map);
      });
      if (actions.length === 1) {
        map.jumpTo({ center: actions[0].location.coordinates, zoom: 15 });
      } else if (actions.length > 1) {
        const bounds = new maplibregl.LngLatBounds();
        for (const action of actions) bounds.extend(action.location.coordinates);
        map.fitBounds(bounds, { padding: 32, duration: 0, maxZoom: 16 });
      }
    };
    sync();
    return () => {
      cancelled = true;
    };
  }, [actions]);

  return (
    <div>
      <div style={{ position: 'relative', height, borderRadius: 16, overflow: 'hidden' }}>
        <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      </div>
      <div className="subtle" style={{ fontSize: 10.5, marginTop: 4, textAlign: 'right' }}>
        © OpenStreetMap katkıda bulunanları · OpenFreeMap
      </div>
    </div>
  );
}
