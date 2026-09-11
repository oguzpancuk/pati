import React from 'react';
import NotificationList from './NotificationList';
import Sheet from './Sheet';

export type NotificationsSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Opening an animal leaves the sheet, so the caller closes it first. */
  onOpenAnimal: (animalId: number) => void;
  onRead?: () => void;
};

/**
 * The bell's inbox over the profile. The Notifications SCREEN stays — deep
 * links and push open it — and both render the same `NotificationList`, so
 * the two cannot drift apart.
 */
export default function NotificationsSheet({
  visible,
  onClose,
  onOpenAnimal,
  onRead,
}: NotificationsSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Bildirimler" fill scroll={false}>
      {/* Mounted only while open, so every open fetches a fresh inbox. */}
      {visible && <NotificationList onOpenAnimal={onOpenAnimal} onRead={onRead} />}
    </Sheet>
  );
}
