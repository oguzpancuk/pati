/**
 * The backend client. Endpoints and types follow the same contract as the
 * mobile side's mobile/src/api/*.ts; web carries only the subset it needs.
 */
import type { Badge, BadgeTier } from '@mobile/badges';

export type { Badge, BadgeTier };

const TOKEN_KEY = 'pati-token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  /** Seconds to wait, when a 429 says so (cooldowns and limiters both do). */
  retryAfter?: number;
  constructor(status: number, message: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      setToken(null);
      // Whoever holds the auth state must hear about this (mobile parity):
      // clearing only the token left the app in an authenticated-looking
      // shell where every request fails until a manual reload.
      sessionExpiredHandler?.();
    } else if (res.status === 403 && (body as { emailUnverified?: boolean }).emailUnverified) {
      // The account's e-mail is unverified and the auth state did not know;
      // the code page must replace the app (mobile parity).
      verificationRequiredHandler?.();
    }
    const { error, retryAfter } = body as { error?: string; retryAfter?: number };
    throw new ApiError(
      res.status,
      error || `HTTP ${res.status}`,
      typeof retryAfter === 'number' ? retryAfter : undefined
    );
  }
  return body as T;
}

let verificationRequiredHandler: (() => void) | null = null;
export function setVerificationRequiredHandler(handler: (() => void) | null) {
  verificationRequiredHandler = handler;
}

/**
 * Called on any 401 after the stored token is cleared, so the auth context
 * can drop the user to the login screen. Same mechanism as mobile's
 * setSessionExpiredHandler.
 */
let sessionExpiredHandler: (() => void) | null = null;
export function setSessionExpiredHandler(handler: (() => void) | null) {
  sessionExpiredHandler = handler;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(data ?? {}) }),
  postForm: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
  del: <T>(path: string, data?: unknown) =>
    request<T>(
      path,
      data === undefined ? { method: 'DELETE' } : { method: 'DELETE', body: JSON.stringify(data) }
    ),
};

// ---------------------------------------------------------------- tipler

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  /**
   * True from e-mail registration until the mailed code is typed. While set
   * the server answers 403 to everything but verification, so the app shows
   * the code page and nothing else (mobile parity).
   */
  email_verification_pending?: boolean;
}

export interface AuthResponse {
  user: User;
  token: string;
  /** Registration and login say so when the code page is the next step. */
  verificationRequired?: boolean;
  /** Registration only: whether the code mail actually went out. */
  codeSent?: boolean;
}

