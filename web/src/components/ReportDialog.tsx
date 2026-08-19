import { useState } from 'react';
import { createReport } from '../api';
// Single copy of the reason list, shared with mobile (like @mobile/taxonomy).
import { REPORT_REASONS, ReportReason, ReportTargetType } from '@mobile/reportReasons';

/**
 * The report flow, shared by every reportable surface: a quiet "şikayet et"
 * text link that opens a bottom sheet with reason chips + an optional note.
 * The link is deliberately faint — reporting must exist everywhere but sell
 * nothing.
 */
export function ReportLink({
  targetType,
  targetId,
  style,
}: {
  targetType: ReportTargetType;
  targetId: number;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setOpen(false);
    setReason(null);
    setDetails('');
    setError(null);
    setDone(null);
  }

  async function submit() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await createReport(targetType, targetId, reason, details.trim() || undefined);
      setDone('Şikayetin alındı; en kısa sürede incelenecek. Teşekkürler.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gönderilemedi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="subtle"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, ...style }}
        onClick={() => setOpen(true)}
      >
        şikayet et
      </button>

      {open && (
        <div className="backdrop" onClick={() => !busy && reset()}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            {done ? (
              <>
                <p style={{ textAlign: 'center', margin: '12px 0 16px' }}>{done}</p>
                <button className="btn full" onClick={reset}>
                  Tamam
                </button>
              </>
            ) : (
              <>
                <div className="micro" style={{ textAlign: 'center' }}>
                  şikayet
                </div>
                <h2 style={{ textAlign: 'center', margin: '2px 0 4px' }}>Sorun ne?</h2>
                <p className="muted" style={{ textAlign: 'center', margin: '0 0 14px' }}>
                  Şikayetin yalnızca moderasyon ekibine gider.
                </p>

                <div className="chiprow" style={{ flexWrap: 'wrap', marginBottom: 14 }}>
                  {REPORT_REASONS.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      className={`chip${reason === r.key ? ' selected' : ''}`}
                      onClick={() => setReason(r.key)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>

                <label className="field">
                  <span>açıklama (isteğe bağlı)</span>
                  <textarea
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    rows={3}
                    maxLength={1000}
                  />
                </label>

                {error && <div className="error">{error}</div>}

                <button className="btn full" disabled={!reason || busy} onClick={submit}>
                  {busy ? 'Gönderiliyor…' : 'Şikayeti gönder'}
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
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
