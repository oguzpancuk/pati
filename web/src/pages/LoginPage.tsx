import { FormEvent, useState } from 'react';
import { useAuth } from '../auth';
import { Wordmark } from '../brand';

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
        <div style={{ marginBottom: 28 }}>
          <Wordmark size="lg" tagline />
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
