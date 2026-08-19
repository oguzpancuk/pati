/**
 * Brand copy in one place, so the app name is never hardcoded on screens —
 * if the name changes, this changes.
 */
export const brand = {
  name: 'pati',
  tagline: 'birlikte bakıyoruz',
  // The hosted privacy notice + terms; mobile links out instead of
  // embedding a copy, so a legal edit ships without an app update.
  legalUrl: 'https://pati-app.com/gizlilik',
} as const;
