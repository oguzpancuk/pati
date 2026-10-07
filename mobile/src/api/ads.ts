import { apiClient } from './client';
import type { Coordinates } from '../location';

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
 *
 * `near` is where the viewer is, for ads targeted at an area: without it the
 * server falls back to the viewer's last care drop, and a viewer it cannot
 * place sees only nationwide ads. Rounded to four decimals (about 11 m):
 * the smallest circle an ad may have is 100 m, and three decimals moved the
 * point by up to ~70 m — enough to put a viewer 40 m from the shop outside
 * its circle (review finding). Finer than that the endpoint has no use for.
 */
export async function fetchAd(slot: AdSlot, near?: Coordinates | null): Promise<Ad | null> {
  const { data } = await apiClient.get<{ ad: Ad | null }>('/ads', {
    params: near ? { slot, lat: near.lat.toFixed(4), lng: near.lng.toFixed(4) } : { slot },
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
