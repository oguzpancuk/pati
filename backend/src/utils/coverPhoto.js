/**
 * The one definition of "an animal's picture" (ROADMAP P3): among the photos
 * with a face cut-out the best-scored, oldest first on a tie; the oldest
 * photo when none has one — the score only ranks photos that HAVE a
 * cut-out, so a backfill's "no face" marker of 0 cannot outrank a
 * never-checked photo (review verified the naive order did exactly that).
 * getAnimal applies the same order in JS
 * over the photos it already fetched — change both or neither. Every list
 * that shows an animal joins this, so the picture is the same on the map,
 * in the lists, on the profile and in the match candidates.
 *
 * Use as `${coverPhotoJoin('a')}` after the animals table alias, then
 * select `cover.url AS cover_photo_url, cover.thumb_url AS cover_thumb_url`.
 */
function coverPhotoJoin(alias = 'a') {
  return `
  LEFT JOIN LATERAL (
    SELECT url, thumb_url FROM animal_photos
    WHERE animal_id = ${alias}.id
    ORDER BY (thumb_url IS NULL),
             CASE WHEN thumb_url IS NOT NULL THEN face_score END DESC NULLS LAST,
             created_at ASC, id ASC
    LIMIT 1
  ) cover ON true
`;
}

const COVER_COLUMNS = 'cover.url AS cover_photo_url, cover.thumb_url AS cover_thumb_url';

module.exports = { coverPhotoJoin, COVER_COLUMNS };
