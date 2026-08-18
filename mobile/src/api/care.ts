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
  // Yarıçap ve pencere sunucudan geliyor; arayüz metinleri bu değerleri
  // yazdırıyor ki iki tarafta ayrı ayrı güncellenmesi gerekmesin.
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

export interface PhotoAsset {
  uri: string;
  type?: string;
  fileName?: string;
}

export async function addCareAction(
  lat: number,
  lng: number,
  actionType: 'food' | 'water',
  deviceLat: number,
  deviceLng: number,
  photo: PhotoAsset
): Promise<CareAction & WithNewBadges> {
  const form = new FormData();
  form.append('lat', String(lat));
  form.append('lng', String(lng));
  form.append('actionType', actionType);
  form.append('deviceLat', String(deviceLat));
  form.append('deviceLng', String(deviceLng));
  form.append('photo', {
    uri: photo.uri,
    type: photo.type ?? 'image/jpeg',
    name: photo.fileName ?? 'photo.jpg',
  } as unknown as Blob);

  const { data } = await apiClient.post<CareAction & WithNewBadges>('/care-actions', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
