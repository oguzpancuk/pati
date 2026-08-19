import { FormEvent, useState } from 'react';
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
          <button className="btn full" style={{ marginTop: 6 }} disabled={busy}>
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
      </div>
    </div>
  );
}
