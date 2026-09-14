/**
 * The animal profile's social layer (ROADMAP P6, track C): photo likes,
 * follow/care, the care-photo step, the animal badges and the inbox. Kept
 * out of api.ts on purpose (parallel tracks share that file); same
 * contract as mobile/src/api/animals.ts and notifications.ts.
 */
import type { AnimalBadgeStep } from '@mobile/animalBadges';
import type { BadgeSymbolName, BadgeTier } from '@mobile/badges';
import { api, type Animal, type AnimalDetail, type AnimalPhoto } from '../api';

export interface AnimalBadge {
  key: string;
  /** The owner's name for the badge; the tier shows as the medallion colour only. */
  label: string;
  unit: string;
  symbol: BadgeSymbolName;
  tier: BadgeTier;
  nextThreshold: number | null;
}

export interface SocialPhoto extends AnimalPhoto {
  like_count: number;
  liked_by_me: boolean;
  uploaded_by_name?: string | null;
  created_at?: string;
}

export interface AnimalSocialDetail extends AnimalDetail {
  photos: SocialPhoto[];
  carerCount: number;
  followerCount: number;
  isFollowing: boolean;
  badges: AnimalBadge[];
  /** Every badge key, earned or not, with the live count (P7 item 3): the tier ladder. */
  badgeLadder: AnimalBadgeStep[];
}

/** The profile with its social fields; the same endpoint as fetchAnimal. */
export const fetchAnimalSocial = (id: number) => api.get<AnimalSocialDetail>(`/animals/${id}`);

/** List rows carry their badges too; typed here so api.ts stays untouched. */
export function badgesOf(animal: Animal): AnimalBadge[] {
  return (animal as Animal & { badges?: AnimalBadge[] }).badges ?? [];
}

/**
 * The server logged a match hit for this add-animal candidate — the model
 * said "same", or no model answered. Only then does "that's the one"
 * report a sighting and make the user a carer; without it the confirm
 * just opens the profile. Read through a helper: `AnimalMatch` lives in
 * api.ts, which this track leaves untouched.
 */
export function matchHitOf(candidate: object): boolean {
  return (candidate as { matchHit?: boolean }).matchHit === true;
}

export interface LikeState {
  liked: boolean;
  likeCount: number;
}

export const likePhoto = (animalId: number, photoId: number) =>
  api.post<LikeState>(`/animals/${animalId}/photos/${photoId}/like`);
export const unlikePhoto = (animalId: number, photoId: number) =>
  api.del<LikeState>(`/animals/${animalId}/photos/${photoId}/like`);

export interface FollowState {
  following: boolean;
  followerCount: number;
}

export const followAnimal = (animalId: number) =>
  api.post<FollowState>(`/animals/${animalId}/follow`);
export const unfollowAnimal = (animalId: number) =>
  api.del<FollowState>(`/animals/${animalId}/follow`);

export interface CarePhotoResult {
  matched: true;
  alreadyCarer: boolean;
  /** false when the model was off, did not answer, or the gallery had nothing to compare. */
  photoChecked: boolean;
  photos: SocialPhoto[];
  carerCount?: number;
  /** A new carer follows too (P7 item 2); the page reloads the profile anyway. */
  following?: boolean;
  followerCount?: number;
  animalBadges?: AnimalBadge[];
}

/**
 * "Bakım ver": a fresh camera photo (the sheet sends one; the server takes
 * up to two), screened for the species and compared with this animal's
 * own gallery. A miss is a 422 `carePhotoMismatch`
 * (Turkish message), a wrong species `photoRejected` with `photoIndexes`.
 */
export function submitCarePhotos(animalId: number, photos: File[]) {
  const form = new FormData();
  for (const photo of photos) form.append('photos', photo);
  return api.postForm<CarePhotoResult>(`/animals/${animalId}/care-photos`, form);
}

// ---------------------------------------------------------------- inbox

export type NotificationKind = 'comment' | 'sighting' | 'health_record' | 'vaccination' | 'care';

export interface NotificationPayload {
  animalName: string | null;
  species: 'cat' | 'dog';
  actorName: string | null;
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

export const fetchNotifications = (limit = 30, offset = 0) =>
  api.get<NotificationPage>(`/notifications?limit=${limit}&offset=${offset}`);

export const fetchUnreadCount = async () =>
  (await api.get<{ unreadCount: number }>('/notifications/unread-count')).unreadCount;

/** Marks the given rows read, or everything when no ids are passed. */
export const markNotificationsRead = async (ids?: number[]) =>
  (await api.post<{ unreadCount: number }>('/notifications/read', ids ? { ids } : {})).unreadCount;

export const registerDeviceToken = (token: string) =>
  api.post<{ ok: true }>('/notifications/device-tokens', { platform: 'web', token });

/** Turkish one-liners for the inbox rows — the same wording as mobile. */
export function notificationTitle(n: AppNotification): string {
  const animal = n.payload.animalName ?? (n.payload.species === 'dog' ? 'Köpek' : 'Kedi');
  const actor = n.payload.actorName ?? 'Biri';
  switch (n.kind) {
    case 'comment':
      return `${actor}, ${animal} için yorum yazdı`;
    case 'sighting':
      return `${actor}, ${animal} için görülme bildirdi`;
    case 'health_record':
      return `${animal} için sağlık kaydı eklendi`;
    case 'vaccination':
      return `${animal} için aşı kaydı eklendi`;
    case 'care':
      return `${actor}, ${animal} için bakım vermeye başladı`;
    default:
      return animal;
  }
}
