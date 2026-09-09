const express = require('express');
const { requireAuth, identifyUser } = require('../middleware/auth.middleware');
const { guardDemoAnimal } = require('../middleware/demo.middleware');
const { limits } = require('../middleware/rateLimit.middleware');
const { upload, pendingUpload } = require('../config/upload');
const {
  MAX_MATCH_PHOTOS,
  listAnimals,
  matchAnimals,
  getAnimal,
  createAnimal,
  reportSighting,
  addPhoto,
  addHealthRecord,
  addVaccination,
  markRecovered,
  reopenRecord,
  listComments,
  addComment,
  followAnimal,
  unfollowAnimal,
  likePhoto,
  unlikePhoto,
  submitCarePhotos,
  CARE_PHOTO_COUNT,
} = require('../controllers/animal.controller');

const router = express.Router();

// Open to signed-out visitors; identifyUser names a signed-in one so their
// demo preference is honoured (it never refuses a request).
router.get('/', identifyUser, listAnimals);
// The literal '/match' path must precede '/:id', or "match" parses as an id.
// GET is the field-only form; POST carries the new animal's photos — each
// screened for the species, the first compared with the candidates — and
// is limited on its own: each call is up to seven vision requests. GET
// shares the bucket: it is one form's worth of calls either way, and a
// loop over it must not be free (review finding).
router.get('/match', requireAuth, limits.matchAnimals, matchAnimals);
router.post(
  '/match',
  requireAuth,
  limits.matchAnimals,
  // `photos` is the add-animal form's whole set (screened, tokenised);
  // `photo` is the older single-file shape, still accepted. Stored as
  // pending files: no row owns them until a token is redeemed, and the
  // sweeper removes the ones nobody redeems.
  pendingUpload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'photos', maxCount: MAX_MATCH_PHOTOS },
  ]),
  matchAnimals
);
router.get('/:id', requireAuth, guardDemoAnimal, getAnimal);
router.post('/', requireAuth, limits.createAnimal, createAnimal);
router.post('/:id/sightings', requireAuth, limits.animalTouch, guardDemoAnimal, reportSighting);
router.post('/:id/photos', requireAuth, limits.animalTouch, guardDemoAnimal, upload.single('photo'), addPhoto);
router.post('/:id/health-records', requireAuth, limits.healthRecords, guardDemoAnimal, addHealthRecord);
router.post(
  '/:id/health-records/:recordId/recover',
  requireAuth,
  limits.healthRecords,
  guardDemoAnimal,
  markRecovered
);
router.post(
  '/:id/health-records/:recordId/reopen',
  requireAuth,
  limits.healthRecords,
  guardDemoAnimal,
  reopenRecord
);
router.post('/:id/vaccinations', requireAuth, limits.healthRecords, guardDemoAnimal, addVaccination);
router.get('/:id/comments', requireAuth, guardDemoAnimal, listComments);
router.post('/:id/comments', requireAuth, limits.comments, guardDemoAnimal, addComment);
// "Takip et" toggles a follower row; "bakım ver" is the care-photo step:
// two fresh photos, screened and compared with this animal's gallery, then
// carer rights. Pending files like the match step's — the miss path
// deletes them, the match path renames them into the gallery.
router.post('/:id/follow', requireAuth, limits.follows, guardDemoAnimal, followAnimal);
router.delete('/:id/follow', requireAuth, limits.follows, guardDemoAnimal, unfollowAnimal);
router.post('/:id/photos/:photoId/like', requireAuth, limits.photoLikes, guardDemoAnimal, likePhoto);
router.delete('/:id/photos/:photoId/like', requireAuth, limits.photoLikes, guardDemoAnimal, unlikePhoto);
router.post(
  '/:id/care-photos',
  requireAuth,
  limits.matchAnimals,
  guardDemoAnimal,
  pendingUpload.fields([{ name: 'photos', maxCount: CARE_PHOTO_COUNT }]),
  submitCarePhotos
);

module.exports = router;
