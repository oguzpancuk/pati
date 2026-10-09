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
  /** A machine-readable reason, when the server sends one (`linkRequiresPassword`). */
  code?: string;
  /** The rest of the server's answer, for codes that carry detail (`photoIndexes`). */
  data: Record<string, unknown>;
  constructor(
    status: number,
    message: string,
    retryAfter?: number,
    code?: string,
    data: Record<string, unknown> = {}
  ) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
    this.code = code;
    this.data = data;
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
    const { error, retryAfter, code } = body as {
      error?: string;
      retryAfter?: number;
      code?: string;
    };
    throw new ApiError(
      res.status,
      error || `HTTP ${res.status}`,
      typeof retryAfter === 'number' ? retryAfter : undefined,
      code,
      body as Record<string, unknown>
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
  animal_thumb_url?: string | null;
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
  /** Whether this person sees the showcase (demo) world (their own switch). */
  show_demo?: boolean;
  /** Showcase account: it does not compete on the board (`rank` is null). */
  is_demo?: boolean;
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
  cover_thumb_url?: string | null;
  id: number;
  species: 'cat' | 'dog';
  name: string | null;
  breed: string | null;
  created_at: string;
  cover_photo_url: string | null;
  /** Showcase (demo) row: the clients mark it with a chip. */
  is_demo?: boolean;
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
  /** True when *you* blocked this person; the other direction is never reported. */
  blocked: boolean;
}

export interface BlockedUser extends UserSummary {
  created_at: string;
}

export interface UserSummary {
  id: number;
  name: string;
  avatar_url: string | null;
  /** Showcase account: the clients mark it with a chip. */
  is_demo?: boolean;
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
  /**
   * You blocked this person, so the list is empty because it was not sent —
   * not because they never wrote anything. The screens say so instead of
   * printing an empty state that would be a false statement about them.
   */
  blocked?: boolean;
}

export interface AnimalPage {
  animals: ProfileAnimal[];
  total: number;
}

// `vet_health_record` is the health-record slot; it is never sold to vets
// (Turkish law forbids veterinary advertising) and keeps its key: ADR-0006.
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
  /**
   * When this record's window runs out, computed on the server from its own
   * action type (food 4 h, water 6 h). The map callout says how much is left
   * from this, so no client carries a copy of those hours. Mobile's
   * `api/care.ts` declares the same field.
   */
  expires_at: string;
}

export interface CareStatus {
  needsAttention: boolean;
  actionCount: number;
  lastActionAt: string | null;
  radiusMeters: number;
  windowHours: number | Record<string, number>;
}

export interface Animal {
  /** Showcase (demo) account or record: the clients mark it with a chip. */
  is_demo?: boolean;
  /** The face cut-out of the best photo (P3); null → the SVG avatar stands in. */
  cover_thumb_url?: string | null;
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
  /** The author's id, so the name is a link to their profile (demo item 7). */
  recorded_by: number;
  recorded_by_name?: string;
  recorded_at: string;
  comment_count: number;
  status: 'not_started' | 'in_treatment' | 'recovered';
  recovered_by: number | null;
  recovered_by_name: string | null;
}

export interface Vaccination {
  id: number;
  vaccine_type: string;
  note: string | null;
  vet_verified: boolean;
  administered_at: string;
  next_due_at: string | null;
  /** The author's id, so the name is a link to their profile (demo item 7). */
  recorded_by: number;
  recorded_by_name?: string;
}

export interface AnimalPhoto {
  id: number;
  url: string;
  thumb_url?: string | null;
  face_score?: number | null;
}

export interface AnimalComment {
  id: number;
  body: string;
  created_at: string;
  health_record_id: number | null;
  user_id: number;
  user_name: string;
  avatar_url: string | null;
  /** The comment's author is a showcase account. */
  user_is_demo?: boolean;
  health_record_type: 'illness' | 'injury' | null;
  health_record_description: string | null;
}

export type SimilarityLevel = 'high' | 'medium' | 'low';
export type SimilarityReason = 'photo_same' | 'photo_similar' | 'breed' | 'color' | 'distance';

export interface AnimalMatch extends Animal {
  distance_meters: number;
  similarity: SimilarityLevel;
  similarity_reasons: SimilarityReason[];
}

/** A person on the animal's carer list; the row links to their profile. */
export interface Carer {
  id: number;
  name: string;
  avatar_url: string | null;
  /** The carer is a showcase account; the row wears the same chip a comment does. */
  is_demo?: boolean;
}

