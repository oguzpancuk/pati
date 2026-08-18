import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { mapColors, palettes, type Palette, type ThemeName } from './colors';
import { makeShadows, type Shadows } from './layout';

/** Kullanıcının seçimi. 'system' = telefonun ayarını takip et (varsayılan). */
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

// Tema sağlayıcı henüz monte edilmemişken (ör. test render'ı) çökmemek için
// açık tema varsayılan değer olarak duruyor.
const ThemeContext = createContext<ThemeContextValue>({
  theme: buildTheme('light'),
  mode: 'system',
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  // Seçim cihazda saklanıyor; uygulama her açılışta aynı temayla gelsin.
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
        // Okunamazsa sistem temasıyla devam; tema tercihi kritik veri değil.
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

/** Bileşen içinde renk/gölge okumak için. */
export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

/** Tema seçicisi (Sistem / Açık / Koyu) için. */
export function useThemeMode() {
  const { mode, setMode } = useContext(ThemeContext);
  return { mode, setMode };
}
