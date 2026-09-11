import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { FriendshipEntry } from '../../api';
import { UserAvatar } from '../../avatars';
import { LoadMoreButton } from '../LoadMoreButton';
import { Sheet } from './Sheet';

const FRIEND_PAGE = 20;
const FRIEND_PREVIEW = 8;

/**
 * Arkadaşlar as a sheet over the profile (owner, 2026-09-11): incoming
 * requests first — they are the only rows that need an answer — then the
 * friend list. "arkadaş bul" sits in the sheet header.
 *
 * Links replace the sheet's own history entry (see `useSheetDismiss`), so
 * one back press from the opened profile returns to a clean /profil.
 */
export function FriendsSheet({
  open,
  onClose,
  incoming,
  friends,
  busy,
  onAccept,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  incoming: FriendshipEntry[];
  friends: FriendshipEntry[];
  busy: boolean;
  onAccept: (entry: FriendshipEntry) => void;
  onRemove: (entry: FriendshipEntry) => void;
}) {
  const [visibleFriends, setVisibleFriends] = useState(FRIEND_PREVIEW);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Arkadaşlarım"
      action={
        <Link to="/arkadas-bul" replace className="link" onClick={onClose}>
          arkadaş bul
        </Link>
      }
    >
      {incoming.length > 0 && (
        <>
          <div className="label">gelen istekler</div>
          {incoming.map((entry) => (
            <div key={entry.friendship_id} className="card flat">
              <Link
                to={`/kullanici/${entry.id}`}
                replace
                onClick={onClose}
                className="row"
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <UserAvatar avatarUrl={entry.avatar_url} name={entry.name} size={36} />
                <div className="name-with-chip grow">
                  <strong>{entry.name}</strong>
                  {entry.is_demo && <span className="demo-chip">demo</span>}
                </div>
              </Link>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn small" disabled={busy} onClick={() => onAccept(entry)}>
                  Kabul et
                </button>
                <button className="btn small ghost" disabled={busy} onClick={() => onRemove(entry)}>
                  Reddet
                </button>
              </div>
            </div>
          ))}
          <div className="label">arkadaşlarım</div>
        </>
      )}

      {friends.length === 0 ? (
        <div className="card flat">
          <span className="muted">Henüz arkadaşın yok.</span>
        </div>
      ) : (
        friends.slice(0, visibleFriends).map((f) => (
          <Link
            key={f.friendship_id}
            to={`/kullanici/${f.id}`}
            replace
            onClick={onClose}
            className="card flat row"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <UserAvatar avatarUrl={f.avatar_url} name={f.name} size={36} />
            <div className="name-with-chip grow">
              <strong>{f.name}</strong>
              {f.is_demo && <span className="demo-chip">demo</span>}
            </div>
            <span className="subtle">›</span>
          </Link>
        ))
      )}
      <LoadMoreButton
        remaining={friends.length - visibleFriends}
        onClick={() => setVisibleFriends((n) => n + FRIEND_PAGE)}
      />
    </Sheet>
  );
}
