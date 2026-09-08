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
  /** The face cut-out of the best photo (P3); null → the SVG avatar stands in. */
  cover_thumb_url?: string | null;
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
  thumb_url?: string | null;
  face_score?: number | null;
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
export type SimilarityReason = 'photo_same' | 'photo_similar' | 'breed' | 'color' | 'distance';

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
  /**
   * Every photo of the new animal, in the form's order: each is screened
   * for the species, the first is compared with the candidates' cover photos.
   */
  photos: PhotoAsset[];
}

export interface MatchResult {
  candidates: AnimalMatch[];
  radiusMeters: number;
  /** false when the model was off or did not answer: the ranking is field-only. */
  photoChecked: boolean;
  /**
   * One per photo sent, same order; addAnimalPhoto redeems them so the
   * photos travel once. Fifteen minutes; an expired one falls back to the file.
   */
  photoTokens: string[];
}

/**
 * "Is this animal already registered?" candidates before opening a new
 * record. The server ranks same-species animals within 1 km by the entered
 * pattern/color and distance, then has the model compare the photo with
 * the best candidates' cover photos — high/medium/low similarity, no
 * numeric percentage, on purpose. A photo that does not show the claimed
 * species is refused with `photoRejected` and `photoIndexes`, every refused one.
 */
export async function matchAnimals(input: MatchAnimalsInput): Promise<MatchResult> {
  const form = new FormData();
  form.append('lat', String(input.lat));
  form.append('lng', String(input.lng));
  form.append('species', input.species);
  if (input.breed) form.append('breed', input.breed);
  if (input.color) form.append('color', input.color);
  for (const photo of input.photos) {
    form.append('photos', {
      uri: photo.uri,
      type: photo.type ?? 'image/jpeg',
      name: photo.fileName ?? 'photo.jpg',
    } as unknown as Blob);
  }

  const { data } = await apiClient.post<MatchResult>('/animals/match', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    // The matching screen has no cancel: bound the wait. Several photos go
    // up and the model reads dozens, so this is longer than a plain upload.
    timeout: 90000,
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

/**
 * A photo screened by matchAnimals (its token — the file is already up) or
 * a fresh file, which the server screens inline and may refuse with
 * `photoRejected`.
 */
export async function addAnimalPhoto(
  animalId: number,
  source: PhotoAsset | { photoToken: string }
): Promise<AnimalPhoto> {
  if ('photoToken' in source) {
    const { data } = await apiClient.post<AnimalPhoto>(`/animals/${animalId}/photos`, {
      photoToken: source.photoToken,
    });
    return data;
  }
  const photo = source;
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
