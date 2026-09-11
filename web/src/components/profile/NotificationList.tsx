import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AppNotification,
  fetchNotifications,
  markNotificationsRead,
  notificationTitle,
} from '../../api/animalSocial';
import { UserAvatar } from '../../avatars';
import { CareAlertEntry, markCareAlertsRead, readCareAlertLog } from '../../careAlertLog';
import { BellIcon } from './icons';

const PAGE = 30;

// One list, two sources (mobile parity: NotificationList): the server's rows
// (animal events) and the browser's own food/water alerts (careAlertLog).
// Merged newest first; the device entries open nothing.
type Row =
  | { key: string; source: 'server'; at: string; unread: boolean; item: AppNotification }
  | { key: string; source: 'device'; at: string; unread: boolean; item: CareAlertEntry };

function toRows(server: AppNotification[], device: CareAlertEntry[]): Row[] {
  const rows: Row[] = [
    ...server.map<Row>((n) => ({
      key: `s${n.id}`,
      source: 'server',
      at: n.created_at,
      unread: !n.read_at,
      item: n,
    })),
    ...device.map<Row>((e) => ({
      key: `d${e.id}`,
      source: 'device',
      at: e.createdAt,
      unread: !e.readAt,
      item: e,
    })),
  ];
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * The notification inbox as a list. One component so the Notifications page
 * (deep links and push open it) and the bell sheet on the profile cannot
 * drift apart.
 */
export function NotificationList({
  onRead,
  inSheet = false,
  onNavigate,
}: {
  /** Fired once the inbox was marked read, so a bell count can drop at once. */
  onRead?: () => void;
  /** Inside a sheet a row replaces the sheet's own history entry. */
  inSheet?: boolean;
  onNavigate?: () => void;
}) {
  const [server, setServer] = useState<AppNotification[]>([]);
  const [device, setDevice] = useState<CareAlertEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Held in a ref: an inline callback would otherwise rebuild `load` every
  // render and re-run the effect forever.
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  const load = useCallback(async () => {
    try {
      const page = await fetchNotifications(PAGE, 0);
      const log = readCareAlertLog();
      setServer(page.notifications);
      setTotal(page.total);
      setDevice(log);
      // Opening the inbox reads it, the way a chat does; the rows keep
      // their unread mark for this visit so the new ones stand out.
      const deviceUnread = log.some((e) => !e.readAt);
      if (page.unreadCount > 0) markNotificationsRead().catch(() => {});
      if (deviceUnread) markCareAlertsRead();
      if (page.unreadCount > 0 || deviceUnread) onReadRef.current?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const page = await fetchNotifications(PAGE, server.length);
      setServer((prev) => [
        ...prev,
        ...page.notifications.filter((n) => !prev.some((p) => p.id === n.id)),
      ]);
      setTotal(page.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi');
    } finally {
      setLoadingMore(false);
    }
  }

  const rows = toRows(server, device);

  return (
    <>
      {error && <div className="error">{error}</div>}
      {loading && <p className="muted">Yükleniyor…</p>}
      {!loading && rows.length === 0 && (
        <div className="card flat">
          <strong>Henüz bildirim yok</strong>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Takip ettiğin ya da bakım verdiğin hayvanlara yorum, görülme, sağlık veya aşı kaydı
            eklendiğinde ya da biri bakım vermeye başladığında burada görürsün.
          </p>
        </div>
      )}

      {rows.map((row) =>
        row.source === 'device' ? (
          <div key={row.key} className={`inbox-row ${row.unread ? 'unread' : ''}`}>
            <span className="inbox-bell">
              <BellIcon size={18} />
            </span>
            <div className="inbox-body">
              <strong>{row.item.title}</strong>
              <div className="inbox-text">{row.item.body}</div>
              <div className="subtle">{formatDate(row.item.createdAt)}</div>
            </div>
          </div>
        ) : row.item.animal_id ? (
          <Link
            key={row.key}
            to={`/hayvanlar/${row.item.animal_id}`}
            replace={inSheet}
            onClick={onNavigate}
            className={`inbox-row ${row.unread ? 'unread' : ''}`}
          >
            <UserAvatar
              avatarUrl={row.item.actor_avatar_url}
              name={row.item.payload.actorName ?? '?'}
              size={36}
            />
            <div className="inbox-body">
              <strong>{notificationTitle(row.item)}</strong>
              {row.item.payload.text && <div className="inbox-text">{row.item.payload.text}</div>}
              <div className="subtle">{formatDate(row.item.created_at)}</div>
            </div>
            <span className="subtle">›</span>
          </Link>
        ) : (
          <div key={row.key} className={`inbox-row ${row.unread ? 'unread' : ''}`}>
            <UserAvatar
              avatarUrl={row.item.actor_avatar_url}
              name={row.item.payload.actorName ?? '?'}
              size={36}
            />
            <div className="inbox-body">
              <strong>{notificationTitle(row.item)}</strong>
              {row.item.payload.text && <div className="inbox-text">{row.item.payload.text}</div>}
              <div className="subtle">{formatDate(row.item.created_at)}</div>
            </div>
          </div>
        )
      )}

      {total > server.length && (
        <button className="btn ghost small full" disabled={loadingMore} onClick={loadMore}>
          {loadingMore ? 'Yükleniyor…' : `Önceki bildirimleri yükle (${total - server.length})`}
        </button>
      )}
    </>
  );
}
