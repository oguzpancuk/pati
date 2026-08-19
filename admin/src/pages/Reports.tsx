import { useState } from 'react';
import { AdminReport, api } from '../api';
import Modal from '../components/Modal';
import Pager from '../components/Pager';
import { formatDateTime } from '../format';
import { useList } from '../useList';

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  abuse: 'Hakaret / taciz',
  wrong_info: 'Yanlış bilgi',
  animal_welfare: 'Hayvan refahı',
  other: 'Diğer',
};

const TARGET_LABELS: Record<string, string> = {
  animal: 'Hayvan',
  comment: 'Yorum',
  care_action: 'Bakım kaydı',
  user: 'Kullanıcı',
};

type StatusFilter = 'open' | 'resolved' | 'dismissed';

/**
 * The moderation queue. Closing a report deliberately does NOT delete the
 * reported content — deletion lives on the entity's own screen with its own
 * audit trail. The flow: read the report, act on the content on its own page
 * if needed, then close the report here with a note.
 */
export default function Reports() {
  const [status, setStatus] = useState<StatusFilter>('open');
  const [closing, setClosing] = useState<AdminReport | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const list = useList<AdminReport>(
    `/admin/reports?status=${status}`,
    (d: { reports: AdminReport[]; total: number }) => ({ items: d.reports, total: d.total }),
    [status]
  );

  return (
    <>
      <h1>Şikayetler</h1>
      <p className="page-hint">
        Kullanıcı şikayetleri. İçeriği kendi ekranından yönetin (silme/askıya alma), sonra şikayeti
        burada kapatın.
      </p>

      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          <option value="open">Açık</option>
          <option value="resolved">Çözüldü</option>
          <option value="dismissed">Yersiz</option>
        </select>
      </div>

      {(list.error || actionError) && (
        <div className="error-banner">{list.error ?? actionError}</div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Hedef</th>
              <th>Neden</th>
              <th>Şikayet eden</th>
              <th>Zaman</th>
              {status !== 'open' && <th>Sonuç</th>}
              <th className="actions"></th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((report) => (
              <tr key={report.id}>
                <td style={{ maxWidth: 380 }}>
                  <strong>{TARGET_LABELS[report.target_type] ?? report.target_type}</strong>
                  <span className="muted mono"> #{report.target_id}</span>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {report.target_summary ?? 'İçerik silinmiş'}
                  </div>
                </td>
                <td>
                  {REASON_LABELS[report.reason] ?? report.reason}
                  {report.details && (
                    <div className="muted" style={{ fontSize: 12, maxWidth: 260 }}>
                      {report.details}
                    </div>
                  )}
                </td>
                <td>{report.reporter_name}</td>
                <td className="num muted">{formatDateTime(report.created_at)}</td>
                {status !== 'open' && (
                  <td className="muted" style={{ maxWidth: 220 }}>
                    {report.resolved_by_name}
                    {report.resolution_note && (
                      <div style={{ fontSize: 12 }}>{report.resolution_note}</div>
                    )}
                  </td>
                )}
                <td className="actions">
                  {status === 'open' && (
                    <button className="small" onClick={() => setClosing(report)}>
                      Kapat
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.loading && list.items.length === 0 && (
          <div className="empty">
            {status === 'open' ? 'Açık şikayet yok. 🎉' : 'Kayıt yok.'}
          </div>
        )}
        {list.loading && <div className="empty">Yükleniyor…</div>}
      </div>

      <Pager offset={list.offset} limit={list.limit} total={list.total} onChange={list.setOffset} />

      {closing && (
        <CloseReportModal
          report={closing}
          onClose={() => setClosing(null)}
          onDone={() => {
            setClosing(null);
            setActionError(null);
            list.reload();
          }}
          onError={setActionError}
        />
      )}
    </>
  );
}

function CloseReportModal({
  report,
  onClose,
  onDone,
  onError,
}: {
  report: AdminReport;
  onClose: () => void;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function close(status: 'resolved' | 'dismissed') {
    setBusy(true);
    try {
      await api.patch(`/admin/reports/${report.id}`, { status, note: note.trim() || null });
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Kapatılamadı');
      // Another admin may have closed it already (404): reload so the row
      // doesn't linger as open and keep failing.
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Şikayeti kapat"
      hint={`${TARGET_LABELS[report.target_type]} #${report.target_id} · ${
        REASON_LABELS[report.reason] ?? report.reason
      }`}
      onClose={onClose}
      footer={
        <>
          <button className="small" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="small" onClick={() => close('dismissed')} disabled={busy}>
            Yersiz
          </button>
          <button className="small primary" onClick={() => close('resolved')} disabled={busy}>
            Çözüldü
          </button>
        </>
      }
    >
      <label className="field">
        <span>Not (isteğe bağlı)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Ne yapıldı? Örn. yorum silindi, kullanıcı uyarıldı"
        />
      </label>
    </Modal>
  );
}
