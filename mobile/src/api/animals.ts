import { apiClient } from './client';
import type { PhotoAsset } from './care';
import type { WithNewBadges } from './users';

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

// Sağlık kaydı yalnızca iki tip. Tedavi/ilaç ayrı kayıt değil, kayda bağlı
// yorum olarak tutuluyor; aşı ise kendi tablosunda (bkz. Vaccination).
export type HealthRecordType = 'illness' | 'injury';

export type HealthRecordStatus = 'not_started' | 'in_treatment' | 'recovered';

export interface HealthRecord {
  id: number;
  record_type: HealthRecordType;
  description: string;
  vet_verified: boolean;
  recorded_by: number;
  recorded_by_name?: string;
  recorded_at: string;
  recovered_at: string | null;
  recovered_by: number | null;
  recovered_by_name: string | null;
  comment_count: number;
  status: HealthRecordStatus;
}

export interface Vaccination {
  id: number;
  vaccine_type: string;
  note: string | null;
  vet_verified: boolean;
  administered_at: string;
  next_due_at: string | null;
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
  vaccination_id: number | null;
  user_id: number;
  user_name: string;
  avatar_url: string | null;
  health_record_type: HealthRecordType | null;
  health_record_description: string | null;
  vaccination_type: string | null;
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
  vaccinations: Vaccination[];
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

export async function createAnimal(input: CreateAnimalInput): Promise<Animal & WithNewBadges> {
  const { data } = await apiClient.post<Animal & WithNewBadges>('/animals', input);
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
): Promise<HealthRecord & WithNewBadges> {
  const { data } = await apiClient.post<HealthRecord & WithNewBadges>(
    `/animals/${animalId}/health-records`,
    {
      recordType,
      description,
    }
  );
  return data;
}

export async function markHealthRecordRecovered(
  animalId: number,
  recordId: number
): Promise<HealthRecord & WithNewBadges> {
  const { data } = await apiClient.post<HealthRecord & WithNewBadges>(
    `/animals/${animalId}/health-records/${recordId}/recover`
  );
  return data;
}

export interface AddVaccinationInput {
  vaccineType: string;
  note?: string;
  administeredAt?: string;
  nextDueAt?: string;
}

export async function addVaccination(
  animalId: number,
  input: AddVaccinationInput
): Promise<Vaccination & WithNewBadges> {
  const { data } = await apiClient.post<Vaccination & WithNewBadges>(
    `/animals/${animalId}/vaccinations`,
    input
  );
  return data;
}

// Kayıtlı bir hayvanı yeniden gördüğünü bildirir: güncel konumunu buraya taşır
// ve bildireni bakım listesine ekler.
export async function reportSighting(animalId: number, lat: number, lng: number): Promise<Animal> {
  const { data } = await apiClient.post<Animal>(`/animals/${animalId}/sightings`, { lat, lng });
  return data;
}

/**
 * Bir yorum ya bir sağlık kaydına ya bir aşı kaydına bağlanabilir, ikisine
 * birden değil. Sunucu da aynı kısıtı uyguluyor (animal_comments tablosundaki
 * CHECK), o yüzden burada tek bir "hedef" nesnesi geçiriliyor.
 */
export type CommentTarget =
  | { healthRecordId: number; vaccinationId?: undefined }
  | { vaccinationId: number; healthRecordId?: undefined };

export async function fetchAnimalComments(
  animalId: number,
  target?: CommentTarget
): Promise<AnimalComment[]> {
  const { data } = await apiClient.get<AnimalComment[]>(`/animals/${animalId}/comments`, {
    params: target,
  });
  return data;
}

export async function addAnimalComment(
  animalId: number,
  body: string,
  target?: CommentTarget
): Promise<AnimalComment & WithNewBadges> {
  const { data } = await apiClient.post<AnimalComment & WithNewBadges>(
    `/animals/${animalId}/comments`,
    { body, ...target }
  );
  return data;
}
