import { apiClient } from './client';

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
  actionCountLast24h: number;
  lastActionAt: string | null;
  radiusMeters: number;
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export async function fetchCareActionsInBounds(bounds: Bounds): Promise<CareAction[]> {
  const { data } = await apiClient.get<CareAction[]>('/care-actions', { params: bounds });
  return data;
}

export async function fetchCareStatus(lat: number, lng: number): Promise<CareStatus> {
  const { data } = await apiClient.get<CareStatus>('/care-actions/status', {
    params: { lat, lng },
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
): Promise<CareAction> {
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

  const { data } = await apiClient.post<CareAction>('/care-actions', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
