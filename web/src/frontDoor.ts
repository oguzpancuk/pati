import { isStandalone } from './install';

/**
 * Who meets the about page at `/` when signed out. It is the front door for
 * strangers (pati-app.com is linked from outside), not for people who
 * already use pati: an installed PWA, or a browser that has been signed in
 * before, keeps `/` on the sign-in form, so an expired session or a "back to
 * /" fallback lands where the user was heading rather than on the intro.
 */
const RETURNING_KEY = 'pati-returning';

export function markReturningVisitor() {
  try {
    localStorage.setItem(RETURNING_KEY, '1');
  } catch {
    // Not remembered: this browser keeps getting the intro, nothing breaks.
  }
}

export function showsAboutAtRoot(): boolean {
  if (isStandalone()) return false;
  try {
    return localStorage.getItem(RETURNING_KEY) !== '1';
  } catch {
    return true;
  }
}
