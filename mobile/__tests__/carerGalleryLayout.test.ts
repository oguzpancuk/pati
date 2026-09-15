import { CARER_GALLERY, carerCardWidth } from '../src/carerGallery';

const { gap, gutter, peek } = CARER_GALLERY;

/** How much of the first card past the fully shown ones the right edge leaves visible. */
function peekOf(stripWidth: number) {
  const w = carerCardWidth(stripWidth);
  const pitch = w + gap;
  const whole = Math.floor((stripWidth - gutter + gap) / pitch);
  return { w, shown: stripWidth - gutter - whole * pitch };
}

describe('the carer card width', () => {
  // Phones from SE to Pro Max, a tablet, and a desktop browser window.
  it.each([320, 360, 375, 390, 393, 402, 414, 430, 440, 768, 1024, 1280])(
    'leaves a real part of the next card showing on a %ipx strip',
    (width) => {
      const { w, shown } = peekOf(width);
      // The 84pt avatar and its name still fit.
      expect(w).toBeGreaterThanOrEqual(88);
      expect(w).toBeLessThanOrEqual(130);
      // At least a quarter of a card, never nearly a whole one.
      expect(shown).toBeGreaterThanOrEqual(0.25 * w);
      expect(shown).toBeLessThanOrEqual(peek * w + 1 + gap);
    }
  );

  it('falls back to the base width before the strip is measured', () => {
    expect(carerCardWidth(0)).toBe(CARER_GALLERY.baseWidth);
    expect(carerCardWidth(Number.NaN)).toBe(CARER_GALLERY.baseWidth);
  });
});
