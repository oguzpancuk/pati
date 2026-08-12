import { apiClient } from './client';

export interface Animal {
  id: number;
  species: 'cat' | 'dog';
  name: string | null;
  color: string | null;
  size: string | null;
  markings: string | null;
  created_at: string;
  location: GeoJSON.Point;
  distance_meters?: number;
}

export interface HealthRecord {
  id: number;
  record_type: string;
  description: string;
  vet_verified: boolean;
  recorded_by: number;
  recorded_at: string;
}

export interface AnimalDetail extends Animal {
  photos: { id: number; url: string; created_at: string }[];
  healthRecords: HealthRecord[];
}

export async function fetchAnimals(
  lat?: number,
  lng?: number,
  radiusMeters?: number
): Promise<Animal[]> {
  const { data } = await apiClient.get<Animal[]>('/animals', {
    params: lat && lng ? { lat, lng, radiusMeters } : undefined,
  });
  return data;
}

export async function fetchAnimal(id: number): Promise<AnimalDetail> {
  const { data } = await apiClient.get<AnimalDetail>(`/animals/${id}`);
  return data;
}

export interface CreateAnimalInput {
  species: 'cat' | 'dog';
  name?: string;
  color?: string;
  size?: string;
  markings?: string;
  lat: number;
  lng: number;
}

export async function createAnimal(input: CreateAnimalInput): Promise<Animal> {
  const { data } = await apiClient.post<Animal>('/animals', input);
  return data;
}

export async function addHealthRecord(
  animalId: number,
  recordType: string,
  description: string
): Promise<HealthRecord> {
  const { data } = await apiClient.post<HealthRecord>(`/animals/${animalId}/health-records`, {
    recordType,
    description,
  });
  return data;
}
