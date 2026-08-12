import { apiClient } from './client';

export interface CareAction {
  id: number;
  action_type: 'food' | 'water';
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

export async function fetchCareActions(
  lat: number,
  lng: number,
  radiusMeters = 3000
): Promise<CareAction[]> {
  const { data } = await apiClient.get<CareAction[]>('/care-actions', {
    params: { lat, lng, radiusMeters },
  });
  return data;
}

export async function fetchCareStatus(lat: number, lng: number): Promise<CareStatus> {
  const { data } = await apiClient.get<CareStatus>('/care-actions/status', {
    params: { lat, lng },
  });
  return data;
}

export async function addCareAction(
  lat: number,
  lng: number,
  actionType: 'food' | 'water'
): Promise<CareAction> {
  const { data } = await apiClient.post<CareAction>('/care-actions', { lat, lng, actionType });
  return data;
}
