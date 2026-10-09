import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// The worker workaround web/src/mapSetup.ts explains: without the explicit
// worker entry, Vite's pre-bundle 404s the worker and the map draws only its
// background, with no error anywhere.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
// The basemap all three clients draw (generated, ADR-0002) and the pin the
// public map shows, so the admin places exactly what visitors will see.
import patiLight from '../../../mobile/src/map/styles/pati-light.json';
import { petshopMarkerSvg } from '../../../mobile/src/map/petshopMarker';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

export type LatLng = { lat: number; lng: number };

// Istanbul at city scale until a spot is chosen: most listings will be there.
const START_CENTER: [number, number] = [28.979, 41.015];
const START_ZOOM = 10;
const PLACED_ZOOM = 16;

/** Five decimals is about a metre: finer than any tap can aim. */
function rounded(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

/**
 * Pick a shop's location on the map (owner, 2026-10-09): a click places the
 * pin, and the pin can be dragged to correct it. The typed "enlem, boylam"
 * field stays beside it and both edit the same value, so a pasted Google
 * Maps link moves the pin, and a placed pin rewrites the field.
 */
export default function LocationPicker({
  value,
  onPick,
}: {
  value: LatLng | null;
  onPick: (at: LatLng) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  // The map's listeners are bound once; the latest callback is read here.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    if (!el.current) return;
    const map = new maplibregl.Map({
      container: el.current,
      // why: the generated JSON is a valid style; TS sees only its literal type.
      style: patiLight as unknown as maplibregl.StyleSpecification,
      center: value ? [value.lng, value.lat] : START_CENTER,
      zoom: value ? PLACED_ZOOM : START_ZOOM,
      maxZoom: 19,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('click', (e) => {
      // A click on the pin itself is the start of a drag, not a new spot.
      const target = e.originalEvent.target;
      if (target instanceof Element && target.closest('.location-picker-pin')) return;
      onPickRef.current({ lat: rounded(e.lngLat.lat), lng: rounded(e.lngLat.lng) });
    });
    mapRef.current = map;
    return () => {
      markerRef.current = null;
      mapRef.current = null;
      map.remove();
    };
    // The map is built once; `value` is followed by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the value, whichever side changed it: place or move the pin, and
  // bring it into view when it is off screen (a pasted link far away).
  const lat = value?.lat;
  const lng = value?.lng;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lat === undefined || lng === undefined) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const pin = document.createElement('div');
      pin.className = 'location-picker-pin';
      pin.innerHTML = petshopMarkerSvg('light');
      markerRef.current = new maplibregl.Marker({ element: pin, anchor: 'bottom', draggable: true })
        .setLngLat([lng, lat])
        .addTo(map);
      markerRef.current.on('dragend', () => {
        const at = markerRef.current?.getLngLat();
        if (at) onPickRef.current({ lat: rounded(at.lat), lng: rounded(at.lng) });
      });
    } else {
      markerRef.current.setLngLat([lng, lat]);
    }
    if (!map.getBounds().contains([lng, lat])) {
      map.jumpTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), PLACED_ZOOM) });
    }
  }, [lat, lng]);

  return (
    <div
      ref={el}
      className="location-picker"
      role="application"
      aria-label="Konum seçmek için haritaya tıklayın"
    />
  );
}
