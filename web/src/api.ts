/**
 * Backend istemcisi. Uç noktalar ve tipler mobil taraftaki
 * mobile/src/api/*.ts ile aynı sözleşmeyi kullanıyor; web yalnızca ihtiyacı
 * olan alt kümeyi taşıyor.
 */
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
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, (body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(data ?? {}) }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(data ?? {}) }),
  postForm: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
};

// ---------------------------------------------------------------- tipler

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
}

export interface UserLevel {
  level: number;
  title: string;
  nextTitle: string | null;
  progress: number;
}

export interface Me extends User {
  points: { total: number };
  level: UserLevel;
  rank: { rank: number; totalUsers: number } | null;
  stats: { foodCount: number; waterCount: number; animalCount: number };
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

// ---------------------------------------------------------------- çağrılar

export const login = (email: string, password: string) =>
  api.post<{ user: User; token: string }>('/auth/login', { email, password });

export const register = (name: string, email: string, password: string) =>
  api.post<{ user: User; token: string }>('/auth/register', { name, email, password });

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
  return api.postForm<CareAction>('/care-actions', form);
}

export const fetchAnimals = (
  lat?: number,
  lng?: number,
  radiusMeters = 10000,
  species?: string
) => {
  const q = new URLSearchParams();
  if (lat !== undefined && lng !== undefined) {
    q.set('lat', String(lat));
    q.set('lng', String(lng));
    q.set('radiusMeters', String(radiusMeters));
  }
  if (species) q.set('species', species);
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
}) => api.post<Animal>('/animals', input);

export function addAnimalPhoto(animalId: number, file: File) {
  const form = new FormData();
  form.append('photo', file);
  return api.postForm<AnimalPhoto>(`/animals/${animalId}/photos`, form);
}

/** Sohbet sayfalı: sunucu en yeniden geriye `limit/offset` ile dönüyor. */
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
  api.post<AnimalComment>(`/animals/${animalId}/comments`, { body, healthRecordId });

export const addHealthRecord = (
  animalId: number,
  recordType: 'illness' | 'injury',
  description: string
) => api.post<HealthRecord>(`/animals/${animalId}/health-records`, { recordType, description });

export const addVaccination = (animalId: number, vaccineType: string, note?: string) =>
  api.post<Vaccination>(`/animals/${animalId}/vaccinations`, { vaccineType, note });

/**
 * Yeni kayıt açmadan önce "bu hayvan zaten kayıtlı mı?" adayları. Sunucu 1 km
 * içindeki aynı türden hayvanları desen/renk ve mesafeye göre yüksek/orta/
 * düşük benzerlikle sıralıyor (sayısal yüzde yok, bilerek).
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

// Kayıtlı hayvanı yeniden gördüğünü bildirir: konumunu taşır, bildireni
// bakım listesine ekler.
export const reportSighting = (animalId: number, lat: number, lng: number) =>
  api.post<Animal>(`/animals/${animalId}/sightings`, { lat, lng });
