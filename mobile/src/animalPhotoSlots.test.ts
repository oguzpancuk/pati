import { animalPhotoSlots, HERO_PHOTOS, PHOTO_GRID_COLUMNS } from './animalPhotoSlots';

// Every grid is whole rows, never more than the hero's two.
function cells(s: ReturnType<typeof animalPhotoSlots>): number {
  return s.shown + (s.add ? 1 : 0) + s.placeholders;
}

describe('animal photo grid slots', () => {
  describe('a carer gets one add tile after the photos', () => {
    test.each([
      // photos, shown, more, placeholders
      [0, 0, 0, 2],
      [1, 1, 0, 1],
      [2, 2, 0, 0],
      [3, 3, 0, 2],
      [4, 4, 0, 1],
      [5, 5, 0, 0],
      [6, 5, 1, 0],
      [9, 5, 4, 0],
    ])('%i photos: %i shown, +%i, %i placeholders', (photos, shown, more, placeholders) => {
      const slots = animalPhotoSlots(photos, true);
      expect(slots).toEqual({ shown, more, add: true, placeholders });
      expect(cells(slots) % PHOTO_GRID_COLUMNS).toBe(0);
      expect(cells(slots)).toBeLessThanOrEqual(HERO_PHOTOS);
    });

    test('three photos push the add tile onto a second row', () => {
      const slots = animalPhotoSlots(3, true);
      // Cells 0-2 are photos; the add tile opens row two.
      expect(slots.shown).toBe(PHOTO_GRID_COLUMNS);
      expect(cells(slots)).toBe(PHOTO_GRID_COLUMNS * 2);
    });
  });

  describe('everyone else sees the grid as before', () => {
    test.each([
      [0, 0, 0, 3],
      [1, 1, 0, 2],
      [2, 2, 0, 1],
      [3, 3, 0, 0],
      [4, 4, 0, 2],
      [5, 5, 0, 1],
      [6, 6, 0, 0],
      [9, 6, 3, 0],
    ])('%i photos: %i shown, +%i, %i placeholders', (photos, shown, more, placeholders) => {
      const slots = animalPhotoSlots(photos, false);
      expect(slots).toEqual({ shown, more, add: false, placeholders });
      expect(cells(slots) % PHOTO_GRID_COLUMNS).toBe(0);
    });
  });
});
