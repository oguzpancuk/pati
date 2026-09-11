/**
 * Apple and Google sign-in for the web client.
 *
 * Both providers are loaded lazily from their own CDN, and only when the
 * backend says the provider is configured — an unconfigured deployment
 * therefore ships no third-party script at all, which is also the honest
 * reading of the KVKK notice (no vendor script runs until the user is offered
 * that vendor's button).
 *
 * Both flows end the same way: a signed identity token that goes straight to
 * POST /api/auth/{apple,google}, where it is verified. Nothing here is
 * trusted; the browser side only fetches the token.
 */
import type { AuthProviders } from './api';

/** Loads a third-party script once, resolving when it is ready. */
const loaded = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  const existing = loaded.get(src);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      // Forget the failure: a cached rejected promise would make one flaky
      // network moment disable the button for the rest of the session.
      el.remove();
      loaded.delete(src);
      reject(new Error('Sağlayıcı yüklenemedi'));
    };
    document.head.appendChild(el);
  });
  loaded.set(src, promise);
  return promise;
}

// ------------------------------------------------------------------ Google

// hl=tr is how GIS is told which language to draw its button in; the
// renderButton option alone is not always honoured.
const GSI_SRC = 'https://accounts.google.com/gsi/client?hl=tr';

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdApi {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
}

/**
 * ONE Google Identity Services client per page, with a dispatcher in front of
 * it.
 *
 * `google.accounts.id.initialize()` is a page-level singleton holding exactly
 * ONE credential callback. The naive version — every component initialising
 * with its own callback just before it renders its button — looks fine with a
 * single button on the page and is a real defect with two: whichever
 * component initialised LAST owns the callback, and it receives the
 * credential from EVERY rendered button. That is how the settings sheet could
 * turn "Google ile doğrula" on the change-password form into an account
 * deletion (the delete dialog had re-initialised behind it).
 *
 * So: initialise once, and route by the button the user actually pressed.
 * Each rendered button registers its handler against the element it was drawn
 * into; GIS's own `click_listener` names that element on press (it fires
 * wherever the button's markup lives, iframe included), and a capture-phase
 * pointerdown is the belt to that braces. If neither signal identified a
 * registered button, the credential is DROPPED rather than guessed at — one
 * of these handlers deletes an account.
 */
const googleHandlers = new Map<HTMLElement, (idToken: string) => void>();
/** The button most recently pressed, consumed by the next credential. */
let googlePressed: HTMLElement | null = null;
/** The client id GIS was initialised with, or null while it never was. */
let googleInitialized: string | null = null;
let googlePressListening = false;

function routeGoogleCredential(idToken: string): void {
  // A press we recognised wins — including when it names a button that has
  // since been released, which resolves to no handler and drops. Only when
  // no press was seen at all does the single button on the page get it:
  // there is nothing to confuse it with then.
  const target =
    googlePressed ?? (googleHandlers.size === 1 ? [...googleHandlers.keys()][0] : null);
  googlePressed = null;
  const handler = target ? googleHandlers.get(target) : undefined;
  if (!handler) return;
  handler(idToken);
}

function listenForGooglePress(): void {
  if (googlePressListening) return;
  googlePressListening = true;
  // Capture phase: GIS handles the click itself, and a listener on the way
  // down runs before it either way.
  document.addEventListener(
    'pointerdown',
    (event) => {
      const node = event.target;
      if (!(node instanceof Node)) return;
      for (const parent of googleHandlers.keys()) {
        if (parent.contains(node)) {
          googlePressed = parent;
          return;
        }
      }
    },
    true
  );
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
    AppleID?: {
      auth: {
        init(config: {
          clientId: string;
          scope: string;
          redirectURI: string;
          usePopup: boolean;
        }): void;
        signIn(): Promise<{
          authorization: { id_token: string };
          user?: { name?: { firstName?: string; lastName?: string } };
        }>;
      };
    };
  }
}

