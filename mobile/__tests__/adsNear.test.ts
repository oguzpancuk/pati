jest.mock('../src/api/client', () => ({
  apiClient: { get: jest.fn() },
}));

import { apiClient } from '../src/api/client';
import { fetchAd } from '../src/api/ads';
import { distanceBetween as distanceMeters } from '../src/map/geo';

// An ad may target a circle as small as 100 m (backend/src/utils/adTargeting.js),
// so the viewer's location must survive the rounding fetchAd applies before
// sending it. Three decimals moved it by up to ~70 m at Istanbul's latitude:
// a viewer 40 m from the shop could land outside a 100 m circle (review
// finding on PR #18). The web client's fetchAd (web/src/api.ts) rounds the
// same way; web has no test runner, so this pins the shared rule here.

const mocked = apiClient as unknown as { get: jest.Mock };

beforeEach(() => {
  mocked.get.mockReset();
  mocked.get.mockResolvedValue({ data: { ad: null } });
});

it('sends the viewer within 10 m of where they are', async () => {
  let worst = 0;
  // A grid over Kadıköy at sub-decimal offsets, so the worst case of the
  // rounding (half a step on both axes) is among the points tried.
  for (let i = 0; i < 20; i++) {
    for (let j = 0; j < 20; j++) {
      const near = { lat: 40.98 + i * 0.000437, lng: 29.02 + j * 0.000463 };
      await fetchAd('water_popup', near);
      const { params } = mocked.get.mock.calls.at(-1)[1];
      const sent = { lat: Number(params.lat), lng: Number(params.lng) };
      worst = Math.max(worst, distanceMeters(near, sent));
    }
  }
  expect(worst).toBeLessThan(10);
});

it('sends only the slot when the viewer is not located', async () => {
  await fetchAd('food_popup', null);
  expect(mocked.get).toHaveBeenCalledWith('/ads', { params: { slot: 'food_popup' } });
});
