/**
 * Tema tercihi (mobildeki ThemeContext ile aynı üç durum): sistem / açık /
 * koyu. Seçim localStorage'da; CSS `data-theme` özniteliğine bakıyor.
 */
export type ThemeMode = 'system' | 'light' | 'dark';

const KEY = 'pati-theme';

export function readThemeMode(): ThemeMode {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function applyThemeMode(mode: ThemeMode) {
  if (mode === 'system') {
    localStorage.removeItem(KEY);
    delete document.documentElement.dataset.theme;
  } else {
    localStorage.setItem(KEY, mode);
    document.documentElement.dataset.theme = mode;
  }
  // theme-color meta'sı da uysun (tarayıcı çubuğu).
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    meta.setAttribute('content', dark ? '#1c1714' : '#f47a4a');
  }
}

/** Sayfa yüklenir yüklenmez (React'tan önce) çağrılır ki ilk kare doğru temada gelsin. */
export function bootTheme() {
  applyThemeMode(readThemeMode());
}