export interface AnimalDetail extends Animal {
  location_updated_at: string;
  photos: AnimalPhoto[];
  healthRecords: HealthRecord[];
  vaccinations: Vaccination[];
  /** Always present on GET /animals/:id; mobile's `AnimalDetail` names it too. */
  carers: Carer[];
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
/**
 * `password` is sent only when the server answered 409 `linkRequiresPassword`:
 * the address belongs to an account from before e-mail verification, and the
 * password proves it is the caller's before the provider is linked to it.
 */
export const socialLogin = (
  provider: SocialProvider,
  identityToken: string,
  name?: string,
  password?: string
) =>
  api.post<{ user: User; token: string; created: boolean }>(`/auth/${provider}`, {
    identityToken,
    ...(name ? { name } : {}),
    ...(password ? { password } : {}),
  });

export const fetchMe = () => api.get<Me>('/users/me');
export const setAvatarKey = (avatarKey: string) =>
  api.put<Me>('/users/me/avatar-key', { avatarKey });

export function uploadAvatar(file: File) {
  const form = new FormData();
  form.append('photo', file);
  return api.postForm<Me>('/users/me/avatar', form);
}

/** Without `actionType` both kinds come back — the single map draws them together. */
export const fetchCareActionsInBounds = (
  b: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  actionType?: 'food' | 'water'
) =>
  api.get<CareAction[]>(
    `/care-actions?minLat=${b.minLat}&maxLat=${b.maxLat}&minLng=${b.minLng}&maxLng=${b.maxLng}` +
      (actionType ? `&actionType=${actionType}` : '')
  );

/**
 * A petshop listed on the map (entered in the admin panel). Only the card's
 * fields: the listing's window and hidden flag stay on the server, which
 * returns a shop only while it is inside its window. Mobile's
 * `api/petshops.ts` declares the same shape.
 */
export interface Petshop {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  opening_hours: string | null;
  website_url: string | null;
  location: { type: 'Point'; coordinates: [number, number] };
}

export const fetchPetshopsInBounds = (b: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}) =>
  api.get<Petshop[]>(
    `/petshops?minLat=${b.minLat}&maxLat=${b.maxLat}&minLng=${b.minLng}&maxLng=${b.maxLng}`
  );

export const fetchCareStatus = (lat: number, lng: number, actionType: 'food' | 'water') =>
  api.get<CareStatus>(`/care-actions/status?lat=${lat}&lng=${lng}&actionType=${actionType}`);

/**
 * What the photo check said. `unavailable` means the model was off or did
 * not answer — the photo is accepted unchecked. A rejected photo never
 * reaches here: the server answers 422 with `code: 'photoRejected'` and the
 * reason as the message (mobile parity).
 */
export interface PhotoCheck {
  verdict: 'approved' | 'unavailable';
  reason?: string;
  /** Redeemed by addCareAction; the photo itself travels only once. */
  photoToken: string;
}

/** Step one of a drop: upload the photo, let the model look at it. */
export function checkCarePhoto(actionType: 'food' | 'water', photo: File) {
  const form = new FormData();
  form.append('actionType', actionType);
  form.append('photo', photo);
  return api.postForm<PhotoCheck>('/care-actions/check', form);
}

/** The explicit confirm: redeems the token the check handed back. */
export function addCareAction(
  lat: number,
  lng: number,
  actionType: 'food' | 'water',
  photoToken: string
) {
  return api.post<CareAction & WithNewBadges>('/care-actions', {
    lat,
    lng,
    actionType,
    photoToken,
  });
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

// With lat/lng and no radius the server walks the whole table nearest
// first (the animals list); with a radius it bounds the set (the map).
export const fetchAnimals = (
  lat?: number,
  lng?: number,
  radiusMeters?: number,
  species?: string,
  limit?: number,
  offset?: number
) => {
  const q = new URLSearchParams();
  if (lat !== undefined && lng !== undefined) {
    q.set('lat', String(lat));
    q.set('lng', String(lng));
    if (radiusMeters !== undefined) q.set('radiusMeters', String(radiusMeters));
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

/**
 * A photo screened by matchAnimals (its token — the file is already up) or
 * a fresh file, which the server screens inline and may refuse with
 * `photoRejected`.
 */
export function addAnimalPhoto(animalId: number, source: File | { photoToken: string }) {
  if (!(source instanceof File)) {
    return api.post<AnimalPhoto>(`/animals/${animalId}/photos`, { photoToken: source.photoToken });
  }
  const form = new FormData();
  form.append('photo', source);
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
export interface MatchResult {
  candidates: AnimalMatch[];
  radiusMeters: number;
  /** false when the model was off or did not answer: the ranking is field-only. */
  photoChecked: boolean;
  /**
   * One per photo sent, same order; addAnimalPhoto redeems them so the
   * photos travel once. Fifteen minutes; an expired one falls back to the file.
   */
  photoTokens: string[];
}

export const matchAnimals = (input: {
  lat: number;
  lng: number;
  species: 'cat' | 'dog';
  breed?: string | null;
  color?: string | null;
  /**
   * Every photo of the new animal, in the form's order: each is screened
   * for the species (a refusal is `photoRejected` with `photoIndexes`, every refused one),
   * the first is compared with the candidates' cover photos.
   */
  photos: File[];
}) => {
  const form = new FormData();
  form.append('lat', String(input.lat));
  form.append('lng', String(input.lng));
  form.append('species', input.species);
  if (input.breed) form.append('breed', input.breed);
  if (input.color) form.append('color', input.color);
  for (const photo of input.photos) form.append('photos', photo);
  return api.postForm<MatchResult>('/animals/match', form);
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

// The profile's "animals cared for" list is paginated: someone else's profile
// brings the first 3, and the carer gallery fetches the rest from here as it
// is scrolled (components/profile/useCaredAnimals).
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

// Blocking (App Store guideline 1.2). The server ends the friendship with it
// — which is what closes direct messages and my groups to them — and hides
// their comments from me; unblocking brings the comments back, not the
// friendship.
export const blockUser = (userId: number) => api.post<void>(`/users/${userId}/block`);
export const unblockUser = (userId: number) => api.del<void>(`/users/${userId}/block`);
export const fetchMyBlocks = async () => {
  const data = await api.get<{ users: BlockedUser[] }>('/users/me/blocks');
  return data.users;
};

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

/**
 * Each person decides whether the showcase (demo) world is part of their
 * app — the bots' animals, their food and water, the chat and the
 * leaderboard entries (owner, 2026-09-09). On by default.
 */
export const setShowDemo = (showDemo: boolean) =>
  api.put<{ showDemo: boolean }>('/users/me/show-demo', { showDemo });
