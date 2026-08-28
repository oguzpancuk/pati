/**
 * Theme preference (same three states as mobile's ThemeContext): system /
 * light / dark. The choice lives in localStorage; CSS reads the `data-theme`
 * attribute.
 */
export type ThemeMode = 'system' | 'light' | 'dark';

const KEY = 'pati-theme';

export function readThemeMode(): ThemeMode {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

/** The theme actually in effect right now (mode "system" resolved via media query). */
export function resolvedThemeName(): 'light' | 'dark' {
  const mode = readThemeMode();
  if (mode !== 'system') return mode;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyThemeMode(mode: ThemeMode) {
  if (mode === 'system') {
    localStorage.removeItem(KEY);
    delete document.documentElement.dataset.theme;
  } else {
    localStorage.setItem(KEY, mode);
    document.documentElement.dataset.theme = mode;
  }
  // Keep the theme-color meta in step (the browser chrome).
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const dark =
      mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    meta.setAttribute('content', dark ? '#161412' : '#ffffff');
  }
}

/** Called as soon as the page loads (before React) so the first frame has the right theme. */
export function bootTheme() {
  applyThemeMode(readThemeMode());
}
