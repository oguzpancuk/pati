/**
 * Brand copy in one place, so the app name is never hardcoded on screens —
 * if the name changes, this changes.
 */
export const brand = {
  name: 'pati',
  tagline: 'birlikte bakıyoruz',
  // The hosted legal pages; mobile links out instead of embedding copies,
  // so a legal edit ships without an app update.
  privacyUrl: 'https://pati-app.com/gizlilik',
  termsUrl: 'https://pati-app.com/kosullar',
} as const;
