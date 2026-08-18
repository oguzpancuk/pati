import { apiClient } from './client';
import type { PhotoAsset } from './care';

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
  featuredBadges: Badge[];
  rank: UserRank | null;
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
  featuredBadges: Badge[];
  rank: UserRank | null;
  animals: ProfileAnimal[];
  friendCount: number;
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
  badgeCount: number;
  topTier: BadgeTier | null;
  rank: number;
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

export async function setFeaturedBadges(keys: string[]): Promise<Badge[]> {
  const { data } = await apiClient.put<{ featuredBadges: Badge[] }>('/users/me/featured-badges', {
    keys,
  });
  return data.featuredBadges;
}

export async function searchUsers(q: string): Promise<UserSummary[]> {
  const { data } = await apiClient.get<UserSummary[]>('/users/search', { params: { q } });
  return data;
}

export async function fetchUserProfile(id: number): Promise<PublicProfile> {
  const { data } = await apiClient.get<PublicProfile>(`/users/${id}`);
  return data;
}

export async function fetchLeaderboard(limit = 50): Promise<LeaderboardResponse> {
  const { data } = await apiClient.get<LeaderboardResponse>('/leaderboard', { params: { limit } });
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
