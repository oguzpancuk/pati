/**
 * The carer gallery's geometry, shared by both clients (web imports it as
 * `@mobile/carerGallery`, so no react-native here).
 *
 * The strip has no "show more" (owner, 2026-09-15): the only cue that more
 * animals lie to the right is a card cut by the strip's edge. With a fixed
 * card width that cut lands wherever the screen happens to end — on a 375pt
 * phone it fell 1pt into the fourth avatar, which reads as no cue at all.
 * So the width gives a little instead: cards at rest on the gutter always
 * end with PEEK of the next one showing, at any strip width.
 */
export const CARER_GALLERY = {
  /** The card width the design starts from (the 84pt avatar plus air). */
  baseWidth: 104,
  gap: 12,
  /** The page gutter the first card rests on; the strip bleeds past it. */
  gutter: 16,
  /** How much of the next card the right edge shows, as a share of a card. */
  peek: 0.35,
} as const;

/**
 * The card width for a strip this wide (edge to edge, gutter included):
 * the whole number of cards closest to the base width, stretched or
 * shrunk so the next one peeks by `peek`. Whole pixels, so the snap
 * interval and the laid-out cards cannot drift apart over a long strip.
 */
export function carerCardWidth(stripWidth: number): number {
  const { baseWidth, gap, gutter, peek } = CARER_GALLERY;
  const room = stripWidth - gutter;
  if (!(room > 0)) return baseWidth;
  const whole = Math.max(1, Math.round((room - peek * baseWidth) / (baseWidth + gap)));
  return Math.floor((room - whole * gap) / (whole + peek));
}
