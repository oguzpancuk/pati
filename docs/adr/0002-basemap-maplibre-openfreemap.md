# ADR-0002: One brand-styled MapLibre basemap on all three clients

Status: accepted · Date: 2026-08-28

## Context

Until now each client drew a different map: iOS Apple Maps and Android
Google Maps (react-native-maps defaults), web raw OpenStreetMap raster
tiles under Leaflet. The look was inconsistent across platforms, none of it
matched the app's studio-aesthetic palette, and Android required a Google
Maps API key. The product wants one map language: cream ground, hairline
roads, readable street names and POI/building labels, identical everywhere.

## Decision

- **MapLibre GL everywhere**: `@maplibre/maplibre-react-native` **10.4.2**
  on mobile (pinned — the last release supporting React Native's old
  architecture; v11+ requires RN ≥ 0.80 + new architecture, so the pin
  holds until that upgrade), `maplibre-gl` 6.x on web.
- **One generated style, two themes**: `shared/mapstyle/build.mjs` fetches
  OpenFreeMap's `liberty` style and rewrites layer paint colors to the pati
  palette, emitting `mobile/src/map/styles/pati-{light,dark}.json`. The
  outputs are committed (offline, deterministic builds); the script runs
  only when refreshing the base style or palette. The JSONs are generated
  files — never edit them by hand. Web imports them via the `@mobile` alias.
- **Tiles from OpenFreeMap** (tiles.openfreemap.org): free, no API key, no
  request limits, commercial use allowed. Attribution (OpenMapTiles + OSM)
  stays enabled on the full-screen maps.

## Consequences

- The three clients render pixel-identical basemaps; the map ground matches
  the `mapGround` theme token in both themes.
- The Google Maps API key requirement on Android is gone.
- OpenFreeMap is donation-funded with **no SLA**. The escape hatch is
  cheap: the style JSON is self-hosted in the repo, so switching providers
  (e.g. MapTiler, self-hosted Protomaps) means changing the source /
  glyph / sprite URLs in `build.mjs` and regenerating — no client code
  changes.
- `@maplibre/maplibre-react-native` gets no fixes at 10.4.2; the RN
  new-architecture upgrade is the ticket that unpins it.
- maplibre-gl 6.6.0 pitfalls worked around in `web/src/pages/MapPage.tsx`:
  the worker must be handed to Vite explicitly (`?worker&url` +
  `setWorkerUrl`), and map creation is deferred one animation frame so
  StrictMode's dev double-mount never removes a half-initialized map.
