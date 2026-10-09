import { apiClient } from './client';

// `vet_health_record` is the health-record slot; it is never sold to vets
// (Turkish law forbids veterinary advertising) and keeps its key: ADR-0006.
export type AdSlot = 'food_popup' | 'water_popup' | 'vet_health_record';

export interface Ad {
  id: number;
  name: string;
  slot: AdSlot;
  headline: string | null;
  body: string | null;
  image_url: string | null;
  target_url: string;
}

/**
 * Fetches the next ad for a placement. Returns null when none is live — the
 * client doesn't render the banner at all in that case.
 */
export async function fetchAd(slot: AdSlot): Promise<Ad | null> {
  const { data } = await apiClient.get<{ ad: Ad | null }>('/ads', {
    params: { slot },
  });
  return data.ad;
}

// Impressions and clicks are reported separately: a fetched-but-never-shown
// ad must not be billed, and rotation must advance by what was actually shown.
export async function recordAdImpression(adId: number): Promise<void> {
  await apiClient.post(`/ads/${adId}/impression`);
}

export async function recordAdClick(adId: number): Promise<void> {
  await apiClient.post(`/ads/${adId}/click`);
}
