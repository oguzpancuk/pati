import { useEffect, useState } from 'react';
import { BlockedUser, fetchMyBlocks, unblockUser } from '../../api';
import { UserAvatar } from '../../avatars';

/**
 * The people you blocked, inside the settings sheet (App Store guideline
 * 1.2; ROADMAP "App Store readiness", R3) — mobile's BlockedUsersSection. A
 * section rather than a sheet of its own: the list is short, blocking is
 * rare, and it loads itself when the sheet mounts it.
 */
export function BlockedUsersSection() {
  const [users, setUsers] = useState<BlockedUser[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyBlocks()
      .then((list) => {
        if (!cancelled) setUsers(list);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function unblock(user: BlockedUser) {
    // Says what does NOT come back: the friendship is asked for again.
    if (
      !window.confirm(
        `${user.name} yeniden arkadaşlık isteği gönderebilir ve yorumları görünür. Arkadaşlık kendiliğinden geri gelmez. Engeli kaldırmak istiyor musun?`
      )
    )
      return;
    setBusyId(user.id);
    setError(null);
    try {
      await unblockUser(user.id);
      setUsers((prev) => (prev ? prev.filter((u) => u.id !== user.id) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaldırılamadı');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="label">engellediklerim</div>
      {failed ? (
        <div className="subtle">Liste yüklenemedi.</div>
      ) : users === null ? (
        <div className="subtle">Yükleniyor…</div>
      ) : users.length === 0 ? (
        <div className="subtle">Kimseyi engellemedin.</div>
      ) : (
        users.map((user) => (
          <div key={user.id} className="row" style={{ gap: 8, marginBottom: 8 }}>
            <UserAvatar avatarUrl={user.avatar_url} name={user.name} size={32} />
            <div className="name-with-chip grow">
              <strong>{user.name}</strong>
              {user.is_demo && <span className="demo-chip">demo</span>}
            </div>
            <button
              className="btn small ghost"
              disabled={busyId === user.id}
              onClick={() => unblock(user)}
            >
              engeli kaldır
            </button>
          </div>
        ))
      )}
      {error && <div className="error">{error}</div>}
    </>
  );
}
