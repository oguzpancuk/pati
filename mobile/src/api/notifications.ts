import { apiClient } from './client';

/**
 * The in-app inbox (ROADMAP P6, track C): rows the server writes when a
 * comment, sighting, health record or vaccination lands on an animal the
 * user follows or cares for. Polled from the bell on the profile tab the
 * way the care alert is; no push yet — `registerDeviceToken` only stores
 * where a push would go, for the APNs/FCM batch to come.
 */
export type NotificationKind = 'comment' | 'sighting' | 'health_record' | 'vaccination';

export interface NotificationPayload {
  animalName: string | null;
  species: 'cat' | 'dog';
  actorName: string | null;
  /** The comment's first line, the record's description, the vaccine type; null for a sighting. */
  text: string | null;
}

export interface AppNotification {
  id: number;
  kind: NotificationKind;
  animal_id: number | null;
  actor_id: number | null;
  actor_avatar_url: string | null;
  payload: NotificationPayload;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPage {
  notifications: AppNotification[];
  total: number;
  unreadCount: number;
}

export async function fetchNotifications(
  options: { limit?: number; offset?: number } = {}
): Promise<NotificationPage> {
  const { data } = await apiClient.get<NotificationPage>('/notifications', { params: options });
  return data;
}

/** The bell's number — one integer, cheap enough for a minute's interval. */
export async function fetchUnreadCount(): Promise<number> {
  const { data } = await apiClient.get<{ unreadCount: number }>('/notifications/unread-count');
  return data.unreadCount;
}

/** Marks the given rows read, or everything when no ids are passed. */
export async function markNotificationsRead(ids?: number[]): Promise<number> {
  const { data } = await apiClient.post<{ unreadCount: number }>(
    '/notifications/read',
    ids ? { ids } : {}
  );
  return data.unreadCount;
}

export async function registerDeviceToken(
  platform: 'ios' | 'android',
  token: string
): Promise<void> {
  await apiClient.post('/notifications/device-tokens', { platform, token });
}

export async function removeDeviceToken(token: string): Promise<void> {
  await apiClient.delete('/notifications/device-tokens', { data: { token } });
}

/** Turkish one-liners for the inbox rows, shared by both clients' pages. */
export function notificationTitle(n: AppNotification): string {
  const animal = n.payload.animalName ?? (n.payload.species === 'dog' ? 'Köpek' : 'Kedi');
  const actor = n.payload.actorName ?? 'Biri';
  switch (n.kind) {
    case 'comment':
      return `${actor}, ${animal} için yorum yazdı`;
    case 'sighting':
      return `${actor}, ${animal}'i gördüğünü bildirdi`;
    case 'health_record':
      return `${animal} için sağlık kaydı eklendi`;
    case 'vaccination':
      return `${animal} için aşı kaydı eklendi`;
    default:
      return animal;
  }
}
