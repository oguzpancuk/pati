import { apiClient } from './client';
import type { WithNewBadges } from './users';

export interface CareAction {
  id: number;
  action_type: 'food' | 'water';
  photo_url: string;
  created_at: string;
  location: GeoJSON.Point;
  weight: string;
}

export interface CareStatus {
  needsAttention: boolean;
  actionCount: number;
  lastActionAt: string | null;
  // Radius and window come from the server; UI copy prints these values so
  // the two sides never need updating separately.
  radiusMeters: number;
  windowHours: number;
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export async function fetchCareActionsInBounds(
  bounds: Bounds,
  actionType?: 'food' | 'water'
): Promise<CareAction[]> {
  const { data } = await apiClient.get<CareAction[]>('/care-actions', {
    params: { ...bounds, actionType },
  });
  return data;
}

export async function fetchCareStatus(
  lat: number,
  lng: number,
  actionType?: 'food' | 'water'
): Promise<CareStatus> {
  const { data } = await apiClient.get<CareStatus>('/care-actions/status', {
    params: { lat, lng, actionType },
  });
  return data;
}

export interface MyCareAction {
  id: number;
  action_type: 'food' | 'water';
  photo_url: string;
  created_at: string;
  location: GeoJSON.Point;
  /** Computed server-side against the server clock — don't re-derive on device. */
  deletable: boolean;
}

export interface MyCareActionsResponse {
  total: number;
  deleteWindowMinutes: number;
  actions: MyCareAction[];
}

export async function fetchMyCareActions(limit = 20, offset = 0): Promise<MyCareActionsResponse> {
  const { data } = await apiClient.get<MyCareActionsResponse>('/care-actions/mine', {
    params: { limit, offset },
  });
  return data;
}

export async function deleteCareAction(id: number): Promise<void> {
  await apiClient.delete(`/care-actions/${id}`);
}

export interface PhotoAsset {
  uri: string;
  type?: string;
  fileName?: string;
}

/**
 * A food/water record. `lat`/`lng` is always the user's **own** location: no
 * point is picked from the map anymore, the bottom button drops at where
 * they stand. That's why the previously separate `deviceLat`/`deviceLng`
 * are gone.
 */
/**
 * What the photo check said. `unavailable` means the model was off or did
 * not answer — the photo is accepted unchecked, exactly as before the check
 * existed. A rejected photo never reaches here: the server answers 422 with
 * `code: 'photoRejected'` and the reason as `error`.
 */
export interface PhotoCheck {
  verdict: 'approved' | 'unavailable';
  reason?: string;
  /** Redeemed by addCareAction; the photo itself travels only once. */
  photoToken: string;
}

/**
 * Step one of a drop: upload the photo, let the model look at it. The
 * interstitial has no cancel button, so this request must be bounded: a
 * stalled upload would otherwise spin forever (axios has no default
 * timeout). 60 s covers a large photo on slow cellular plus the model.
 */
export async function checkCarePhoto(
  actionType: 'food' | 'water',
  photo: PhotoAsset
): Promise<PhotoCheck> {
  const form = new FormData();
  form.append('actionType', actionType);
  form.append('photo', {
    uri: photo.uri,
    type: photo.type ?? 'image/jpeg',
    name: photo.fileName ?? 'photo.jpg',
  } as unknown as Blob);

  const { data } = await apiClient.post<PhotoCheck>('/care-actions/check', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });
  return data;
}

/** The explicit confirm: redeems the token the check handed back. */
export async function addCareAction(
  lat: number,
  lng: number,
  actionType: 'food' | 'water',
  photoToken: string
): Promise<CareAction & WithNewBadges> {
  const { data } = await apiClient.post<CareAction & WithNewBadges>(
    '/care-actions',
    { lat, lng, actionType, photoToken },
    { timeout: 30000 }
  );
  return data;
}