/**
 * Draws Google's own button into `parent`.
 *
 * Google Identity Services only hands out an ID token through the button it
 * renders itself (or One Tap); a hand-drawn button can obtain an access
 * token, which is not what the backend verifies. So this is Google's button,
 * shaped as closely to ours as its options allow — the one place where the
 * design system yields to a vendor SDK. Mobile has no such restriction and
 * draws the pati button.
 */
export async function renderGoogleButton(
  parent: HTMLElement,
  clientId: string,
  theme: 'light' | 'dark',
  onToken: (idToken: string) => void
): Promise<void> {
  // Registered BEFORE the await: a component that unmounts while the script
  // is still loading must find something to release.
  googleHandlers.set(parent, onToken);
  listenForGooglePress();
  await loadScript(GSI_SRC);
  if (!googleHandlers.has(parent)) return; // released while loading
  const api = window.google?.accounts.id;
  if (!api) throw new Error('Google girişi yüklenemedi');
  if (googleInitialized !== clientId) {
    api.initialize({
      client_id: clientId,
      callback: (response) => routeGoogleCredential(response.credential),
      // One Tap would pop up on every page; the button is the whole feature.
      cancel_on_tap_outside: true,
    });
    googleInitialized = clientId;
  }
  parent.replaceChildren();
  api.renderButton(parent, {
    type: 'standard',
    theme: theme === 'dark' ? 'filled_black' : 'outline',
    size: 'large',
    shape: 'pill',
    text: 'continue_with',
    logo_alignment: 'center',
    locale: 'tr',
    // GIS clamps to 400; the login form is 380 wide.
    width: Math.min(parent.clientWidth || 380, 400),
    // GIS's own press signal, and the reason two buttons can coexist: it
    // names the button being used before the credential comes back.
    click_listener: () => {
      googlePressed = parent;
    },
  });
}

/**
 * Drops a button's handler — call it from the effect cleanup that rendered
 * the button. A handler left behind after its component unmounts can still
 * be the one a credential reaches.
 *
 * `googlePressed` is deliberately NOT cleared here. If the button the user
 * pressed has gone away before its credential came back — the delete dialog
 * closed while Google's chooser was still open, say — that credential
 * belongs to nobody, and handing it to whatever button is left is exactly
 * the mix-up this dispatcher exists to prevent. It is dropped instead.
 */
export function releaseGoogleButton(parent: HTMLElement): void {
  googleHandlers.delete(parent);
}

// ------------------------------------------------------------------- Apple

const APPLE_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/tr_TR/appleid.auth.js';

export interface AppleSignInResult {
  identityToken: string;
  /** Apple reveals the name only during the first authorization, if at all. */
  name?: string;
}

/**
 * Opens Apple's popup and resolves with the identity token. Rejects with a
 * `popup_closed_by_user` error when the user backs out — the caller treats
 * that as "nothing happened", not as a failure worth an error message.
 */
export async function signInWithApple(
  serviceId: string,
  redirectUri: string
): Promise<AppleSignInResult> {
  await loadScript(APPLE_SRC);
  const api = window.AppleID?.auth;
  if (!api) throw new Error('Apple girişi yüklenemedi');
  api.init({ clientId: serviceId, scope: 'name email', redirectURI: redirectUri, usePopup: true });
  const result = await api.signIn();
  const parts = [result.user?.name?.firstName, result.user?.name?.lastName].filter(Boolean);
  return {
    identityToken: result.authorization.id_token,
    name: parts.length ? parts.join(' ') : undefined,
  };
}

/** True when the failure is just the user closing Apple's popup. */
export function isAppleCancellation(err: unknown): boolean {
  const error = (err as { error?: string } | null)?.error;
  return error === 'popup_closed_by_user' || error === 'user_cancelled_authorize';
}

/** A provider is offerable only when the backend has every value it needs. */
export function googleReady(providers: AuthProviders | null): string | null {
  if (!providers?.google.enabled) return null;
  return providers.google.webClientId;
}

export function appleReady(
  providers: AuthProviders | null
): { serviceId: string; redirectUri: string } | null {
  if (!providers?.apple.enabled) return null;
  const { serviceId, redirectUri } = providers.apple;
  return serviceId && redirectUri ? { serviceId, redirectUri } : null;
}
