import { FormEvent, useState } from 'react';
import { changePassword } from '../../api/password';
import '../../styles/password.css';

/**
 * "Şifremi değiştir" as a self-contained block, so it can sit inside whatever
 * sheet the profile grows (it is mounted by the settings sheet, not by this
 * track). It renders a heading, its fields and its own button — no sheet
 * chrome, no navigation.
 *
 * Two shapes, one form. An account that HAS a password types the current one:
 * a borrowed browser tab must not be enough to lock its owner out. An account
 * created through Apple/Google has none — asking it for a password nobody
 * ever chose would leave those users unable to set one at all — so for them
 * this is "şifre belirle" and the session they are already holding is the
 * proof.
 *
 * Mirrors the mobile client's ChangePasswordForm.
 */
export function ChangePasswordForm({
  hasPassword,
  onChanged,
}: {
  /** `me.hasPassword`; false only for accounts that never had one. */
  hasPassword: boolean;
  /** Fired after a successful change — the parent reloads `me` so this flips. */
  onChanged?: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = repeat.length > 0 && repeat !== password;
  const ready = password.length >= 8 && repeat === password && (!hasPassword || current.length > 0);

  function touched() {
    setError(null);
    setDone(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await changePassword({
        password,
        ...(hasPassword ? { currentPassword: current } : {}),
      });
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

  return (
    <form onSubmit={submit}>
      <h2 style={{ margin: '0 0 4px' }}>{hasPassword ? 'Şifreni değiştir' : 'Şifre belirle'}</h2>
      <p className="muted pw-lead">
        {hasPassword
          ? 'Yeni şifren en az 8 karakter olmalı.'
          : 'Hesabın Apple/Google ile açılmış. Şifre belirlersen e-postanla da giriş yapabilirsin.'}
      </p>

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

      <button className="btn full" disabled={busy || !ready}>
        {busy ? 'Bekleyin…' : hasPassword ? 'Şifreyi değiştir' : 'Şifreyi belirle'}
      </button>
    </form>
  );
}
