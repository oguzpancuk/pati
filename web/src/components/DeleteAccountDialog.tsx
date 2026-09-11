import { useEffect, useRef, useState } from 'react';
import type { AuthProviders, SocialProvider } from '../api';
import { deleteAccount, fetchAuthProviders } from '../api';
import { useAuth } from '../auth';
import {
  isAppleCancellation,
  releaseGoogleButton,
  renderGoogleButton,
  signInWithApple,
} from '../socialAuth';
import { resolvedThemeName } from '../theme';
import { useSheetDismiss, useSheetExit } from './profile/Sheet';

/**
 * Self-service account deletion (the KVKK promise on /gizlilik + App Store
 * 5.1.1). A faint link opens a sheet that spells out what is deleted and what
 * stays anonymized, then re-authenticates — a stolen open session must not be
 * enough to destroy an account. Password accounts type their password;
 * Apple/Google accounts have none, so they sign in with the provider once
 * more and that token is the proof.
 */
export function DeleteAccountLink() {
  const { logout, me } = useAuth();
  // The settings sheet this link sits in pushed a history entry. Deletion
  // ends by swapping the whole route element, so the sheet never reaches its
  // own dismissal and that entry is stranded — the user's first Back press
  // afterwards would do nothing at all. Same fix as the logout link.
  const exitSheet = useSheetExit();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const googleSlot = useRef<HTMLDivElement>(null);

  // An account with no password proves itself through its provider, so the
  // sheet needs the provider config — fetched only when that is the case.
  const usesPassword = me?.hasPassword !== false;
  const linked = me?.authProviders ?? [];

  useEffect(() => {
    if (!open || usesPassword || providers) return;
    fetchAuthProviders()
      .then(setProviders)
      .catch(() => setError('Doğrulama sağlayıcısı yüklenemedi'));
  }, [open, usesPassword, providers]);

  function reset() {
    setOpen(false);
    setPassword('');
    setError(null);
  }

  async function remove(proof: Parameters<typeof deleteAccount>[0]) {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(proof);
      // The way out of the sheet is taken FIRST, then the logout — after it
      // there is no sheet left to take it.
      exitSheet?.();
      // The session is dead server-side; drop it locally too.
      logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silinemedi');
      setBusy(false);
    }
  }

  async function submit() {
    if (!password) return;
    await remove({ password });
  }

  async function confirmWithApple() {
    const apple = providers?.apple;
    if (!apple?.serviceId || !apple.redirectUri || busy) return;
    // Busy from the moment the popup opens, not from the moment the delete
    // request leaves: otherwise a second click opens a second Apple popup.
    setBusy(true);
    setError(null);
    try {
      const { identityToken } = await signInWithApple(apple.serviceId, apple.redirectUri);
      await remove({ provider: 'apple', identityToken });
    } catch (err) {
      if (!isAppleCancellation(err)) setError('Doğrulama başarısız, tekrar deneyin');
      setBusy(false);
    }
  }

  // Read outside the effect so a theme flip while the sheet is open redraws
  // Google's button in the new theme (it renders its own colours).
  const theme = resolvedThemeName();
  useEffect(() => {
    const clientId = providers?.google.webClientId;
    const slot = googleSlot.current;
    if (!open || usesPassword || !clientId || !linked.includes('google') || !slot) {
      return undefined;
    }
    renderGoogleButton(slot, clientId, theme, (identityToken) =>
      remove({ provider: 'google', identityToken })
    ).catch(() => setError('Google doğrulaması yüklenemedi'));
    // Closing this dialog leaves the change-password form's Google button
    // mounted behind it; this handler must go with the dialog, or a later
    // credential could still reach it.
    return () => releaseGoogleButton(slot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, usesPassword, providers, theme, linked.join(',')]);

  // history: false — this dialog opens from INSIDE the settings sheet, which
  // already owns a history entry. A second owned entry nested in it is the
  // race the care-history popups were given this same flag for: Escape
  // closes the dialog, and a Back press closes it together with the sheet.
  const dismiss = useSheetDismiss(open, reset, false);

  return (
    <>
      <button
        type="button"
        className="subtle"
        style={{
          display: 'block',
          margin: '8px auto 0',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
        }}
        onClick={() => setOpen(true)}
      >
        hesabı sil
      </button>

      {open && (
        <div className="backdrop" onClick={() => !busy && dismiss()}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="micro" style={{ textAlign: 'center' }}>
              hesabı sil
            </div>
            <h2 style={{ textAlign: 'center', margin: '2px 0 8px' }}>Emin misin?</h2>
            <p className="muted" style={{ margin: '0 0 14px', lineHeight: 1.55 }}>
              Adın, e-postan ve avatarın kalıcı olarak silinir; bu geri alınamaz. Eklediğin hayvan
              kayıtları ve yorumlar sokaktaki hayvanların takibi için &quot;Silinmiş Üye&quot;
              adıyla, sana bağlanamayacak şekilde kalır (ayrıntı:{' '}
              {/* Inline, not .textlink: that class is display:block and broke
                  this sentence across three lines. */}
              <a href="/gizlilik" style={{ color: 'var(--brand)' }}>
                gizlilik
              </a>
              ).
            </p>

            {usesPassword ? (
              <label className="field">
                <span>şifren</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
            ) : (
              <p className="muted" style={{ margin: '0 0 12px', lineHeight: 1.55 }}>
                Hesabın {providerLabel(linked)} ile açılmış, şifresi yok. Silmeden önce{' '}
                {providerLabel(linked)} ile kimliğini doğrula.
              </p>
            )}

            {error && <div className="error">{error}</div>}

            {usesPassword ? (
              <button
                className="btn full"
                style={{ background: 'var(--danger)', boxShadow: 'none' }}
                disabled={!password || busy}
                onClick={submit}
              >
                {busy ? 'Siliniyor…' : 'Hesabımı kalıcı olarak sil'}
              </button>
            ) : (
              <>
                {linked.includes('apple') && (
                  <button
                    type="button"
                    className="social-btn apple"
                    disabled={busy || !providers?.apple.serviceId}
                    onClick={confirmWithApple}
                  >
                    {busy ? 'Siliniyor…' : 'Apple ile doğrula ve sil'}
                  </button>
                )}
                {linked.includes('google') && (
                  <div
                    className="social-google"
                    ref={googleSlot}
                    aria-busy={busy}
                    style={busy ? { pointerEvents: 'none', opacity: 0.6 } : undefined}
                  />
                )}
              </>
            )}
            <button
              type="button"
              className="link"
              style={{ display: 'block', margin: '10px auto 0' }}
              onClick={reset}
              disabled={busy}
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** "Apple", "Google" or "Apple ve Google" — for the sheet's explanation. */
function providerLabel(providers: SocialProvider[]): string {
  const names = providers.map((p) => (p === 'apple' ? 'Apple' : 'Google'));
  return names.length > 1 ? names.join(' ve ') : names[0] || 'sağlayıcın';
}
