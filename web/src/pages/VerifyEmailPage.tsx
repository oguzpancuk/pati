import { FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { Wordmark } from '../brand';

const RESEND_COOLDOWN_S = 60;

/**
 * The code page. Shown instead of the app while the session's e-mail is
 * unverified (ADR-0004; mobile: VerifyEmailScreen). The six digits from the
 * mail go in here, the account opens, the routes swap to the app. The same
 * page serves a fresh registration ("we sent a code") and a later login ("ask
 * for a code") — `codeSent` from the auth context tells the two apart.
 */
export default function VerifyEmailPage() {
  const { me, codeSent, verifyEmail, resendCode, logout } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  // Mirrors the server's cooldown so the button says why it is disabled
  // rather than answering a click with a 429.
  const [cooldown, setCooldown] = useState(codeSent ? RESEND_COOLDOWN_S : 0);
  const submitted = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function submitCode(value: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyEmail(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu');
      submitted.current = false;
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submitCode(code);
  }

  function onChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    setError(null);
    // Six digits is the whole input; submitting on the last one saves a
    // click and matches the browser's one-time-code autofill.
    if (digits.length === 6 && !submitted.current) {
      submitted.current = true;
      submitCode(digits);
    }
  }

  async function resend() {
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      await resendCode();
      setCooldown(RESEND_COOLDOWN_S);
      setNotice('Yeni kod gönderildi.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setCooldown(RESEND_COOLDOWN_S);
      setError(err instanceof Error ? err.message : 'Kod gönderilemedi');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="app" style={{ justifyContent: 'center', padding: '24px 34px' }}>
      <div style={{ maxWidth: 380, width: '100%', margin: '0 auto' }}>
        <div style={{ marginBottom: 28 }}>
          <Wordmark size="md" />
        </div>

        <h2 style={{ textAlign: 'center', margin: '0 0 8px' }}>E-postanı doğrula</h2>
        <p style={{ textAlign: 'center', margin: '0 4px 24px', lineHeight: 1.5 }}>
          {codeSent ? (
            <>
              <strong>{me?.email}</strong> adresine 6 haneli bir kod gönderdik. Kodu aşağıya gir.
            </>
          ) : (
            <>
              Devam etmek için <strong>{me?.email}</strong> adresini doğrulaman gerekiyor. Yeni bir
              kod iste, sonra buraya gir.
            </>
          )}
        </p>

        {error && <div className="error">{error}</div>}
        {notice && (
          <p className="muted" style={{ textAlign: 'center', color: 'var(--on-success)' }}>
            {notice}
          </p>
        )}

        <form onSubmit={onSubmit}>
          <label className="field">
            <span>doğrulama kodu</span>
            <input
              value={code}
              onChange={(e) => onChange(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="······"
              autoFocus
              style={{ fontSize: 26, letterSpacing: 8, textAlign: 'center' }}
            />
          </label>
          <button className="btn full" disabled={busy || code.length !== 6}>
            {busy ? 'Kontrol ediliyor…' : 'Doğrula'}
          </button>
        </form>

        <button
          type="button"
          className="btn ghost full"
          style={{ marginTop: 8 }}
          onClick={resend}
          disabled={sending || cooldown > 0}
        >
          {sending
            ? 'Gönderiliyor…'
            : cooldown > 0
            ? `Kodu yeniden gönder (${cooldown})`
            : 'Kodu yeniden gönder'}
        </button>

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
          onClick={logout}
        >
          Yanlış adres mi? <span style={{ color: 'var(--brand)' }}>Çıkış yap</span>
        </button>

        <p
          className="subtle"
          style={{ textAlign: 'center', marginTop: 40, lineHeight: 1.5, padding: '0 8px' }}
        >
          Kod 15 dakika geçerli. Gelen kutunda yoksa spam klasörüne bak.
        </p>
      </div>
    </div>
  );
}
