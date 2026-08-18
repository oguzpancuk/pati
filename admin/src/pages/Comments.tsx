import { useState } from 'react';
import { AdminComment, api } from '../api';
import Modal from '../components/Modal';
import Pager from '../components/Pager';
import { animalTitle, formatDateTime } from '../format';
import { useList } from '../useList';

export default function Comments() {
  const [deleting, setDeleting] = useState<AdminComment | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const list = useList<AdminComment>(
    '/admin/comments',
    (d: { comments: AdminComment[]; total: number }) => ({ items: d.comments, total: d.total })
  );

  return (
    <>
      <h1>Yorumlar</h1>
      <p className="page-hint">Hayvan profillerindeki sohbet. Uygunsuz yorumları silin.</p>

      {(list.error || actionError) && (
        <div className="error-banner">{list.error ?? actionError}</div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Yorum</th>
              <th>Yazan</th>
              <th>Hayvan</th>
              <th>Zaman</th>
              <th className="actions"></th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((comment) => (
              <tr key={comment.id}>
                <td style={{ maxWidth: 420 }}>
                  {comment.body}
                  {comment.health_record_id !== null && (
                    <div className="muted" style={{ fontSize: 12 }}>
                      Sağlık kaydına bağlı
                    </div>
                  )}
                </td>
                <td>{comment.user_name}</td>
                <td>
                  {animalTitle({ name: comment.animal_name, species: comment.animal_species })}
                  <div className="muted mono">#{comment.animal_id}</div>
                </td>
                <td className="num muted">{formatDateTime(comment.created_at)}</td>
                <td className="actions">
                  <button className="small danger" onClick={() => setDeleting(comment)}>
                    Sil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.loading && list.items.length === 0 && <div className="empty">Yorum yok.</div>}
        {list.loading && <div className="empty">Yükleniyor…</div>}
      </div>

      <Pager offset={list.offset} limit={list.limit} total={list.total} onChange={list.setOffset} />

      {deleting && (
        <DeleteCommentModal
          comment={deleting}
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

function DeleteCommentModal({
  comment,
  onClose,
  onDeleted,
  onError,
}: {
  comment: AdminComment;
  onClose: () => void;
  onDeleted: () => void;
  onError: (m: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await api.del(`/admin/comments/${comment.id}`, { reason: reason.trim() || null });
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
      title="Yorumu sil"
      hint={`${comment.user_name} · ${formatDateTime(comment.created_at)}`}
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
      <blockquote
        style={{
          margin: '14px 0 0',
          padding: '10px 14px',
          background: 'var(--sunken)',
          borderRadius: 6,
        }}
      >
        {comment.body}
      </blockquote>
      <label className="field">
        <span>Silme sebebi (denetim kaydına yazılır)</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Örn. hakaret"
        />
      </label>
    </Modal>
  );
}
