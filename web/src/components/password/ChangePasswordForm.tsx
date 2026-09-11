import { FormEvent, useEffect, useRef, useState } from 'react';
import type { AuthProviders, SocialProvider } from '../../api';
import { fetchAuthProviders } from '../../api';
import { changePassword, ChangePasswordProof } from '../../api/password';
import {
  isAppleCancellation,
  releaseGoogleButton,
  renderGoogleButton,
  signInWithApple,
} from '../../socialAuth';
import { resolvedThemeName } from '../../theme';
import '../../styles/password.css';

/**
 * "Şifremi değiştir" as a self-contained block, so it can sit inside whatever
 * sheet the profile grows (it is mounted by the settings sheet, not by this
 * track). It renders a heading, its fields and its own button — no sheet
 * chrome, no navigation.
 *
 * Two shapes, one form, and BOTH re-authenticate — the rule account deletion
 * already enforces. An account that HAS a password types the current one: a
 * borrowed browser tab must not be enough to lock its owner out. An account
 * created through Apple/Google has none — asking it for a password nobody
 * ever chose would leave those users unable to set one at all — so for them
 * this is "şifre belirle" and they sign in with the provider once more; that
 * fresh token is the proof. The session alone is not, which is why the button
 * says "doğrula ve belirle" rather than just "belirle" (review finding).
 *
 * Mirrors the mobile client's ChangePasswordForm.
 */
export function ChangePasswordForm({
  hasPassword,
  authProviders = [],
  onChanged,
}: {
  /** `me.hasPassword`; false only for accounts that never had one. */
  hasPassword: boolean;
  /** `me.authProviders` — which providers can prove a password-less account. */
  authProviders?: SocialProvider[];
  /** Fired after a successful change — the parent reloads `me` so this flips. */
  onChanged?: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const googleSlot = useRef<HTMLDivElement>(null);

  const mismatch = repeat.length > 0 && repeat !== password;
  const ready = password.length >= 8 && repeat === password && (!hasPassword || current.length > 0);

  // An account with no password proves itself through its provider, so the
  // form needs the provider config — fetched only when that is the case.
  useEffect(() => {
    if (hasPassword || providers) return;
    fetchAuthProviders()
      .then(setProviders)
      .catch(() => setError('Doğrulama sağlayıcısı yüklenemedi'));
  }, [hasPassword, providers]);

  function touched() {
    setError(null);
    setDone(false);
  }

  async function save(proof: ChangePasswordProof) {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await changePassword({ password, ...proof });
      setCurrent('');
      setPassword('');
      setRepeat('');
      setDone(true);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Şifre değiştirilemedi.');
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    await save({ currentPassword: current });
  }

  async function submitWithApple() {
    const apple = providers?.apple;
    if (!apple?.serviceId || !apple.redirectUri || busy || !ready) return;
    // Busy from the moment the popup opens, not from the moment the request
    // leaves: otherwise a second click opens a second Apple popup.
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const { identityToken } = await signInWithApple(apple.serviceId, apple.redirectUri);
      await save({ provider: 'apple', identityToken });
    } catch (err) {
      if (!isAppleCancellation(err)) setError('Doğrulama başarısız, tekrar deneyin');
      setBusy(false);
    }
  }

  // Read outside the effect so a theme flip while the sheet is open redraws
  // Google's button in the new theme (it renders its own colours).
  const theme = resolvedThemeName();
  // Held in a ref so the button Google renders — which keeps whatever callback
  // it was drawn with — always reads today's password fields.
  const submitWithGoogle = useRef<(identityToken: string) => void>(() => {});
  submitWithGoogle.current = (identityToken: string) => {
    if (!ready || busy) return;
    void save({ provider: 'google', identityToken });
  };
  useEffect(() => {
    const clientId = providers?.google.webClientId;
    const slot = googleSlot.current;
    if (hasPassword || !clientId || !authProviders.includes('google') || !slot) {
      return undefined;
    }
    renderGoogleButton(slot, clientId, theme, (identityToken) =>
      submitWithGoogle.current(identityToken)
    ).catch(() => setError('Google doğrulaması yüklenemedi'));
    // The delete dialog draws a Google button of its own over this sheet;
    // releasing this one on unmount is half of what keeps a credential from
    // reaching the wrong handler (socialAuth routes the other half).
    return () => releaseGoogleButton(slot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPassword, providers, theme, authProviders.join(',')]);

  return (
    <form onSubmit={submit}>
      <h2 style={{ margin: '0 0 4px' }}>{hasPassword ? 'Şifreni değiştir' : 'Şifre belirle'}</h2>
      <p className="muted pw-lead">{hasPassword ? PASSWORD_LEAD : socialLead(authProviders)}</p>

      {hasPassword && (
        <label className="field">
          <span>mevcut şifren</span>
          <input
            type="password"
            value={current}
            onChange={(e) => {
              setCurrent(e.target.value);
              touched();
            }}
            required
            autoComplete="current-password"
          />
        </label>
      )}
      <label className="field">
        <span>yeni şifre</span>
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            touched();
          }}
          required
          minLength={8}
          autoComplete="new-password"
        />
      </label>
      <label className="field">
        <span>yeni şifre (tekrar)</span>
        <input
          type="password"
          value={repeat}
          onChange={(e) => {
            setRepeat(e.target.value);
            touched();
          }}
          required
          minLength={8}
          autoComplete="new-password"
        />
      </label>

      {/* Checked here rather than on the server: the server sees one password,
          and a typo in a field nobody can read back is exactly what locks
          people out. */}
      {mismatch && <div className="error">Şifreler aynı değil</div>}
      {error && <div className="error">{error}</div>}
      {done && <div className="pw-notice">Şifren güncellendi.</div>}

      {hasPassword ? (
        <button className="btn full" disabled={busy || !ready}>
          {busy ? 'Bekleyin…' : 'Şifreyi değiştir'}
        </button>
      ) : (
        <>
          {authProviders.includes('apple') && (
            <button
              type="button"
              className="social-btn apple"
              disabled={busy || !ready || !providers?.apple.serviceId}
              onClick={submitWithApple}
            >
              {busy ? 'Bekleyin…' : 'Apple ile doğrula ve belirle'}
            </button>
          )}
          {authProviders.includes('google') && (
            <div
              className="social-google"
              ref={googleSlot}
              aria-busy={busy}
              // Google draws its own button, so the readiness of the fields
              // cannot be a `disabled` attribute — it is the pointer gate.
              style={busy || !ready ? { pointerEvents: 'none', opacity: 0.6 } : undefined}
            />
          )}
        </>
      )}
    </form>
  );
}

const PASSWORD_LEAD = 'Yeni şifren en az 8 karakter olmalı.';

function socialLead(providers: SocialProvider[]): string {
  const label = providerLabel(providers);
  return `Hesabın ${label} ile açılmış. Şifre belirlersen e-postanla da giriş yapabilirsin; güvenlik için önce ${label} ile kimliğini doğrulaman gerekiyor.`;
}

/** "Apple", "Google" or "Apple ve Google" — for the lead and the buttons. */
function providerLabel(providers: SocialProvider[]): string {
  const names = providers.map((p) => (p === 'apple' ? 'Apple' : 'Google'));
  return names.length > 1 ? names.join(' ve ') : names[0] || 'sağlayıcın';
}
