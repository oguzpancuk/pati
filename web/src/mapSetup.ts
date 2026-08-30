import * as maplibregl from 'maplibre-gl';
// maplibre resolves its worker as `new URL('maplibre-gl-worker.mjs',
// import.meta.url)`, which breaks once Vite pre-bundles the package (the
// worker file 404s and the map silently renders only its background — no
// error anywhere). Handing Vite the worker entry explicitly makes it bundle
// the worker with its imports in both dev and prod. Hoisted here once the
// second map component appeared — every map must import from this module,
// never repeat the workaround.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import patiLight from '@mobile/map/styles/pati-light.json';
import patiDark from '@mobile/map/styles/pati-dark.json';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

// The generated JSONs are structurally valid MapLibre styles; TS can't see
// that through the literal JSON type, hence the cast.
export const styleFor = (name: 'light' | 'dark') =>
  (name === 'dark' ? patiDark : patiLight) as unknown as maplibregl.StyleSpecification;

export { maplibregl };
