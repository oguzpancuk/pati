import { Logger } from '@maplibre/maplibre-react-native';
import type { ThemeName } from '../theme/colors';
import patiLight from './styles/pati-light.json';
import patiDark from './styles/pati-dark.json';

// The native renderer emits a benign per-tile "Invalid geometry in line
// layer" warning for some basemap tiles; the map draws correctly, but as a
// WARN it pops a LogBox toast over the app in every dev session. Swallow
// exactly that message (returning true marks it handled) — everything else
// still logs.
Logger.setLogCallback(
  (log) => log.level === 'warning' && log.message.includes('Invalid geometry in line layer')
);

/**
 * The pati basemap, one style per theme. The JSONs are GENERATED — never
 * edit them by hand; change the palette or base style in
 * `shared/mapstyle/build.mjs` and rerun it. All three clients (iOS, Android,
 * web) render these same styles, which is what keeps the map identical
 * across platforms (docs/adr/ has the basemap decision).
 */
export const mapStyles: Record<ThemeName, object> = {
  light: patiLight,
  dark: patiDark,
};
