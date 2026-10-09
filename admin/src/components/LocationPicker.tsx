import { useEffect, useId, useRef } from 'react';
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
 * A spot from the map, folded back into ±180: after a pan past the
 * antimeridian the engine reports 388.979, which the server refuses with a
 * reason the admin cannot see (review finding).
 */
function picked(at: maplibregl.LngLat): LatLng {
  const w = at.wrap();
  return { lat: rounded(w.lat), lng: rounded(w.lng) };
}

/**
 * Only a real coordinate reaches the engine: MapLibre throws on a latitude
 * past ±90, and a throw in an effect unmounts the whole admin. A typo like
 * "409.875" leaves the map as it was; the save still goes to the server,
 * whose Turkish 400 names the problem (review finding).
 */
function onEarth(value: LatLng | null): LatLng | null {
  if (!value || !Number.isFinite(value.lat) || !Number.isFinite(value.lng)) return null;
  return Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180 ? value : null;
}

// How long typing must pause before the map follows the field: typing
// "29.027" passes through "2", in the Sahara (review finding).
const FOLLOW_DELAY_MS = 400;

const CIRCLE_SOURCE = 'location-picker-circle';
const METERS_PER_DEGREE_LAT = 111_320;

/**
 * A circle of `meters` around a point as a polygon, for an ad's target area.
 * Degrees of longitude shrink with the latitude; at the sizes an ad may have
 * (100 m to 200 km) the flat approximation is within the line's width.
 */
function circleRing(at: LatLng, meters: number): [number, number][] {
  const dLat = meters / METERS_PER_DEGREE_LAT;
  const dLng = dLat / Math.cos((at.lat * Math.PI) / 180);
  const ring: [number, number][] = [];
  for (let i = 0; i <= 128; i++) {
    const t = (i / 128) * 2 * Math.PI;
    ring.push([at.lng + dLng * Math.cos(t), at.lat + dLat * Math.sin(t)]);
  }
  return ring;
}

function circleBounds(at: LatLng, meters: number): maplibregl.LngLatBoundsLike {
  const dLat = meters / METERS_PER_DEGREE_LAT;
  const dLng = dLat / Math.cos((at.lat * Math.PI) / 180);
  return [
    [at.lng - dLng, at.lat - dLat],
    [at.lng + dLng, at.lat + dLat],
  ];
}

function circleData(at: LatLng | null, meters: number | null | undefined) {
  return {
    type: 'FeatureCollection' as const,
    features:
      at && meters
        ? [
            {
              type: 'Feature' as const,
              properties: {},
              geometry: { type: 'Polygon' as const, coordinates: [circleRing(at, meters)] },
            },
          ]
        : [],
  };
}

/**
 * Pick a shop's location on the map (owner, 2026-10-09): a click places the
 * pin, and the pin can be dragged to correct it. The typed "enlem, boylam"
 * field stays beside it and both edit the same value, so a pasted Google
 * Maps link moves the pin, and a placed pin rewrites the field.
 *
 * With `radiusMeters` it picks the centre of an ad's target area (same day):
 * the circle is drawn around the pin, follows the radius field, and the
 * view widens to show all of it.
 */
export default function LocationPicker({
  value,
  onPick,
  radiusMeters,
}: {
  value: LatLng | null;
  onPick: (at: LatLng) => void;
  radiusMeters?: number | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  // The map's listeners are bound once; the latest callback is read here.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  // The circle as last drawn, for a style that finishes loading after it.
  const circleRef = useRef(circleData(null, null));
  // The pin's gradient is defined inside its own SVG; a per-instance id keeps
  // two pins on one page from sharing (and losing) one definition.
  const pinId = useId().replace(/:/g, '');
  const start = onEarth(value);

  useEffect(() => {
    if (!el.current) return;
    const map = new maplibregl.Map({
      container: el.current,
      // why: the generated JSON is a valid style; TS sees only its literal type.
      style: patiLight as unknown as maplibregl.StyleSpecification,
      center: start ? [start.lng, start.lat] : START_CENTER,
      zoom: start ? PLACED_ZOOM : START_ZOOM,
      ...(start && radiusMeters
        ? { bounds: circleBounds(start, radiusMeters), fitBoundsOptions: { padding: 24 } }
        : {}),
      maxZoom: 19,
      attributionControl: { compact: true },
    });
    map.on('load', () => {
      // The theme's own colour, so the circle matches the form around it.
      const color =
        getComputedStyle(document.documentElement).getPropertyValue('--moss').trim() || '#2f6b4f';
      map.addSource(CIRCLE_SOURCE, { type: 'geojson', data: circleRef.current });
      map.addLayer({
        id: `${CIRCLE_SOURCE}-fill`,
        type: 'fill',
        source: CIRCLE_SOURCE,
        paint: { 'fill-color': color, 'fill-opacity': 0.12 },
      });
      map.addLayer({
        id: `${CIRCLE_SOURCE}-line`,
        type: 'line',
        source: CIRCLE_SOURCE,
        paint: { 'line-color': color, 'line-width': 2 },
      });
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('click', (e) => {
      // A click on the pin itself is the start of a drag, not a new spot.
      const target = e.originalEvent.target;
      if (target instanceof Element && target.closest('.location-picker-pin')) return;
      onPickRef.current(picked(e.lngLat));
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
  const shown = onEarth(value);
  const lat = shown?.lat;
  const lng = shown?.lng;
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
      pin.innerHTML = petshopMarkerSvg('light', pinId);
      markerRef.current = new maplibregl.Marker({ element: pin, anchor: 'bottom', draggable: true })
        .setLngLat([lng, lat])
        .addTo(map);
      markerRef.current.on('dragend', () => {
        const at = markerRef.current?.getLngLat();
        if (at) onPickRef.current(picked(at));
      });
    } else {
      markerRef.current.setLngLat([lng, lat]);
    }
    // The pin moves at once (off screen, a half-typed value is invisible);
    // the view follows only once typing pauses.
    const follow = window.setTimeout(() => {
      if (radiusMeters) {
        const area = circleBounds({ lat, lng }, radiusMeters);
        const view = map.getBounds();
        const [[west, south], [east, north]] = area as [[number, number], [number, number]];
        if (!view.contains([west, south]) || !view.contains([east, north])) {
          map.fitBounds(area, { padding: 24, maxZoom: PLACED_ZOOM });
        }
      } else if (!map.getBounds().contains([lng, lat])) {
        map.jumpTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), PLACED_ZOOM) });
      }
    }, FOLLOW_DELAY_MS);
    return () => window.clearTimeout(follow);
  }, [lat, lng, pinId, radiusMeters]);

  // The target circle, redrawn as the pin or the radius changes. Before the
  // style has loaded, the load handler above draws what is kept here.
  useEffect(() => {
    circleRef.current = circleData(
      lat !== undefined && lng !== undefined ? { lat, lng } : null,
      radiusMeters
    );
    const source = mapRef.current?.getSource(CIRCLE_SOURCE) as maplibregl.GeoJSONSource | undefined;
    source?.setData(circleRef.current);
  }, [lat, lng, radiusMeters]);

  return (
    <div
      ref={el}
      className="location-picker"
      role="application"
      aria-label="Konum seçmek için haritaya tıklayın"
    />
  );
}
