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
  await loadScript(GSI_SRC);
  const api = window.google?.accounts.id;
  if (!api) throw new Error('Google girişi yüklenemedi');
  api.initialize({
    client_id: clientId,
    callback: (response) => onToken(response.credential),
    // One Tap would pop up on every page; the button is the whole feature.
    cancel_on_tap_outside: true,
  });
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
  });
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

export function appleReady(providers: AuthProviders | null): { serviceId: string; redirectUri: string } | null {
  if (!providers?.apple.enabled) return null;
  const { serviceId, redirectUri } = providers.apple;
  return serviceId && redirectUri ? { serviceId, redirectUri } : null;
}
