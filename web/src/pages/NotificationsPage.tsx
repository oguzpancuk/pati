import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AppNotification,
  fetchNotifications,
  markNotificationsRead,
  notificationTitle,
} from '../api/animalSocial';
import { UserAvatar } from '../avatars';
import { CareAlertEntry, markCareAlertsRead, readCareAlertLog } from '../careAlertLog';

const PAGE = 30;

// One list, two sources (mobile parity: NotificationsScreen): the server's
// rows (animal events) and the browser's own food/water alerts
// (careAlertLog). Merged newest first; the device entries open nothing.
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

function BellIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--brand)"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2Z M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [server, setServer] = useState<AppNotification[]>([]);
  const [device, setDevice] = useState<CareAlertEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const page = await fetchNotifications(PAGE, 0);
      const log = readCareAlertLog();
      setServer(page.notifications);
      setTotal(page.total);
      setDevice(log);
      // Opening the inbox reads it, the way a chat does; the rows keep
      // their unread mark for this visit so the new ones stand out.
      if (page.unreadCount > 0) markNotificationsRead().catch(() => {});
      if (log.some((e) => !e.readAt)) markCareAlertsRead();
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
    <div className="page">
      <div className="topbar">
        <button className="back" aria-label="Geri" onClick={() => navigate(-1)}>
          ←
        </button>
        <div className="micro">bildirimler</div>
        <span />
      </div>

      {error && <div className="error">{error}</div>}
      {loading && <p className="muted">Yükleniyor…</p>}
      {!loading && rows.length === 0 && (
        <div className="card flat">
          <strong>Henüz bildirim yok</strong>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            Takip ettiğin ya da bakım verdiğin hayvanlara yorum, görülme, sağlık veya aşı kaydı
            eklendiğinde burada görürsün.
          </p>
        </div>
      )}

      {rows.map((row) =>
        row.source === 'device' ? (
          <div key={row.key} className={`inbox-row ${row.unread ? 'unread' : ''}`}>
            <span className="inbox-bell">
              <BellIcon />
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
    </div>
  );
}