export interface UserLevel {
  level: number;
  title: string;
  minPoints: number;
  nextLevelPoints: number | null;
  nextTitle: string | null;
  progress: number;
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

// A user's comment on an animal; the animal comes along too so the list can
// link straight to its profile.
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

// The record of the moment a badge was earned; the celebration popup shows it.
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

/** Field appended to the responses of point-earning endpoints. */
export interface WithNewBadges {
  newBadges?: BadgeAward[];
}

export interface Me extends User {
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
  authProviders: SocialProvider[];
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

export interface FriendshipEntry extends UserSummary {
  friendship_id: number;
  created_at?: string;
}

export interface FriendshipsResponse {
  friends: FriendshipEntry[];
  incomingRequests: FriendshipEntry[];
  outgoingRequests: FriendshipEntry[];
}

export interface LeaderboardEntry extends UserSummary {
  points: number;
  badgePoints: number;
  commentPoints: number;
  level: UserLevel;
  badgeCount: number;
  topTier: BadgeTier | null;
  rank: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  totalUsers: number;
  me: LeaderboardEntry | null;
}

export interface UserCommentsResponse {
  user: UserSummary;
  comments: UserComment[];
  total: number;
}

export interface AnimalPage {
  animals: ProfileAnimal[];
  total: number;
}

export type AdSlot = 'food_popup' | 'water_popup' | 'vet_health_record';

export interface Ad {
  id: number;
  name: string;
  slot: AdSlot;
  headline: string | null;
  body: string | null;
  image_url: string | null;
  target_url: string;
}

export interface CareAction {
  id: number;
  action_type: 'food' | 'water';
  photo_url: string;
  created_at: string;
  location: { type: 'Point'; coordinates: [number, number] };
  weight: string;
}

export interface CareStatus {
  needsAttention: boolean;
  actionCount: number;
  lastActionAt: string | null;
  radiusMeters: number;
  windowHours: number | Record<string, number>;
}

export interface Animal {
  id: number;
  species: 'cat' | 'dog';
  name: string | null;
  color: string | null;
  breed: string | null;
  markings: string | null;
  location: { type: 'Point'; coordinates: [number, number] };
  distance_meters?: number;
  cover_photo_url?: string | null;
}

export interface HealthRecord {
  id: number;
  record_type: 'illness' | 'injury';
  description: string;
  vet_verified: boolean;
  recorded_by_name?: string;
  recorded_at: string;
  comment_count: number;
  status: 'not_started' | 'in_treatment' | 'recovered';
  recovered_by_name: string | null;
}

export interface Vaccination {
  id: number;
  vaccine_type: string;
  note: string | null;
  vet_verified: boolean;
  administered_at: string;
  next_due_at: string | null;
  recorded_by_name?: string;
}

export interface AnimalPhoto {
  id: number;
  url: string;
}

export interface AnimalComment {
  id: number;
  body: string;
  created_at: string;
  health_record_id: number | null;
  user_id: number;
  user_name: string;
  avatar_url: string | null;
  health_record_type: 'illness' | 'injury' | null;
  health_record_description: string | null;
}

export type SimilarityLevel = 'high' | 'medium' | 'low';
export type SimilarityReason = 'breed' | 'color' | 'distance';

export interface AnimalMatch extends Animal {
  distance_meters: number;
  similarity: SimilarityLevel;
  similarity_reasons: SimilarityReason[];
}

export interface AnimalDetail extends Animal {
  location_updated_at: string;
  photos: AnimalPhoto[];
  healthRecords: HealthRecord[];
  vaccinations: Vaccination[];
  isCarer: boolean;
}

// ---------------------------------------------------------------- calls

export const login = (email: string, password: string) =>
  api.post<AuthResponse>('/auth/login', { email, password });

export const register = (name: string, email: string, password: string) =>
  api.post<AuthResponse>('/auth/register', { name, email, password });

/** POST /auth/verify-email — the typed code proves the address. */
export const verifyEmail = (code: string) =>
  api.post<{ user: User }>('/auth/verify-email', { code });

/** POST /auth/verify-email/resend — a fresh code, subject to a cooldown. */
export const resendVerificationCode = () =>
  api.post<{ codeSent: boolean; email: string }>('/auth/verify-email/resend');

export type SocialProvider = 'apple' | 'google';

export interface AuthProviders {
  apple: { enabled: boolean; serviceId: string | null; redirectUri: string | null };
  google: { enabled: boolean; webClientId: string | null; iosClientId: string | null };
}

/** Which sign-in buttons this deployment can actually offer (see backend). */
export const fetchAuthProviders = () => api.get<AuthProviders>('/auth/providers');

/**
 * Hands the provider's identity token to the backend, which verifies it and
 * answers with a pati session. `name` only ever carries Apple's first-
 * authorization gift: the one and only time it tells us the user's name.
 */
export const socialLogin = (provider: SocialProvider, identityToken: string, name?: string) =>
  api.post<{ user: User; token: string; created: boolean }>(`/auth/${provider}`, {
    identityToken,
    ...(name ? { name } : {}),
  });

export const fetchMe = () => api.get<Me>('/users/me');
export const setAvatarKey = (avatarKey: string) =>
  api.put<Me>('/users/me/avatar-key', { avatarKey });

export function uploadAvatar(file: File) {
  const form = new FormData();
  form.append('photo', file);
  return api.postForm<Me>('/users/me/avatar', form);
}

export const fetchCareActionsInBounds = (
  b: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  actionType: 'food' | 'water'
) =>
  api.get<CareAction[]>(
    `/care-actions?minLat=${b.minLat}&maxLat=${b.maxLat}&minLng=${b.minLng}&maxLng=${b.maxLng}&actionType=${actionType}`
  );

export const fetchCareStatus = (lat: number, lng: number, actionType: 'food' | 'water') =>
  api.get<CareStatus>(`/care-actions/status?lat=${lat}&lng=${lng}&actionType=${actionType}`);

export function addCareAction(lat: number, lng: number, actionType: 'food' | 'water', photo: File) {
  const form = new FormData();
  form.append('lat', String(lat));
  form.append('lng', String(lng));
  form.append('actionType', actionType);
  form.append('photo', photo);
  return api.postForm<CareAction & WithNewBadges>('/care-actions', form);
}

export interface MyCareAction {
  id: number;
  action_type: 'food' | 'water';
  photo_url: string;
  created_at: string;
  location: { type: 'Point'; coordinates: [number, number] };
  /** Computed server-side against the server clock — don't re-derive on device. */
  deletable: boolean;
}

export interface MyCareActionsResponse {
  total: number;
  deleteWindowMinutes: number;
  actions: MyCareAction[];
}

export const fetchMyCareActions = (limit = 20, offset = 0) =>
  api.get<MyCareActionsResponse>(`/care-actions/mine?limit=${limit}&offset=${offset}`);

export const deleteCareAction = (id: number) => api.del<void>(`/care-actions/${id}`);

export const fetchAnimals = (
  lat?: number,
  lng?: number,
  radiusMeters = 10000,
  species?: string,
  limit?: number,
  offset?: number
) => {
  const q = new URLSearchParams();
  if (lat !== undefined && lng !== undefined) {
    q.set('lat', String(lat));
    q.set('lng', String(lng));
    q.set('radiusMeters', String(radiusMeters));
  }
  if (species) q.set('species', species);
  if (limit) q.set('limit', String(limit));
  if (offset) q.set('offset', String(offset));
  return api.get<Animal[]>(`/animals?${q}`);
};

export const fetchAnimal = (id: number) => api.get<AnimalDetail>(`/animals/${id}`);

export const createAnimal = (input: {
  species: 'cat' | 'dog';
  name?: string;
  color?: string;
  breed?: string;
  markings?: string;
  lat: number;
  lng: number;
}) => api.post<Animal & WithNewBadges>('/animals', input);

export function addAnimalPhoto(animalId: number, file: File) {
  const form = new FormData();
  form.append('photo', file);
  return api.postForm<AnimalPhoto>(`/animals/${animalId}/photos`, form);
}

/** Chat is paginated: the server returns newest-first with `limit/offset`. */
export const fetchComments = (
  animalId: number,
  opts: { limit?: number; offset?: number; healthRecordId?: number } = {}
) => {
  const q = new URLSearchParams();
  if (opts.limit) q.set('limit', String(opts.limit));
  if (opts.offset) q.set('offset', String(opts.offset));
  if (opts.healthRecordId) q.set('healthRecordId', String(opts.healthRecordId));
  return api.get<{ comments: AnimalComment[]; total: number }>(
    `/animals/${animalId}/comments?${q}`
  );
};

export const addComment = (animalId: number, body: string, healthRecordId?: number) =>
  api.post<AnimalComment & WithNewBadges>(`/animals/${animalId}/comments`, {
    body,
    healthRecordId,
  });

export const addHealthRecord = (
  animalId: number,
  recordType: 'illness' | 'injury',
  description: string
) =>
  api.post<HealthRecord & WithNewBadges>(`/animals/${animalId}/health-records`, {
    recordType,
    description,
  });

export const addVaccination = (animalId: number, vaccineType: string, note?: string) =>
  api.post<Vaccination & WithNewBadges>(`/animals/${animalId}/vaccinations`, { vaccineType, note });

/**
 * "Is this animal already registered?" candidates before opening a new
 * record. The server ranks same-species animals within 1 km by pattern/color
 * and distance as high/medium/low similarity (no numeric percentage, on
 * purpose).
 */
export const matchAnimals = (input: {
  lat: number;
  lng: number;
  species: 'cat' | 'dog';
  breed?: string | null;
  color?: string | null;
}) => {
  const q = new URLSearchParams({
    lat: String(input.lat),
    lng: String(input.lng),
    species: input.species,
  });
  if (input.breed) q.set('breed', input.breed);
  if (input.color) q.set('color', input.color);
  return api.get<{ candidates: AnimalMatch[]; radiusMeters: number }>(`/animals/match?${q}`);
};

// Reports a sighting of a registered animal: moves its location and adds the
// reporter to the care list.
export const reportSighting = (animalId: number, lat: number, lng: number) =>
  api.post<Animal>(`/animals/${animalId}/sightings`, { lat, lng });

// ---------------------------------------------------------------- reports

import type { ReportReason, ReportTargetType } from '@mobile/reportReasons';
export type { ReportReason, ReportTargetType };

// One open report per user per target; the server answers a repeat with 409
// and a friendly message, which the dialog shows as-is.
export const createReport = (
  targetType: ReportTargetType,
  targetId: number,
  reason: ReportReason,
  details?: string
) => api.post<{ id: number }>('/reports', { targetType, targetId, reason, details });

// Account deletion re-authenticates with the password; the server anonymizes
// the row in place (see the privacy notice's retention section).
/**
 * Deletion always re-authenticates. A password account sends its password; an
 * Apple/Google account signs in with the provider again and sends that token
 * (it has no password to type).
 */
export const deleteAccount = (
  proof: { password: string } | { provider: SocialProvider; identityToken: string }
) => api.del<{ deleted: boolean }>('/users/me', proof);

// ---------------------------------------------------------------- user / social

export const setFeaturedBadges = async (keys: string[]) => {
  const data = await api.put<{ featuredBadges: Badge[] }>('/users/me/featured-badges', { keys });
  return data.featuredBadges;
};

export const searchUsers = (q: string) =>
  api.get<UserSummary[]>(`/users/search?${new URLSearchParams({ q })}`);

export const fetchUserProfile = (id: number) => api.get<PublicProfile>(`/users/${id}`);

// The profile's "animals cared for" list is paginated: the first 3 arrive
// with the profile, the rest comes from here via "show more".
export const fetchUserAnimals = (userId: number | 'me', limit: number, offset: number) =>
  api.get<AnimalPage>(
    `/users/${userId}/animals?${new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    })}`
  );

export const fetchUserComments = (userId: number | 'me', limit = 30, offset = 0) =>
  api.get<UserCommentsResponse>(
    `/users/${userId}/comments?${new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    })}`
  );

export const fetchUnseenBadgeAwards = () => api.get<BadgeAward[]>('/users/me/badge-awards');

export const markBadgeAwardsSeen = (ids: number[]) =>
  ids.length === 0 ? Promise.resolve() : api.post<void>('/users/me/badge-awards/seen', { ids });

export const fetchLeaderboard = (limit = 100) =>
  api.get<LeaderboardResponse>(`/leaderboard?${new URLSearchParams({ limit: String(limit) })}`);

export const fetchMyFriendships = () => api.get<FriendshipsResponse>('/friendships/me');
export const sendFriendRequest = (addresseeId: number) =>
  api.post<void>('/friendships', { addresseeId });
export const acceptFriendRequest = (friendshipId: number) =>
  api.post<void>(`/friendships/${friendshipId}/accept`);
export const removeFriendship = (friendshipId: number) =>
  api.del<void>(`/friendships/${friendshipId}`);

// ---------------------------------------------------------------- reklam

/** The next ad for a placement; null when none is live — the banner never renders. */
export const fetchAd = async (slot: AdSlot) => {
  const data = await api.get<{ ad: Ad | null }>(`/ads?${new URLSearchParams({ slot })}`);
  return data.ad;
};
// Impressions and clicks are separate: a fetched-but-never-shown ad must not be billed.
export const recordAdImpression = (adId: number) => api.post<void>(`/ads/${adId}/impression`);
export const recordAdClick = (adId: number) => api.post<void>(`/ads/${adId}/click`);

// ---------------------------------------------------------------- health records

export const markHealthRecordRecovered = (animalId: number, recordId: number) =>
  api.post<HealthRecord & WithNewBadges>(`/animals/${animalId}/health-records/${recordId}/recover`);

/** Undoes a (possibly mistaken) recovered mark; the record reopens for comments. */
export const reopenHealthRecord = (animalId: number, recordId: number) =>
  api.post<HealthRecord>(`/animals/${animalId}/health-records/${recordId}/reopen`);
