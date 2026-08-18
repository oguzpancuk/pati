import { useState } from 'react';
import { useAuth } from '../auth';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş yapılamadı');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Stray Yönetim</h1>
        <p className="muted" style={{ margin: 0 }}>
          Yönetici hesabıyla giriş yapın.
        </p>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-banner">{error}</div>}
          <input
            type="email"
            placeholder="E-posta"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Şifre"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Giriş yapılıyor…' : 'Giriş Yap'}
          </button>
        </form>

        <p className="muted" style={{ fontSize: 12, marginTop: 18, marginBottom: 0 }}>
          Yönetici hesabınız yoksa sunucuda{' '}
          <code className="mono">npm run make-admin -- eposta@adresi.com</code> çalıştırın.
        </p>
      </div>
    </div>
  );
}
