import { useState } from 'react';
import { AdminVaccination, api } from '../api';
import Modal from '../components/Modal';
import Pager from '../components/Pager';
import { formatDateTime, speciesLabel } from '../format';
import { useList } from '../useList';

export default function Vaccinations() {
  const [q, setQ] = useState('');
  const [vetOnly, setVetOnly] = useState(false);
  const [deleting, setDeleting] = useState<AdminVaccination | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (vetOnly) params.set('vetVerified', 'true');
  const query = params.toString();

  const list = useList<AdminVaccination>(
    `/admin/vaccinations${query ? `?${query}` : ''}`,
    (d: { vaccinations: AdminVaccination[]; total: number }) => ({
      items: d.vaccinations,
      total: d.total,
    }),
    [q, vetOnly]
  );

  return (
    <>
      <h1>Aşı Kayıtları</h1>
      <p className="page-hint">
        Not alanı serbest metin olduğu için moderasyona tabi. Yanlış girilen ya da kötüye kullanılan
        kayıtları silin — silme denetim kaydına yazılır.
      </p>

      <div className="toolbar">
        <input
          placeholder="Aşı türü, not ya da hayvan adı ara…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={vetOnly} onChange={(e) => setVetOnly(e.target.checked)} />
          Yalnızca veteriner onaylı
        </label>
      </div>

      {(list.error || actionError) && (
        <div className="error-banner">{list.error ?? actionError}</div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Aşı</th>
              <th>Hayvan</th>
              <th>Not</th>
              <th>Kaydeden</th>
              <th>Uygulama</th>
              <th>Sonraki doz</th>
              <th className="actions"></th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((v) => (
              <tr key={v.id}>
                <td>
                  <div>{v.vaccine_type}</div>
                  {v.vet_verified && <span className="tag tag-vet">Veteriner onaylı</span>}
                </td>
                <td>
                  <div>{v.animal_name ?? speciesLabel(v.animal_species)}</div>
                  <div className="muted">{v.animal_breed ?? '—'}</div>
                </td>
                <td className="muted">{v.note ?? '—'}</td>
                <td>{v.recorded_by_name}</td>
                <td className="num muted">{formatDateTime(v.administered_at)}</td>
                <td className="num muted">{v.next_due_at ? formatDateTime(v.next_due_at) : '—'}</td>
                <td className="actions">
                  <button className="small danger" onClick={() => setDeleting(v)}>
                    Sil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.loading && list.items.length === 0 && <div className="empty">Kayıt yok.</div>}
        {list.loading && <div className="empty">Yükleniyor…</div>}
      </div>

      <Pager offset={list.offset} limit={list.limit} total={list.total} onChange={list.setOffset} />

      {deleting && (
        <DeleteVaccinationModal
          vaccination={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            setActionError(null);
            list.reload();
          }}
          onError={setActionError}
        />
      )}
    </>
  );
}

function DeleteVaccinationModal({
  vaccination,
  onClose,
  onDeleted,
  onError,
}: {
  vaccination: AdminVaccination;
  onClose: () => void;
  onDeleted: () => void;
  onError: (m: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await api.del(`/admin/vaccinations/${vaccination.id}`, { reason: reason.trim() || null });
      onDeleted();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Silinemedi');
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Aşı kaydını sil"
      hint={`${vaccination.vaccine_type} · ${vaccination.recorded_by_name} · ${formatDateTime(vaccination.administered_at)}`}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="danger" onClick={remove} disabled={busy}>
            {busy ? 'Siliniyor…' : 'Sil'}
          </button>
        </>
      }
    >
      {vaccination.note && <p className="muted">Not: {vaccination.note}</p>}
      <label className="field">
        <span>Silme sebebi (denetim kaydına yazılır)</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Örn. mükerrer kayıt"
        />
      </label>
    </Modal>
  );
}
