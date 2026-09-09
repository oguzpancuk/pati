import { apiClient } from './client';
import type { PhotoAsset } from './care';
import type { Badge, BadgeTier } from '../badges';
import type { SocialProvider } from './auth';

// Badge types live in pure `badges.ts` (web reads from there too);
// re-exported here so existing import paths keep working.
export type { Badge, BadgeTier } from '../badges';

export interface UserPoints {
  badges: number;
  comments: number;
  total: number;
}

export interface UserRank {
  rank: number;
  points: number;
  totalUsers: number;
}

// Level thresholds live on the server too; the client only displays what it
// receives, so changing thresholds never requires an app update.
export interface UserLevel {
  level: number;
  title: string;
  minPoints: number;
  nextLevelPoints: number | null;
  nextTitle: string | null;
  progress: number;
}

export interface UserComment {
  id: number;
  body: string;
  created_at: string;
  health_record_id: number | null;
  animal_id: number;
  animal_species: 'cat' | 'dog';
  animal_name: string | null;
  animal_breed: string | null;
  animal_photo_url: string | null;
  animal_thumb_url?: string | null;
}

// The record of the moment a badge was earned. rankBefore can be null: with
// no previously computed rank (their first badge) there is nothing to
// compare against.
export interface BadgeAward {
  id: number;
  badgeKey: string;
  tier: BadgeTier;
  label: string;
  pointsAwarded: number;
  pointsBefore: number | null;
  pointsAfter: number | null;
  rankBefore: number | null;
  rankAfter: number | null;
  levelBefore: number | null;
  levelAfter: number | null;
  createdAt: string;
}

// Field appended to the responses of point-earning endpoints.
export interface WithNewBadges {
  newBadges?: BadgeAward[];
}

export interface UserStats {
  foodCount: number;
  waterCount: number;
  animalCount: number;
}

export interface Me {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  created_at: string;
  stats: UserStats;
  badges: Badge[];
  points: UserPoints;
  level: UserLevel;
  featuredBadges: Badge[];
  rank: UserRank | null;
  recentComments: UserComment[];
  commentCount: number;
  /** False for accounts that only ever signed in with Apple or Google. */
  hasPassword: boolean;
  /** Same meaning as on `User` (api/auth): the code screen is still due. */
  email_verification_pending?: boolean;
  /** Whether this person sees the showcase (demo) world (their own switch). */
  show_demo?: boolean;
  /** Showcase account: it does not compete on the board (`rank` is null). */
  is_demo?: boolean;
  authProviders: SocialProvider[];
}

export type FriendshipStatus = 'none' | 'self' | 'friends' | 'pending_sent' | 'pending_received';

export interface ProfileAnimal {
  cover_thumb_url?: string | null;
  id: number;
  species: 'cat' | 'dog';
  name: string | null;
  breed: string | null;
  created_at: string;
  cover_photo_url: string | null;
}

export interface PublicProfile {
  id: number;
  name: string;
  avatar_url: string | null;
  /** Showcase (demo) account or record: the clients mark it with a chip. */
  is_demo?: boolean;
  created_at: string;
  stats: UserStats;
  badges: Badge[];
  points: UserPoints;
  level: UserLevel;
  featuredBadges: Badge[];
  rank: UserRank | null;
  animals: ProfileAnimal[];
  animalCount: number;
  friendCount: number;
  recentComments: UserComment[];
  commentCount: number;
  friendshipStatus: FriendshipStatus;
  friendshipId: number | null;
}

export interface UserSummary {
  id: number;
  name: string;
  avatar_url: string | null;
}

export interface FriendshipEntry {
  friendship_id: number;
  id: number;
  name: string;
  avatar_url: string | null;
  created_at?: string;
}

export interface FriendshipsResponse {
  friends: FriendshipEntry[];
  incomingRequests: FriendshipEntry[];
  outgoingRequests: FriendshipEntry[];
}

export interface LeaderboardEntry {
  id: number;
  name: string;
  avatar_url: string | null;
  points: number;
  badgePoints: number;
  commentPoints: number;
  level: UserLevel;
  badgeCount: number;
  topTier: BadgeTier | null;
  rank: number;
}

export interface UserCommentsResponse {
  user: UserSummary;
  comments: UserComment[];
  total: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  totalUsers: number;
  me: LeaderboardEntry | null;
}

