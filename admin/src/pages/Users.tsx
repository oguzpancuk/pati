import { useState } from 'react';
import { patiAvatarSvg } from '../patiAvatar';
import { AdminUser, api } from '../api';
import Modal from '../components/Modal';
import Pager from '../components/Pager';
import { formatDate } from '../format';
import { useList } from '../useList';

/**
 * A deleted account is a tombstone, not a row: the backend anonymized it in
 * place and gave it an address in this domain, and asking to delete it
 * again can only answer 409. The list showed "Sil" on those rows anyway,
 * which put an error in the banner for a button that had nothing to do
 * (QA finding, 2026-09-10). Same rule as the server's own refusal.
 */
const DELETED_DOMAIN = '@deleted.pati-app.com';

function isDeleted(user: AdminUser) {
  return user.email.endsWith(DELETED_DOMAIN);
}

const ROLE_LABELS: Record<AdminUser['role'], string> = {
  admin: 'Yönetici',
  vet: 'Veteriner',
  user: 'Kullanıcı',
};

export default function Users() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
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
        Rol değiştirme, askıya alma ve hesap silme. Askıya alınan hesap token'ı elinde olsa
        bile API'ye erişemez; silinen hesabın kişisel bilgileri kaldırılır, bıraktığı mama,
        su ve yorumlar "Silinmiş Üye" adıyla kalır ve e-posta adresi yeniden kullanılabilir
        hale gelir.
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
                  </button>{' '}
                  {!isDeleted(user) && (
                    <button className="small danger" onClick={() => setDeleting(user)}>
                      Sil
                    </button>
                  )}
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

      {deleting && (
        <DeleteUserModal
          user={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            setActionError(null);
            list.reload();
          }}
          onError={(message) => {
            setActionError(message);
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}

/**
 * Deleting a user is the support tool for an address somebody registered
 * and abandoned. It is not reversible and it is not a suspension, so the
 * dialog says what actually happens rather than asking "emin misiniz?".
 */
function DeleteUserModal({
  user,
  onClose,
  onDeleted,
  onError,
}: {
  user: AdminUser;
  onClose: () => void;
  onDeleted: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      title="Hesabı sil"
      hint={user.email}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button
            className="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.del(`/admin/users/${user.id}`);
                onDeleted();
              } catch (err) {
                onError(err instanceof Error ? err.message : 'Silinemedi');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Siliniyor…' : 'Hesabı sil'}
          </button>
        </>
      }
    >
      <p>
        <strong>{user.name}</strong> hesabının adı, e-postası, şifresi, fotoğrafı ve
        arkadaşlıkları kaldırılacak. Bıraktığı mama, su, hayvan kayıtları ve yorumlar
        topluluğun geçmişi olduğu için <strong>Silinmiş Üye</strong> adıyla duracak.
      </p>
      <p className="muted">
        E-posta adresi böylece yeniden kaydolmak için serbest kalır. Bu işlem geri alınamaz —
        geçici bir yaptırım için "Düzenle" içindeki askıya almayı kullanın.
      </p>
    </Modal>
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
 * User image: an uploaded photo, a built-in avatar (pati-avatar:*), or an
 * empty circle. The avatar SVG is static markup we generate ourselves, so
 * dangerouslySetInnerHTML is safe here; no user input reaches the HTML
 * (an unrecognized key returns null and draws the empty circle).
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
