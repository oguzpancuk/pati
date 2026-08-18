import { useState } from 'react';
import { patiAvatarSvg } from '../patiAvatar';
import { AdminUser, api } from '../api';
import Modal from '../components/Modal';
import Pager from '../components/Pager';
import { formatDate } from '../format';
import { useList } from '../useList';

const ROLE_LABELS: Record<AdminUser['role'], string> = {
  admin: 'Yönetici',
  vet: 'Veteriner',
  user: 'Kullanıcı',
};

export default function Users() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const list = useList<AdminUser>(
    `/admin/users${search ? `?q=${encodeURIComponent(search)}` : ''}`,
    (d: { users: AdminUser[]; total: number }) => ({ items: d.users, total: d.total }),
    [search]
  );

  return (
    <>
      <h1>Kullanıcılar</h1>
      <p className="page-hint">
        Rol değiştirme ve askıya alma. Askıya alınan hesap token'ı elinde olsa bile API'ye erişemez.
      </p>

      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(query.trim());
        }}
      >
        <input
          placeholder="İsim veya e-posta ara"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ minWidth: 240 }}
        />
        <button type="submit">Ara</button>
        {search && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSearch('');
            }}
          >
            Temizle
          </button>
        )}
      </form>

      {(list.error || actionError) && (
        <div className="error-banner">{list.error ?? actionError}</div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Kullanıcı</th>
              <th>Rol</th>
              <th>Bakım</th>
              <th>Hayvan</th>
              <th>Yorum</th>
              <th>Puan</th>
              <th>Katıldı</th>
              <th className="actions"></th>
            </tr>
          </thead>
          <tbody>
            {list.items.map((user) => (
              <tr key={user.id}>
                <td>
                  <UserThumb avatarUrl={user.avatar_url} />
                </td>
                <td>
                  <div>{user.name}</div>
                  <div className="muted mono">{user.email}</div>
                  {user.suspended_at && (
                    <div style={{ marginTop: 4 }}>
                      <span className="tag tag-suspended">Askıda</span>{' '}
                      <span className="muted">{user.suspended_reason}</span>
                    </div>
                  )}
                </td>
                <td>
                  <span className={`tag tag-${user.role}`}>{ROLE_LABELS[user.role]}</span>
                </td>
                <td className="num">{user.care_action_count}</td>
                <td className="num">{user.animal_count}</td>
                <td className="num">{user.comment_count}</td>
                <td className="num">{user.last_points}</td>
                <td className="num muted">{formatDate(user.created_at)}</td>
                <td className="actions">
                  <button className="small" onClick={() => setEditing(user)}>
                    Düzenle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.loading && list.items.length === 0 && <div className="empty">Kullanıcı yok.</div>}
        {list.loading && <div className="empty">Yükleniyor…</div>}
      </div>

      <Pager offset={list.offset} limit={list.limit} total={list.total} onChange={list.setOffset} />

      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setActionError(null);
            list.reload();
          }}
          onError={setActionError}
        />
      )}
    </>
  );
}

function EditUserModal({
  user,
  onClose,
  onSaved,
  onError,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [role, setRole] = useState<AdminUser['role']>(user.role);
  const [suspended, setSuspended] = useState(Boolean(user.suspended_at));
  const [reason, setReason] = useState(user.suspended_reason ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {};
      if (role !== user.role) payload.role = role;
      if (suspended !== Boolean(user.suspended_at)) {
        payload.suspended = suspended;
        if (suspended) payload.suspendedReason = reason.trim() || null;
      }
      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }
      await api.patch(`/admin/users/${user.id}`, payload);
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Kaydedilemedi');
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={user.name}
      hint={user.email}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button className="primary" onClick={save} disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </>
      }
    >
      <label className="field">
        <span>Rol</span>
        <select value={role} onChange={(e) => setRole(e.target.value as AdminUser['role'])}>
          <option value="user">Kullanıcı</option>
          <option value="vet">Veteriner</option>
          <option value="admin">Yönetici</option>
        </select>
      </label>

      <label className="field" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={suspended}
          onChange={(e) => setSuspended(e.target.checked)}
          style={{ width: 'auto' }}
        />
        <span style={{ margin: 0 }}>Hesabı askıya al</span>
      </label>

      {suspended && (
        <label className="field">
          <span>Askıya alma sebebi (kullanıcıya gösterilir)</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Örn. sahte bakım kaydı"
          />
        </label>
      )}
    </Modal>
  );
}

/**
 * Kullanıcı görseli: yüklenmiş fotoğraf, hazır avatar (pati-avatar:*) ya da
 * boş daire. Avatar SVG'si kendi ürettiğimiz statik işaretleme olduğu için
 * dangerouslySetInnerHTML burada güvenli; kullanıcı girdisi HTML'e karışmıyor
 * (tanınmayan anahtar null döner, boş daire çizilir).
 */
function UserThumb({ avatarUrl }: { avatarUrl: string | null }) {
  const svg = patiAvatarSvg(avatarUrl, 40);
  if (svg) {
    return <div className="thumb round" dangerouslySetInnerHTML={{ __html: svg }} />;
  }
  if (avatarUrl && !avatarUrl.startsWith('pati-avatar:')) {
    return <img className="thumb round" src={avatarUrl} alt="" />;
  }
  return <div className="thumb round" />;
}