export async function fetchMe(): Promise<Me> {
  const { data } = await apiClient.get<Me>('/users/me');
  return data;
}

// Account deletion re-authenticates with the password; the server anonymizes
// the row in place (see the privacy notice's retention section).
/**
 * Deletion always re-authenticates. A password account sends its password; an
 * Apple/Google account has none and proves itself with a fresh identity token
 * from its provider.
 */
export async function deleteMyAccount(
  proof: { password: string } | { provider: SocialProvider; identityToken: string }
): Promise<{ deleted: boolean }> {
  const { data } = await apiClient.delete<{ deleted: boolean }>('/users/me', { data: proof });
  return data;
}

export async function uploadAvatar(photo: PhotoAsset): Promise<Me> {
  const form = new FormData();
  form.append('photo', {
    uri: photo.uri,
    type: photo.type ?? 'image/jpeg',
    name: photo.fileName ?? 'photo.jpg',
  } as unknown as Blob);
  const { data } = await apiClient.post<Me>('/users/me/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/**
 * Picks one of the built-in avatars. Written to the same field as the photo,
 * so it replaces any previous photo — only one is active at a time.
 */
export async function setAvatarKey(avatarKey: string): Promise<Me> {
  const { data } = await apiClient.put<Me>('/users/me/avatar-key', { avatarKey });
  return data;
}

export async function clearAvatar(): Promise<Me> {
  const { data } = await apiClient.delete<Me>('/users/me/avatar');
  return data;
}

export async function setFeaturedBadges(keys: string[]): Promise<Badge[]> {
  const { data } = await apiClient.put<{ featuredBadges: Badge[] }>('/users/me/featured-badges', {
    keys,
  });
  return data.featuredBadges;
}

export async function searchUsers(q: string): Promise<UserSummary[]> {
  const { data } = await apiClient.get<UserSummary[]>('/users/search', {
    params: { q },
  });
  return data;
}

export async function fetchUserProfile(id: number): Promise<PublicProfile> {
  const { data } = await apiClient.get<PublicProfile>(`/users/${id}`);
  return data;
}

export interface AnimalPage {
  animals: ProfileAnimal[];
  total: number;
}

// The profile's "animals cared for" arrives paginated; the first page comes
// with the profile as a preview, the rest from here via "show more".
export async function fetchUserAnimals(
  userId: number | 'me',
  limit: number,
  offset: number
): Promise<AnimalPage> {
  const path = userId === 'me' ? '/users/me/animals' : `/users/${userId}/animals`;
  const { data } = await apiClient.get<AnimalPage>(path, { params: { limit, offset } });
  return data;
}

// Without userId, fetches our own comments ('/users/me/comments').
export async function fetchUserComments(
  userId: number | 'me',
  limit = 50,
  offset = 0
): Promise<UserCommentsResponse> {
  const { data } = await apiClient.get<UserCommentsResponse>(`/users/${userId}/comments`, {
    params: { limit, offset },
  });
  return data;
}

export async function fetchUnseenBadgeAwards(): Promise<BadgeAward[]> {
  const { data } = await apiClient.get<BadgeAward[]>('/users/me/badge-awards');
  return data;
}

export async function markBadgeAwardsSeen(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await apiClient.post('/users/me/badge-awards/seen', { ids });
}

export async function fetchLeaderboard(limit = 50): Promise<LeaderboardResponse> {
  const { data } = await apiClient.get<LeaderboardResponse>('/leaderboard', {
    params: { limit },
  });
  return data;
}

export async function fetchMyFriendships(): Promise<FriendshipsResponse> {
  const { data } = await apiClient.get<FriendshipsResponse>('/friendships/me');
  return data;
}

export async function sendFriendRequest(addresseeId: number): Promise<void> {
  await apiClient.post('/friendships', { addresseeId });
}

export async function acceptFriendRequest(friendshipId: number): Promise<void> {
  await apiClient.post(`/friendships/${friendshipId}/accept`);
}

export async function removeFriendship(friendshipId: number): Promise<void> {
  await apiClient.delete(`/friendships/${friendshipId}`);
}

/**
 * Each person decides whether the showcase (demo) world is part of their
 * app — the bots' animals, their food and water, the chat and the
 * leaderboard entries (owner, 2026-09-09). On by default.
 */
export async function setShowDemo(showDemo: boolean): Promise<void> {
  await apiClient.put('/users/me/show-demo', { showDemo });
}
