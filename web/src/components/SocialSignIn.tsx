import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AuthProviders, SocialProvider } from '../api';
import { fetchAuthProviders } from '../api';
import { useAuth } from '../auth';
import { appleReady, googleReady, isAppleCancellation, renderGoogleButton, signInWithApple } from '../socialAuth';
import { resolvedThemeName } from '../theme';

/**
 * The "Apple ile giriş yap" / Google row on the login screen.
 *
 * Renders nothing at all until the backend confirms a provider is configured,
 * so a deployment without Apple/Google credentials shows the plain e-mail form
 * instead of buttons that could only fail. Mobile's SocialSignIn does the
 * same, from the same endpoint.
 */
export function SocialSignIn({ onError }: { onError: (message: string | null) => void }) {
  const { loginWithProvider } = useAuth();
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const googleSlot = useRef<HTMLDivElement>(null);
  const theme = resolvedThemeName();

  useEffect(() => {
    let alive = true;
    // A deployment without providers is normal, not an error: stay silent.
    fetchAuthProviders()
      .then((p) => alive && setProviders(p))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(
    async (provider: SocialProvider, token: string, name?: string) => {
      setBusy(provider);
      onError(null);
      try {
        await loginWithProvider(provider, token, name);
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Giriş yapılamadı');
      } finally {
        setBusy(null);
      }
    },
    [loginWithProvider, onError]
  );

  const googleClientId = googleReady(providers);
  useEffect(() => {
    if (!googleClientId || !googleSlot.current) return;
    renderGoogleButton(googleSlot.current, googleClientId, theme, (token) =>
      signIn('google', token)
    ).catch(() => onError('Google girişi yüklenemedi'));
  }, [googleClientId, theme, signIn, onError]);

  const apple = appleReady(providers);

  async function handleApple() {
    if (!apple) return;
    setBusy('apple');
    onError(null);
    try {
      const { identityToken, name } = await signInWithApple(apple.serviceId, apple.redirectUri);
      await signIn('apple', identityToken, name);
    } catch (err) {
      // Closing the popup is a decision, not a failure.
      if (!isAppleCancellation(err)) {
        onError(err instanceof Error ? err.message : 'Apple girişi yapılamadı');
      }
    } finally {
      setBusy(null);
    }
  }

  if (!apple && !googleClientId) return null;

  return (
    <div className="social-signin">
      <div className="social-divider">
        <span>veya</span>
      </div>

      {apple && (
        <button type="button" className="social-btn apple" onClick={handleApple} disabled={!!busy}>
          <AppleLogo />
          <span>{busy === 'apple' ? 'Bekleyin…' : 'Apple ile giriş yap'}</span>
        </button>
      )}

      {/* Google draws its own button here (see socialAuth.ts). */}
      {googleClientId && <div className="social-google" ref={googleSlot} aria-busy={busy === 'google'} />}

      <p className="subtle social-consent">
        Apple veya Google ile devam edersen{' '}
        <Link to="/kosullar">Kullanım Koşulları</Link>&apos;nı kabul etmiş,{' '}
        <Link to="/gizlilik">Aydınlatma Metni</Link>&apos;ni okumuş sayılırsın.
      </p>
    </div>
  );
}

/**
 * Apple's mark, as their sign-in guidelines require on the button. Drawn at
 * 14pt so it matches the label's cap height on both themes; the button flips
 * to white-on-black / black-on-white in theme.css.
 */
function AppleLogo() {
  return (
    <svg width="15" height="18" viewBox="0 0 14 17" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M11.62 8.99c-.02-1.9 1.55-2.81 1.62-2.86-.88-1.29-2.26-1.47-2.75-1.49-1.17-.12-2.28.69-2.88.69-.59 0-1.5-.67-2.47-.65-1.27.02-2.44.74-3.09 1.87-1.32 2.29-.34 5.68.95 7.54.63.91 1.38 1.93 2.36 1.89.95-.04 1.31-.61 2.45-.61s1.47.61 2.47.59c1.02-.02 1.67-.93 2.29-1.84.72-1.05 1.02-2.07 1.04-2.13-.02-.01-2-.77-2.02-3.05zM9.72 3.35c.52-.64.87-1.52.78-2.4-.75.03-1.66.5-2.2 1.13-.48.56-.9 1.46-.79 2.32.84.06 1.69-.42 2.21-1.05z"
      />
    </svg>
  );
}
