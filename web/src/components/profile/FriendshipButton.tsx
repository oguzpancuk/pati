import type { FriendshipStatus } from '../../api';

/**
 * The one control on someone else's profile, in the slot where your own
 * profile carries bell / arkadaşlar / ayarlar (owner, 2026-09-11). Its label
 * follows the friendship state; "Arkadaşsınız" is not a dead end — clicking
 * offers to end the friendship.
 */
export function FriendshipButton({
  status,
  busy = false,
  onAdd,
  onAccept,
  onRemove,
}: {
  status: FriendshipStatus;
  busy?: boolean;
  onAdd: () => void;
  onAccept: () => void;
  onRemove: () => void;
}) {
  if (status === 'self') return null;

  if (status === 'pending_sent') {
    return (
      <button className="btn secondary profile-friend-btn" disabled>
        İstek gönderildi
      </button>
    );
  }
  if (status === 'pending_received') {
    return (
      <button className="btn profile-friend-btn" disabled={busy} onClick={onAccept}>
        İsteği kabul et
      </button>
    );
  }
  if (status === 'friends') {
    return (
      <button
        className="btn secondary profile-friend-btn"
        disabled={busy}
        onClick={() => {
          if (window.confirm('Arkadaşlıktan çıkmak istiyor musun?')) onRemove();
        }}
      >
        Arkadaşsınız
      </button>
    );
  }
  return (
    <button className="btn profile-friend-btn" disabled={busy} onClick={onAdd}>
      Arkadaş ekle
    </button>
  );
}
