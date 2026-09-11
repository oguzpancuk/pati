import { FormEvent, useEffect, useState } from 'react';
import { forgotPassword, resetPassword } from '../../api/password';
import { useAuth } from '../../auth';
import '../../styles/password.css';

/** Mirrors utils/passwordReset.js RESEND_COOLDOWN_S. */
const RESEND_COOLDOWN_S = 60;

type Step = 'email' | 'code';

/**
 * "Şifremi unuttum" — a dialog on the login page, not a route: the code is
 * six digits typed in the app (never a link), so nothing has to be linkable
 * and the user never leaves the page they were on. A sheet is not a page
 * (docs/DESIGN.md §8), so Escape and the browser's Back button close it
 * instead of navigating away.
 *
 * Two steps in one dialog: the address, then the code plus the new password.
 * The server answers the first step identically whether or not the address
 * has an account, so the dialog cannot say "no such user" either — it moves
 * on to the code step regardless, which is the honest UI for a flow built not
 * to disclose who has an account.
 *
 * Mirrors the mobile client's ForgotPasswordSheet.
 */
export function ForgotPasswordDialog({
  open,
  onClose,
  initialEmail = '',
}: {
  open: boolean;
  /** Must be stable (useCallback): the history entry below keys on it. */
  onClose: () => void;
  /** Whatever the login form already has typed, so it is not typed twice. */
  initialEmail?: string;
}) {
  const { login } = useAuth();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Mirrors the server's per-account cooldown so the button says why it is
  // disabled. The server cannot tell us — a visible cooldown would answer
  // "yes, that address has an account".
  const [cooldown, setCooldown] = useState(0);

  // Opening starts from the login form's address, not from whatever the
  // previous attempt left behind. initialEmail is read once per opening on
  // purpose: retyping the address inside the dialog must not be overwritten
  // by the field behind it.
  useEffect(() => {
    if (!open) return;
    setStep('email');
    setEmail(initialEmail);
    setCode('');
    setPassword('');
    setError(null);
    setNotice(null);
    setCooldown(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // A sheet is not a page: Back closes it. The pushed entry carries no URL of
  // its own (pushState with no url keeps the current one), so popping it can
  // never move the router off the login page.
  useEffect(() => {
    if (!open) return undefined;
    let popped = false;
    window.history.pushState({ patiDialog: 'forgotPassword' }, '');
    const onPop = () => {
      popped = true;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      // Closed from inside (the button, Escape, a finished reset): drop the
      // entry we pushed, or the next Back press would only undo it.
      if (!popped) window.history.back();
    };
  }, [open, onClose]);

  function message(err: unknown, fallback: string): string {
    return err instanceof Error && err.message ? err.message : fallback;
  }

  async function sendCode() {
    const address = email.trim();
    if (!address) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await forgotPassword(address);
      setStep('code');
      setCooldown(RESEND_COOLDOWN_S);
      setNotice(`${address} adresine bir kod gönderdik.`);
    } catch (err) {
      // 503 (this deployment sends no mail) and 429 (the IP limiter) are the
      // only refusals; neither depends on the address.
      setError(message(err, 'Kod gönderilemedi, biraz sonra tekrar dene.'));
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const address = email.trim();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await resetPassword(address, code, password);
    } catch (err) {
      setError(message(err, 'Şifre değiştirilemedi.'));
      setBusy(false);
      return;
    }
    // The password is already changed server-side. A failure from here on is
    // only about signing in, so it must never read as "the reset failed" —
    // the user can close the dialog and use the form behind it.
    try {
      await login(address, password);
      onClose();
    } catch {
      setNotice('Şifren değişti. Yeni şifrenle giriş yapabilirsin.');
      setStep('email');
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="backdrop" onClick={() => !busy && onClose()}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Şifremi unuttum"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="micro" style={{ textAlign: 'center' }}>
          şifremi unuttum
        </div>
        <h2 style={{ textAlign: 'center', margin: '2px 0 10px' }}>
          {step === 'email' ? 'Yeni şifre al' : 'Kodu gir'}
        </h2>

        {step === 'email' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendCode();
            }}
          >
            <p className="muted pw-lead">
              E-posta adresini yaz; hesabın varsa 6 haneli bir kod gönderelim.
            </p>
            <label className="field">
              <span>e-posta</span>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                required
                autoComplete="email"
                autoFocus
              />
            </label>
            {notice && <div className="pw-notice">{notice}</div>}
            {error && <div className="error">{error}</div>}
            <button className="btn full" disabled={busy || !email.trim()}>
              {busy ? 'Gönderiliyor…' : 'Kod gönder'}
            </button>
          </form>
        ) : (
          <form onSubmit={submit}>
            <p className="muted pw-lead">
              {notice ?? `${email.trim()} adresine gönderdiğimiz kodu ve yeni şifreni gir.`}
            </p>
            <label className="field pw-code">
              <span>kod</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  setError(null);
                }}
                required
                autoFocus
              />
            </label>
            <label className="field">
              <span>yeni şifre</span>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            {error && <div className="error">{error}</div>}
            <button
              className="btn full"
              disabled={busy || code.length !== 6 || password.length < 8}
            >
              {busy ? 'Bekleyin…' : 'Şifreyi değiştir'}
            </button>
            <button
              type="button"
              className="btn ghost full"
              style={{ marginTop: 8 }}
              disabled={busy || cooldown > 0}
              onClick={sendCode}
            >
              {cooldown > 0 ? `Kodu yeniden gönder (${cooldown})` : 'Kodu yeniden gönder'}
            </button>
          </form>
        )}

        <button
          type="button"
          className="link"
          style={{ display: 'block', margin: '12px auto 0' }}
          onClick={onClose}
          disabled={busy}
        >
          Vazgeç
        </button>
        <p className="subtle" style={{ textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
          Kod 15 dakika geçerli. Gelen kutunda yoksa spam klasörüne bak.
        </p>
      </div>
    </div>
  );
}
