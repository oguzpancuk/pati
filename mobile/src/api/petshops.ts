import { apiClient } from './client';
import type { Bounds } from './care';

/**
 * A petshop listed on the map (entered in the admin panel). Only the card's
 * fields: the listing's window and hidden flag stay on the server, which
 * returns a shop only while it is inside its window. Web's `api.ts`
 * declares the same shape.
 */
export interface Petshop {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  opening_hours: string | null;
  website_url: string | null;
  location: GeoJSON.Point;
}

export async function fetchPetshopsInBounds(bounds: Bounds): Promise<Petshop[]> {
  const { data } = await apiClient.get<Petshop[]>('/petshops', { params: bounds });
  return data;
}
