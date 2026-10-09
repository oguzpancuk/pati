const TOKEN_KEY = 'stray-admin-token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (res.status === 401) {
    // On an expired session, clear the token and return to login; otherwise
    // the panel shows a meaningless error on every request and stays stuck.
    setToken(null);
    window.location.href = '/login';
    throw new ApiError(401, 'Oturumunuz sona erdi');
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(data) }),
  del: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'DELETE', body: JSON.stringify(data ?? {}) }),
};

// ---------------------------------------------------------------- tipler

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: 'user' | 'vet' | 'admin';
  avatar_url: string | null;
  created_at: string;
  suspended_at: string | null;
  suspended_reason: string | null;
  last_points: number;
  care_action_count: number;
  animal_count: number;
  comment_count: number;
}

export interface AdminAnimal {
  id: number;
  species: 'cat' | 'dog';
  name: string | null;
  color: string | null;
  breed: string | null;
  markings: string | null;
  created_at: string;
  location_updated_at: string;
  location: { type: 'Point'; coordinates: [number, number] };
  created_by_id: number;
  created_by_name: string;
  cover_photo_url: string | null;
  photo_count: number;
  comment_count: number;
  carer_count: number;
  vaccination_count: number;
}

export interface AdminCareAction {
  id: number;
  action_type: 'food' | 'water';
  photo_url: string;
  created_at: string;
  location: { type: 'Point'; coordinates: [number, number] };
  user_id: number;
  user_name: string;
  user_suspended_at: string | null;
}

export interface AdminVaccination {
  id: number;
  vaccine_type: string;
  note: string | null;
  vet_verified: boolean;
  administered_at: string;
  next_due_at: string | null;
  recorded_at: string;
  animal_id: number;
  animal_name: string | null;
  animal_species: 'cat' | 'dog';
  animal_breed: string | null;
  recorded_by_id: number;
  recorded_by_name: string;
}

export interface AdminReport {
  id: number;
  target_type: 'animal' | 'comment' | 'care_action' | 'user' | 'message';
  target_id: number;
  reason: string;
  details: string | null;
  status: 'open' | 'resolved' | 'dismissed';
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  reporter_id: number;
  reporter_name: string;
  resolved_by_name: string | null;
  target_summary: string | null;
}

export interface AdminComment {
  id: number;
  body: string;
  created_at: string;
  health_record_id: number | null;
  user_id: number;
  user_name: string;
  animal_id: number;
  animal_name: string | null;
  animal_species: 'cat' | 'dog';
}

export interface AuditEntry {
  id: number;
  action: string;
  target_type: string;
  target_id: number | null;
  details: Record<string, unknown>;
  created_at: string;
  actor_id: number | null;
  actor_name: string | null;
}

export interface DashboardStats {
  totals: {
    users: number;
    suspended_users: number;
    new_users_7d: number;
    animals: number;
    care_actions: number;
    care_actions_24h: number;
    comments: number;
    health_records: number;
    recovered_records: number;
    vaccinations: number;
    vet_verified_vaccinations: number;
  };
  daily: { day: string; food: number; water: number; animals: number; comments: number }[];
  species: { species: 'cat' | 'dog'; count: number }[];
  healthRecordTypes: { record_type: string; count: number }[];
  vaccineTypes: { vaccine_type: string; count: number }[];
}

export type AdSlot = 'food_popup' | 'water_popup' | 'vet_health_record';

export interface Advertiser {
  id: number;
  name: string;
  /** Every slot the ad runs in, in a fixed order; `slot` is the first. */
  slots: AdSlot[];
  slot: AdSlot;
  headline: string | null;
  body: string | null;
  image_url: string | null;
  target_url: string;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  created_at: string;
  impressions: number;
  clicks: number;
  /** The ad's target circle; all three null for a nationwide ad. */
  target_lat: number | null;
  target_lng: number | null;
  target_radius_m: number | null;
}

/** What the create/edit form sends: null makes the ad nationwide. */
export interface AdTarget {
  lat: number;
  lng: number;
  radiusMeters: number;
}

/** Image upload is multipart, so it lives outside the shared JSON client. */
export async function uploadAdvertiserImage(id: number, file: File): Promise<Advertiser> {
  const form = new FormData();
  form.append('image', file);
  const res = await fetch(`/api/admin/advertisers/${id}/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return body as Advertiser;
}

export interface AdminPetshop {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  opening_hours: string | null;
  website_url: string | null;
  location: { type: 'Point'; coordinates: [number, number] };
  hidden: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
  /** On the public map right now: not hidden and inside its window. */
  listed: boolean;
}

export interface CurrentUser {
  id: number;
  name: string;
  email: string;
  role: string;
}
