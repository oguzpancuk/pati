import { apiClient } from './client';
import type { PhotoAsset } from './care';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'diamond';

export interface BadgeInfo {
  streakDays: number;
  tier: BadgeTier | null;
}

export interface UserBadges {
  feeder: BadgeInfo;
  water: BadgeInfo;
  registrar: BadgeInfo;
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
  badges: UserBadges;
}

export type FriendshipStatus = 'none' | 'self' | 'friends' | 'pending_sent' | 'pending_received';

export interface PublicProfile {
  id: number;
  name: string;
  avatar_url: string | null;
  created_at: string;
  stats: UserStats;
  badges: UserBadges;
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

export async function searchUsers(q: string): Promise<UserSummary[]> {
  const { data } = await apiClient.get<UserSummary[]>('/users/search', { params: { q } });
  return data;
}

export async function fetchUserProfile(id: number): Promise<PublicProfile> {
  const { data } = await apiClient.get<PublicProfile>(`/users/${id}`);
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
