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

// Health records come in just two types. Treatment/medication is not a
// separate record but a comment bound to one; vaccinations have their own
// table (see Vaccination).
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
  vaccinations: Vaccination[];
  carers: Carer[];
  isCarer: boolean;
}

export interface FetchAnimalsOptions {
  lat?: number;
  lng?: number;
  radiusMeters?: number;
  species?: 'cat' | 'dog';
  limit?: number;
  offset?: number;
}

// Without a limit the server applies a wide default (the map fetches the
// surroundings in one go); list screens should request page by page.
export async function fetchAnimals(options: FetchAnimalsOptions = {}): Promise<Animal[]> {
  const { lat, lng, radiusMeters, species, limit, offset } = options;
  const { data } = await apiClient.get<Animal[]>('/animals', {
    params:
      lat && lng ? { lat, lng, radiusMeters, species, limit, offset } : { species, limit, offset },
  });
  return data;
}

export type SimilarityLevel = 'high' | 'medium' | 'low';
export type SimilarityReason = 'breed' | 'color' | 'distance';

export interface AnimalMatch extends Animal {
  distance_meters: number;
  similarity: SimilarityLevel;
  similarity_reasons: SimilarityReason[];
}

export interface MatchAnimalsInput {
  lat: number;
  lng: number;
  species: 'cat' | 'dog';
  breed?: string | null;
  color?: string | null;
}

/**
 * "Is this animal already registered?" candidates before opening a new
 * record. The server ranks same-species animals within 1 km by the entered
 * pattern/color and distance as high/medium/low similarity (no numeric
 * percentage, on purpose).
 */
export async function matchAnimals(
  input: MatchAnimalsInput
): Promise<{ candidates: AnimalMatch[]; radiusMeters: number }> {
  const { data } = await apiClient.get<{ candidates: AnimalMatch[]; radiusMeters: number }>(
    '/animals/match',
    {
      params: {
        lat: input.lat,
        lng: input.lng,
        species: input.species,
        breed: input.breed || undefined,
        color: input.color || undefined,
      },
    }
  );
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

/** Undoes a (possibly mistaken) recovered mark; the record reopens for comments. */
export async function reopenHealthRecord(
  animalId: number,
  recordId: number
): Promise<HealthRecord> {
  const { data } = await apiClient.post<HealthRecord>(
    `/animals/${animalId}/health-records/${recordId}/reopen`
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

// Reports a sighting of a registered animal: moves its current location here
// and adds the reporter to the care list.
export async function reportSighting(animalId: number, lat: number, lng: number): Promise<Animal> {
  const { data } = await apiClient.post<Animal>(`/animals/${animalId}/sightings`, { lat, lng });
  return data;
}

export interface CommentPage {
  comments: AnimalComment[];
  total: number;
}

/**
 * Comments attach only to the animal or to a health record. Vaccination
 * records have no chat: a vaccine is a one-off event with no process to
 * follow.
 *
 * Chat pages newest-first: offset 0 fetches the last N comments (in
 * chronological order), and offset grows with each "load earlier".
 */
export async function fetchAnimalComments(
  animalId: number,
  options: { healthRecordId?: number; limit?: number; offset?: number } = {}
): Promise<CommentPage> {
  const { healthRecordId, limit, offset } = options;
  const { data } = await apiClient.get<CommentPage>(`/animals/${animalId}/comments`, {
    params: { healthRecordId, limit, offset },
  });
  return data;
}

export async function addAnimalComment(
  animalId: number,
  body: string,
  healthRecordId?: number
): Promise<AnimalComment & WithNewBadges> {
  const { data } = await apiClient.post<AnimalComment & WithNewBadges>(
    `/animals/${animalId}/comments`,
    { body, healthRecordId }
  );
  return data;
}
