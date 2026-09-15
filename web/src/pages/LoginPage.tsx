import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Wordmark } from '../brand';
import { SocialSignIn } from '../components/SocialSignIn';
import { ForgotPasswordDialog } from '../components/password';
import { takeLocationRetry } from '../location';
import '../styles/password.css';

/**
 * Login + registration on one screen (handoff 3a): vertically centered logo
 * + wordmark, no tagline; field labels live inside the box. The server
 * assigns a random avatar to new users — the faint note below says so.
 */
export default function LoginPage() {
  const { login, register } = useAuth();
  // A location retry's reload can land here (an expired session, a failed
  // /users/me): drop its intent so it never runs for whoever signs in on
  // this tab next, without a tap of their own.
  useEffect(() => {
    takeLocationRetry();
  }, []);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Registration requires an explicit terms acceptance (owner decision);
  // the checkbox links to both legal pages.
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  // Stable: the dialog's Back-button handling keys its history entry on this
  // identity, and a new function each render would push a second entry.
  const closeForgot = useCallback(() => setForgotOpen(false), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await register(name.trim(), email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app" style={{ justifyContent: 'center', padding: '24px 34px' }}>
      <div style={{ maxWidth: 380, width: '100%', margin: '0 auto' }}>
        <div style={{ marginBottom: 34 }}>
          <Wordmark size="lg" />
        </div>

        {error && <div className="error">{error}</div>}

        <form onSubmit={submit}>
          {mode === 'register' && (
            <label className="field">
              <span>isim</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </label>
          )}
          <label className="field">
            <span>e-posta</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="field">
            <span>şifre</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>
          {mode === 'register' && (
            <label
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                margin: '10px 2px 4px',
                fontSize: 13.5,
                lineHeight: 1.5,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                required
                style={{ marginTop: 3, accentColor: 'var(--brand)' }}
              />
              <span>
                <Link to="/kosullar" style={{ color: 'var(--brand)' }}>
                  Kullanım Koşulları
                </Link>
                &apos;nı okudum, kabul ediyorum;{' '}
                <Link to="/gizlilik" style={{ color: 'var(--brand)' }}>
                  Aydınlatma Metni
                </Link>
                &apos;ni okudum.
              </span>
            </label>
          )}
          <button
            className="btn full"
            style={{ marginTop: 6 }}
            disabled={busy || (mode === 'register' && !termsAccepted)}
          >
            {busy ? 'Bekleyin…' : mode === 'login' ? 'Giriş yap' : 'Kayıt ol'}
          </button>
        </form>

        {/* Under the button, not next to the field: the dialog is the way out
            of a forgotten password, and it belongs where someone looks after a
            refused sign-in. Registration has nothing to forget yet. */}
        {mode === 'login' && (
          <button type="button" className="pw-forgot" onClick={() => setForgotOpen(true)}>
            Şifremi unuttum
          </button>
        )}

        <SocialSignIn onError={setError} />

        <button
          type="button"
          style={{
            display: 'block',
            margin: '16px auto 0',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-body)',
          }}
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
        >
          {mode === 'login' ? (
            <>
              Hesabın yok mu? <span style={{ color: 'var(--brand)' }}>Kayıt ol</span>
            </>
          ) : (
            <>
              Zaten üye misin? <span style={{ color: 'var(--brand)' }}>Giriş yap</span>
            </>
          )}
        </button>

        <p
          className="subtle"
          style={{ textAlign: 'center', marginTop: 40, lineHeight: 1.5, padding: '0 8px' }}
        >
          Kayıt olursan sana rastgele bir avatar atanır, profilden değiştirebilirsin.
        </p>
        <p className="subtle" style={{ textAlign: 'center', marginTop: 10 }}>
          <Link to="/kosullar" style={{ color: 'var(--brand)' }}>
            Kullanım Koşulları
          </Link>
          {' · '}
          <Link to="/gizlilik" style={{ color: 'var(--brand)' }}>
            Aydınlatma Metni (KVKK)
          </Link>
        </p>
      </div>

      <ForgotPasswordDialog open={forgotOpen} onClose={closeForgot} initialEmail={email} />
    </div>
  );
}
