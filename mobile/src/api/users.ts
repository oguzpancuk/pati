import { apiClient } from './client';
import type { PhotoAsset } from './care';
import type { BadgeSymbolName } from '../components/badges';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'diamond';

// Rozetler sunucuda türetiliyor; istemci sabit bir liste tutmuyor ki yeni bir
// rozet türü eklendiğinde mobil tarafta değişiklik gerekmesin.
export interface Badge {
  key: string;
  label: string;
  unit: string;
  value: number;
  tier: BadgeTier | null;
  points: number;
  nextThreshold: number | null;
  /** Hangi madalyon sembolünün çizileceği (bkz. components/badges/BadgeSymbol). */
  symbol: BadgeSymbolName;
}

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

// Seviye eşikleri de sunucuda; istemci yalnızca gelen değeri gösteriyor ki
// eşikler değiştiğinde uygulama güncellemesi gerekmesin.
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
}

// Rozet kazanıldığı anın kaydı. rankBefore null olabilir: kullanıcının daha önce
// hesaplanmış bir sıralaması yoksa (ilk rozeti) karşılaştıracak bir değer yok.
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

// Puan kazandıran uç noktaların yanıtına eklenen alan.
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
}

export type FriendshipStatus = 'none' | 'self' | 'friends' | 'pending_sent' | 'pending_received';

export interface ProfileAnimal {
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
  created_at: string;
  stats: UserStats;
  badges: Badge[];
  points: UserPoints;
  level: UserLevel;
  featuredBadges: Badge[];
  rank: UserRank | null;
  animals: ProfileAnimal[];
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
 * Hazır avatarlardan birini seçer. Fotoğrafla aynı alana yazıldığı için önceki
 * fotoğrafın yerini alır — aynı anda yalnızca biri geçerli.
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

export async function fetchMyAnimals(): Promise<ProfileAnimal[]> {
  const { data } = await apiClient.get<ProfileAnimal[]>('/users/me/animals');
  return data;
}

// userId verilmezse kendi yorumlarımızı getirir ('/users/me/comments').
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
