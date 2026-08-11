import { apiClient } from './client';

export type RegionStatus = 'green' | 'yellow' | 'red';

export interface Region {
  id: number;
  name: string;
  status: RegionStatus;
  status_updated_at: string;
  boundary: GeoJSON.Polygon;
}

export async function fetchRegions(): Promise<Region[]> {
  const { data } = await apiClient.get<Region[]>('/regions');
  return data;
}

export async function addRegionAction(
  regionId: number,
  actionType: 'food' | 'water' | 'sighting',
  animalId?: number
) {
  const { data } = await apiClient.post(`/regions/${regionId}/actions`, { actionType, animalId });
  return data;
}
