import { useState } from 'react';
import { AdminCareAction, api } from '../api';
import Modal from '../components/Modal';
import Pager from '../components/Pager';
import { formatDateTime, formatPoint } from '../format';
import { useList } from '../useList';

type TypeFilter = '' | 'food' | 'water';

export default function CareActions() {
  const [actionType, setActionType] = useState<TypeFilter>('');
  const [deleting, setDeleting] = useState<AdminCareAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const list = useList<AdminCareAction>(
    `/admin/care-actions${actionType ? `?actionType=${actionType}` : ''}`,
    (d: { careActions: AdminCareAction[]; total: number }) => ({
      items: d.careActions,
      total: d.total,
    }),
    [actionType]
  );

  return (
    <>
      <h1>Bakım Kayıtları</h1>
      <p className="page-hint">
        Fotoğraf moderasyonu. Kanıt fotoğrafı gerçekten mama/su göstermiyorsa kaydı silin —
        silinen kayıt haritadan da kalkar ve kullanıcının serisini etkiler.
      </p>

      <div className="toolbar">
        <select value={actionType} onChange={(e) => setActionType(e.target.value as TypeFilter)}>
          <option value="">Mama ve su</option>
          <option value="food">Yalnızca mama</option>
          <option value="water">Yalnızca su</option>
        </select>
      </div>

      {(list.error || actionError) && (
        <div className="error-banner">{list.error ?? actionError}</div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fotoğraf</th>
              <th>Tür</th>
              <th>Kullanıcı</th>
              <th>Konum</th>
              <th>Zaman</th>
              <th className="actions"></th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((action) => (
              <tr key={action.id}>
                <td>
                  <a href={action.photo_url} target="_blank" rel="noreferrer">
                    <img className="thumb large" src={action.photo_url} alt="Bakım kanıtı" />
                  </a>
                </td>
                <td>{action.action_type === 'food' ? '🍲 Mama' : '💧 Su'}</td>
                <td>
                  <div>{action.user_name}</div>
                  {action.user_suspended_at && <span className="tag tag-suspended">Askıda</span>}
                </td>
                <td className="num muted mono">{formatPoint(action.location)}</td>
                <td className="num muted">{formatDateTime(action.created_at)}</td>
                <td className="actions">
                  <button className="small danger" onClick={() => setDeleting(action)}>
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
        <DeleteCareActionModal
          action={deleting}
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

function DeleteCareActionModal({
  action,
  onClose,
  onDeleted,
  onError,
}: {
  action: AdminCareAction;
  onClose: () => void;
  onDeleted: () => void;
  onError: (m: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await api.del(`/admin/care-actions/${action.id}`, { reason: reason.trim() || null });
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
      title="Bakım kaydını sil"
      hint={`${action.user_name} · ${formatDateTime(action.created_at)}`}
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
      <img
        src={action.photo_url}
        alt="Bakım kanıtı"
        style={{ width: '100%', borderRadius: 6, marginTop: 12 }}
      />
      <label className="field">
        <span>Silme sebebi (denetim kaydına yazılır)</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Örn. fotoğraf mama göstermiyor"
        />
      </label>
    </Modal>
  );
}
