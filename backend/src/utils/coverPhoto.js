/**
 * The one definition of "an animal's picture" (ROADMAP P3): the photo whose
 * face cut-out scored best, the oldest photo when none has one. Every list
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
    ORDER BY face_score DESC NULLS LAST, created_at ASC
    LIMIT 1
  ) cover ON true
`;
}

const COVER_COLUMNS = 'cover.url AS cover_photo_url, cover.thumb_url AS cover_thumb_url';

module.exports = { coverPhotoJoin, COVER_COLUMNS };
