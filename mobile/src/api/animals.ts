import { apiClient } from './client';
import type { PhotoAsset } from './care';

export interface Animal {
  id: number;
  species: 'cat' | 'dog';
  name: string | null;
  color: string | null;
  breed: string | null;
  markings: string | null;
  created_at: string;
  location: GeoJSON.Point;
  distance_meters?: number;
  cover_photo_url?: string | null;
}

export type HealthRecordType = 'illness' | 'injury' | 'treatment' | 'vaccination' | 'medication';

export interface HealthRecord {
  id: number;
  record_type: HealthRecordType;
  description: string;
  vet_verified: boolean;
  recorded_by: number;
  recorded_by_name?: string;
  recorded_at: string;
  comment_count: number;
}

export interface AnimalPhoto {
  id: number;
  url: string;
  created_at: string;
}

export interface AnimalComment {
  id: number;
  body: string;
  created_at: string;
  health_record_id: number | null;
  user_id: number;
  user_name: string;
  avatar_url: string | null;
  health_record_type: HealthRecordType | null;
  health_record_description: string | null;
}

export interface Carer {
  id: number;
  name: string;
  avatar_url: string | null;
}

export interface AnimalDetail extends Animal {
  location_updated_at: string;
  photos: AnimalPhoto[];
  healthRecords: HealthRecord[];
  carers: Carer[];
  isCarer: boolean;
}

export async function fetchAnimals(
  lat?: number,
  lng?: number,
  radiusMeters?: number,
  species?: 'cat' | 'dog'
): Promise<Animal[]> {
  const { data } = await apiClient.get<Animal[]>('/animals', {
    params: lat && lng ? { lat, lng, radiusMeters, species } : { species },
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
  breed?: string;
  markings?: string;
  lat: number;
  lng: number;
}

export async function createAnimal(input: CreateAnimalInput): Promise<Animal> {
  const { data } = await apiClient.post<Animal>('/animals', input);
  return data;
}

export async function addAnimalPhoto(animalId: number, photo: PhotoAsset): Promise<AnimalPhoto> {
  const form = new FormData();
  form.append('photo', {
    uri: photo.uri,
    type: photo.type ?? 'image/jpeg',
    name: photo.fileName ?? 'photo.jpg',
  } as unknown as Blob);

  const { data } = await apiClient.post<AnimalPhoto>(`/animals/${animalId}/photos`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function addHealthRecord(
  animalId: number,
  recordType: HealthRecordType,
  description: string
): Promise<HealthRecord> {
  const { data } = await apiClient.post<HealthRecord>(`/animals/${animalId}/health-records`, {
    recordType,
    description,
  });
  return data;
}

// Kayıtlı bir hayvanı yeniden gördüğünü bildirir: güncel konumunu buraya taşır
// ve bildireni bakım listesine ekler.
export async function reportSighting(
  animalId: number,
  lat: number,
  lng: number
): Promise<Animal> {
  const { data } = await apiClient.post<Animal>(`/animals/${animalId}/sightings`, { lat, lng });
  return data;
}

export async function fetchAnimalComments(
  animalId: number,
  healthRecordId?: number
): Promise<AnimalComment[]> {
  const { data } = await apiClient.get<AnimalComment[]>(`/animals/${animalId}/comments`, {
    params: healthRecordId ? { healthRecordId } : undefined,
  });
  return data;
}

export async function addAnimalComment(
  animalId: number,
  body: string,
  healthRecordId?: number
): Promise<AnimalComment> {
  const { data } = await apiClient.post<AnimalComment>(`/animals/${animalId}/comments`, {
    body,
    healthRecordId,
  });
  return data;
}
