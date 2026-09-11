import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchMyFriendships, FriendshipEntry } from '../api';
import { createGroup, openDirectConversation } from '../api/messages';
import { UserAvatar } from '../avatars';

type Mode = 'direct' | 'group';

/**
 * Start a DM with a friend, or name a group and tick several (mobile parity:
 * NewConversationScreen). Rendered in two places: the dialog the inbox opens
 * — starting a chat is a task, not a place (owner, 2026-09-11) — and the
 * /mesajlar/yeni route, which stays so the link keeps working. Either way it
 * navigates into the conversation it just created, which unmounts whichever
 * shell it was in.
 */
export function NewConversationForm() {

  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('direct');
  const [friends, setFriends] = useState<FriendshipEntry[] | null>(null);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMyFriendships()
      .then((d) => setFriends(d.friends))
      .catch(() => setFriends([]));
  }, []);

  async function startDirect(friend: FriendshipEntry) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await openDirectConversation(friend.id);
      // Replace, so "back" from the conversation lands on the inbox.
      navigate(`/mesajlar/${id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sohbet açılamadı');
      setBusy(false);
    }
  }

  function toggle(id: number) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submitGroup() {
    const trimmed = name.trim();
    if (!trimmed || picked.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { id } = await createGroup(trimmed, picked);
      navigate(`/mesajlar/${id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Grup kurulamadı');
      setBusy(false);
    }
  }

  return (
    <>
    <div className="chiprow" style={{ marginBottom: 14 }}>
      <button
        type="button"
        className={`chip${mode === 'direct' ? ' selected' : ''}`}
        onClick={() => setMode('direct')}
      >
        Birebir
      </button>
      <button
        type="button"
        className={`chip${mode === 'group' ? ' selected' : ''}`}
        onClick={() => setMode('group')}
      >
        Grup
      </button>
    </div>

    {mode === 'group' && (
      <label className="field">
        <span>grup adı</span>
        <input
          placeholder="Mahalle kedileri"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          autoCorrect="off"
        />
      </label>
    )}
    <div className="micro" style={{ marginBottom: 8 }}>
      {mode === 'direct' ? 'bir arkadaşını seç' : 'arkadaşlarını ekle'}
    </div>

    {error && <div className="error">{error}</div>}
    {friends === null && <p className="muted">Yükleniyor…</p>}
    {friends && friends.length === 0 && (
      <div className="card flat msg-empty">
        <strong>Henüz arkadaşın yok</strong>
        <div className="muted">Mesajlaşmak için önce arkadaş ekle.</div>
        <Link to="/arkadas-bul" className="btn" style={{ marginTop: 12 }}>
          Arkadaş bul
        </Link>
      </div>
    )}
    {friends?.map((f) => {
      const selected = mode === 'group' && picked.includes(f.id);
      return (
        <button
          key={f.id}
          type="button"
          className={`card flat row msg-pick${selected ? ' selected' : ''}`}
          onClick={() => (mode === 'direct' ? startDirect(f) : toggle(f.id))}
          disabled={busy}
        >
          <UserAvatar avatarUrl={f.avatar_url} name={f.name} size={40} />
          <strong className="grow" style={{ textAlign: 'left' }}>
            {f.name}
          </strong>
          {mode === 'group' ? (
            <span className={`msg-tick${selected ? ' on' : ''}`} aria-hidden>
              {selected ? '✓' : ''}
            </span>
          ) : (
            <span className="subtle">›</span>
          )}
        </button>
      );
    })}

    {mode === 'group' && (
      <button
        className="btn full"
        style={{ marginTop: 12 }}
        disabled={!name.trim() || picked.length === 0 || busy}
        onClick={submitGroup}
      >
        {busy
          ? 'Kuruluyor…'
          : picked.length
          ? `Grubu oluştur (${picked.length})`
          : 'Grubu oluştur'}
      </button>
    )}
    </>
  );
}
