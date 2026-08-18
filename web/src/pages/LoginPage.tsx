import { FormEvent, useState } from 'react';
import { useAuth } from '../auth';

/**
 * Giriş + kayıt tek ekranda. Mobil uygulamadaki akışla aynı: kayıt olan
 * kullanıcıya sunucu rastgele bir avatar atar, profilden değiştirilebilir.
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
    <div className="app" style={{ justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 380, width: '100%', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          {/* Pati logosu: mobil Logo.tsx ile aynı yuvarlak zemin + pati izi. */}
          <span
            className="round"
            style={{
              display: 'inline-flex',
              width: 72,
              height: 72,
              background: 'var(--brand)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="44" height="44" viewBox="0 0 24 24" fill="#fff">
              <circle cx="6.4" cy="10.6" r="2.1" />
              <circle cx="9.9" cy="7.2" r="2.2" />
              <circle cx="14.1" cy="7.2" r="2.2" />
              <circle cx="17.6" cy="10.6" r="2.1" />
              <path d="M12 12.2c2.6 0 5 2.1 5 4.5 0 1.8-1.4 2.9-3 2.9-.9 0-1.4-.4-2-.4s-1.1.4-2 .4c-1.6 0-3-1.1-3-2.9 0-2.4 2.4-4.5 5-4.5Z" />
            </svg>
          </span>
          <h1 style={{ margin: '10px 0 2px', fontSize: 34, color: 'var(--brand)' }}>pati</h1>
          <p className="muted" style={{ margin: 0 }}>
            Sokak dostlarına birlikte bakalım
          </p>
        </div>

        {error && <div className="error">{error}</div>}

        <form onSubmit={submit}>
          {mode === 'register' && (
            <label className="field">
              <span>İSİM</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </label>
          )}
          <label className="field">
            <span>E-POSTA</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className="field">
            <span>ŞİFRE</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>
          <button className="btn full" disabled={busy}>
            {busy ? 'Bekleyin…' : mode === 'login' ? 'Giriş yap' : 'Kayıt ol'}
          </button>
        </form>

        <button
          className="btn ghost full"
          style={{ marginTop: 8 }}
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
        >
          {mode === 'login' ? 'Hesabın yok mu? Kayıt ol' : 'Zaten üye misin? Giriş yap'}
        </button>
      </div>
    </div>
  );
}
