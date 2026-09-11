import { NotificationList } from './NotificationList';
import { Sheet } from './Sheet';

/**
 * The bell's inbox over the profile. The Notifications PAGE stays — deep
 * links and push open it — and both render the same `NotificationList`, so
 * the two cannot drift apart.
 */
export function NotificationsSheet({
  open,
  onClose,
  onRead,
}: {
  open: boolean;
  onClose: () => void;
  onRead?: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Bildirimler" fill>
      {/* Mounted only while open, so every open fetches a fresh inbox. */}
      {open && <NotificationList inSheet onNavigate={onClose} onRead={onRead} />}
    </Sheet>
  );
}
