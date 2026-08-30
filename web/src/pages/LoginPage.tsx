import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Wordmark } from '../brand';

/**
 * Login + registration on one screen (handoff 3a): vertically centered logo
 * + wordmark, no tagline; field labels live inside the box. The server
 * assigns a random avatar to new users — the faint note below says so.
 */
export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Registration requires an explicit terms acceptance (owner decision);
  // the checkbox links to both legal pages.
  const [termsAccepted, setTermsAccepted] = useState(false);

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
    </div>
  );
}
