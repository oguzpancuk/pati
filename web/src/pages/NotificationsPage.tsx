import { PageHeader } from '../components/PageHeader';
import { NotificationList } from '../components/profile';

/**
 * The notification inbox as a page — deep links and shared links open it. The
 * list itself is `components/profile/NotificationList`, the same one the
 * profile's bell sheet renders: item 2's whole point (owner, 2026-09-11) was
 * ONE list, and a verbatim copy here is exactly the drift it was meant to
 * prevent.
 */
export default function NotificationsPage() {
  return (
    <div className="page">
      {/* Reached from the profile's bell, or from a link — hence the root it
          falls back to when there is no history behind it. */}
      <PageHeader title="bildirimler" fallback="/profil" />

      {/* No `inSheet`: on the page a row is a normal push, so Back returns
          here rather than replacing the entry a sheet would have owned. */}
      <NotificationList />
    </div>
  );
}
