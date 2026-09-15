/**
 * The animal profile's photo grid, as numbers both clients render (web
 * imports this through the @mobile alias). Kept pure so the arithmetic is
 * tested once instead of drifting between two JSX loops.
 */

/** Square tiles per row (P6 item 7). */
export const PHOTO_GRID_COLUMNS = 3;

/**
 * The hero shows two rows at most (review finding): every accepted "bakım
 * ver" adds a photo, so an unbounded grid would push the name and the
 * action pair below the fold on a well-cared-for animal. The rest live in
 * the viewer behind the "+N" tile.
 */
export const HERO_PHOTOS = PHOTO_GRID_COLUMNS * 2;

export type PhotoSlots = {
  /** Photo tiles, in order: photos[0] up to photos[shown - 1]. */
  shown: number;
  /** "+N" on the last shown photo tile; 0 when every photo is shown. */
  more: number;
  /** One "fotoğraf ekle" tile right after the photos. */
  add: boolean;
  /** Inert dashed "fotoğraf" tiles completing the last row. */
  placeholders: number;
};

/**
 * `canAdd`: the viewer is a carer outside match review. A carer adds a
 * photo from the grid's empty slot rather than a button (owner,
 * 2026-09-15), so the add tile always gets a cell: on a full hero it takes
 * the last one and the photo before it carries the "+N".
 */
export function animalPhotoSlots(photoCount: number, canAdd: boolean): PhotoSlots {
  const count = Math.max(0, Math.floor(photoCount));
  const capacity = canAdd ? HERO_PHOTOS - 1 : HERO_PHOTOS;
  const shown = Math.min(count, capacity);
  const used = shown + (canAdd ? 1 : 0);
  // An empty grid without the add tile still shows one row of
  // placeholders: even an empty profile invites.
  const placeholders =
    used === 0
      ? PHOTO_GRID_COLUMNS
      : (PHOTO_GRID_COLUMNS - (used % PHOTO_GRID_COLUMNS)) % PHOTO_GRID_COLUMNS;
  return { shown, more: count - shown, add: canAdd, placeholders };
}
