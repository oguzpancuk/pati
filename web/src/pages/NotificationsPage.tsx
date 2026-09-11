import { useNavigate } from 'react-router-dom';
import { NotificationList } from '../components/profile';

/**
 * The notification inbox as a page — deep links and shared links open it. The
 * list itself is `components/profile/NotificationList`, the same one the
 * profile's bell sheet renders: item 2's whole point (owner, 2026-09-11) was
 * ONE list, and a verbatim copy here is exactly the drift it was meant to
 * prevent.
 */
export default function NotificationsPage() {
  const navigate = useNavigate();

  return (
    <div className="page">
      <div className="topbar">
        <button className="back" aria-label="Geri" onClick={() => navigate(-1)}>
          ←
        </button>
        <div className="micro">bildirimler</div>
        <span />
      </div>

      {/* No `inSheet`: on the page a row is a normal push, so Back returns
          here rather than replacing the entry a sheet would have owned. */}
      <NotificationList />
    </div>
  );
}
