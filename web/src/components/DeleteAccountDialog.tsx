import { useState } from 'react';
import { deleteAccount } from '../api';
import { useAuth } from '../auth';

/**
 * Self-service account deletion (the KVKK promise on /gizlilik + App Store
 * 5.1.1). A faint link opens a sheet that spells out what is deleted and what
 * stays anonymized, then re-authenticates with the password — a stolen open
 * session must not be enough to destroy an account.
 */
export function DeleteAccountLink() {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setOpen(false);
    setPassword('');
    setError(null);
  }

  async function submit() {
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(password);
      // The session is dead server-side; drop it locally too.
      logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Silinemedi');
      setBusy(false);
    }
  }

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
        <div className="backdrop" onClick={() => !busy && reset()}>
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
              <a href="/gizlilik" className="textlink">
                gizlilik
              </a>
              ).
            </p>

            <label className="field">
              <span>şifren</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>

            {error && <div className="error">{error}</div>}

            <button
              className="btn full"
              style={{ background: 'var(--danger)', boxShadow: 'none' }}
              disabled={!password || busy}
              onClick={submit}
            >
              {busy ? 'Siliniyor…' : 'Hesabımı kalıcı olarak sil'}
            </button>
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
