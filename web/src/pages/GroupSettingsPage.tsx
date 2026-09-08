import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchMyFriendships, FriendshipEntry } from '../api';
import { useAuth } from '../auth';
import {
  addMember,
  ConversationDetail,
  fetchConversation,
  leaveGroup,
  Member,
  promoteMember,
  removeMember,
  renameGroup,
} from '../api/messages';
import { UserAvatar } from '../avatars';

/**
 * A group's name and members (mobile parity: GroupSettingsScreen). Admins
 * rename, add their own friends, promote and remove; everyone can leave.
 * The server decides every rule; this page only hides what it would refuse.
 */
export default function GroupSettingsPage() {
  const { id } = useParams();
  const conversationId = Number(id);
  const navigate = useNavigate();
  const { me } = useAuth();
  const myId = me?.id;
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [friends, setFriends] = useState<FriendshipEntry[] | null>(null);
  const [openFor, setOpenFor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchConversation(conversationId);
      setDetail(d);
      setName(d.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Grup bulunamadı');
    }
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  const isAdmin = detail?.role === 'admin';

  function applyMembers(members: Member[]) {
    setDetail((prev) => (prev ? { ...prev, members } : prev));
    setOpenFor(null);
  }

  function fail(err: unknown) {
    setError(err instanceof Error ? err.message : 'Olmadı');
  }

  async function saveName() {
    const trimmed = name.trim();
    if (!detail || !trimmed || trimmed === detail.name) return;
    setSaving(true);
    setError(null);
    try {
      await renameGroup(conversationId, trimmed);
      setDetail({ ...detail, name: trimmed });
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function openAdd() {
    setAdding(true);
    if (friends === null) {
      try {
        setFriends((await fetchMyFriendships()).friends);
      } catch {
        setFriends([]);
      }
    }
  }

  async function leave() {
    if (!window.confirm('Bu gruptan ayrılmak istediğine emin misin?')) return;
    try {
      await leaveGroup(conversationId);
      navigate('/mesajlar', { replace: true });
    } catch (err) {
      fail(err);
    }
  }

  const memberIds = new Set(detail?.members.map((m) => m.id) ?? []);
  const candidates = (friends ?? []).filter((f) => !memberIds.has(f.id));

  return (
    <div className="page">
      <div className="topbar">
        <button className="back" onClick={() => navigate(-1)} aria-label="Geri">
          ‹
        </button>
        <div className="micro">grup ayarları</div>
        <span />
      </div>

      {error && <div className="error">{error}</div>}
      {!detail && !error && <p className="muted">Yükleniyor…</p>}

      {detail && (
        <>
          <label className="field">
            <span>grup adı</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              disabled={!isAdmin}
            />
          </label>
          {!isAdmin && (
            <div className="subtle" style={{ marginTop: -6, marginBottom: 12 }}>
              Adı yalnızca yöneticiler değiştirebilir
            </div>
          )}
          {isAdmin && name.trim() && name.trim() !== detail.name && (
            <button className="btn small" onClick={saveName} disabled={saving}>
              {saving ? 'Kaydediliyor…' : 'Adı kaydet'}
            </button>
          )}

          <div className="row" style={{ marginTop: 16 }}>
            <div className="micro grow">üyeler · {detail.members.length}</div>
            {isAdmin && !adding && (
              <button type="button" className="link" onClick={openAdd}>
                arkadaş ekle
              </button>
            )}
          </div>
          {detail.members.map((m) => {
            const actionable = isAdmin && m.id !== myId && m.role !== 'admin';
            return (
              <div key={m.id} className="card flat" style={{ marginTop: 8, padding: 12 }}>
                <div className="row">
                  <UserAvatar avatarUrl={m.avatar_url} name={m.name} size={40} />
                  <strong className="grow">
                    {m.name}
                    {m.id === myId ? ' (sen)' : ''}
                  </strong>
                  {m.role === 'admin' && <span className="tag brand">yönetici</span>}
                  {actionable && (
                    <button
                      type="button"
                      className="link"
                      onClick={() => setOpenFor(openFor === m.id ? null : m.id)}
                    >
                      {openFor === m.id ? 'kapat' : 'düzenle'}
                    </button>
                  )}
                </div>
                {openFor === m.id && (
                  <div className="row" style={{ marginTop: 10, justifyContent: 'flex-end' }}>
                    <button
                      className="btn outline small"
                      onClick={() => promoteMember(conversationId, m.id).then(applyMembers, fail)}
                    >
                      Yönetici yap
                    </button>
                    <button
                      className="btn outline small danger"
                      onClick={() => removeMember(conversationId, m.id).then(applyMembers, fail)}
                    >
                      Gruptan çıkar
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {adding && (
            <>
              <div className="row" style={{ marginTop: 16 }}>
                <div className="micro grow">arkadaş ekle</div>
                <button type="button" className="link" onClick={() => setAdding(false)}>
                  kapat
                </button>
              </div>
              {friends === null && <p className="muted">Yükleniyor…</p>}
              {friends && candidates.length === 0 && (
                <p className="muted">Eklenecek arkadaşın kalmadı.</p>
              )}
              {candidates.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="card flat row msg-pick"
                  style={{ marginTop: 8 }}
                  onClick={() => addMember(conversationId, f.id).then(applyMembers, fail)}
                >
                  <UserAvatar avatarUrl={f.avatar_url} name={f.name} size={40} />
                  <strong className="grow" style={{ textAlign: 'left' }}>
                    {f.name}
                  </strong>
                  <span className="link">ekle</span>
                </button>
              ))}
            </>
          )}

          <button className="btn outline full danger" style={{ marginTop: 24 }} onClick={leave}>
            Gruptan ayrıl
          </button>
        </>
      )}
    </div>
  );
}
