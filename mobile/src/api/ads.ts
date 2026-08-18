import { apiClient } from './client';

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
 * Yerleşim için sıradaki reklamı getirir. Yayında reklam yoksa null döner —
 * istemci bu durumda bandı hiç çizmez.
 */
export async function fetchAd(slot: AdSlot): Promise<Ad | null> {
  const { data } = await apiClient.get<{ ad: Ad | null }>('/ads', {
    params: { slot },
  });
  return data.ad;
}

// Gösterim ve tıklama ayrı bildiriliyor: getirilip de gösterilmeyen bir reklam
// faturaya yazılmasın ve rotasyon sırası gerçekten gösterilenlere göre ilerlesin.
export async function recordAdImpression(adId: number): Promise<void> {
  await apiClient.post(`/ads/${adId}/impression`);
}

export async function recordAdClick(adId: number): Promise<void> {
  await apiClient.post(`/ads/${adId}/click`);
}
