import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mapColors, palettes, type Palette, type ThemeName } from './colors';
import { makeShadows, type Shadows } from './layout';

/** The user's choice. 'system' = follow the phone's setting (default). */
export type ThemeMode = 'system' | 'light' | 'dark';

export interface Theme {
  name: ThemeName;
  colors: Palette;
  shadow: Shadows;
  map: typeof mapColors;
}

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const STORAGE_KEY = 'pati.themeMode';

function buildTheme(name: ThemeName): Theme {
  const colors = palettes[name];
  return { name, colors, shadow: makeShadows(colors), map: mapColors };
}

// The light theme stands as the default so nothing crashes before the
// provider mounts (e.g. test renders).
const ThemeContext = createContext<ThemeContextValue>({
  theme: buildTheme('light'),
  mode: 'system',
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  // The choice is stored on the device; the app opens with the same theme every time.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setModeState(stored);
        }
      })
      .catch(() => {
        // If unreadable, continue with the system theme; the preference isn't critical data.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function setMode(next: ThemeMode) {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }

  const name: ThemeName = mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
  const value = useMemo<ThemeContextValue>(
    () => ({ theme: buildTheme(name), mode, setMode }),
    [name, mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** For reading colors/shadows inside a component. */
export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

/** For the theme picker (System / Light / Dark). */
export function useThemeMode() {
  const { mode, setMode } = useContext(ThemeContext);
  return { mode, setMode };
}
