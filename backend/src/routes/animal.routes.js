const express = require('express');
const { requireAuth, identifyUser } = require('../middleware/auth.middleware');
const { limits } = require('../middleware/rateLimit.middleware');
const { upload, pendingUpload } = require('../config/upload');
const { resizeUploads } = require('../middleware/imageResize.middleware');
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
  MAX_CARE_PHOTOS,
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
  resizeUploads(),
  matchAnimals
);
router.get('/:id', requireAuth, getAnimal);
router.post('/', requireAuth, limits.createAnimal, createAnimal);
router.post('/:id/sightings', requireAuth, limits.animalTouch, reportSighting);
router.post('/:id/photos', requireAuth, limits.animalTouch, upload.single('photo'), resizeUploads(), addPhoto);
router.post('/:id/health-records', requireAuth, limits.healthRecords, addHealthRecord);
router.post(
  '/:id/health-records/:recordId/recover',
  requireAuth,
  limits.healthRecords,
  markRecovered
);
router.post(
  '/:id/health-records/:recordId/reopen',
  requireAuth,
  limits.healthRecords,
  reopenRecord
);
router.post('/:id/vaccinations', requireAuth, limits.healthRecords, addVaccination);
router.get('/:id/comments', requireAuth, listComments);
router.post('/:id/comments', requireAuth, limits.comments, addComment);
// "Takip et" toggles a follower row; "bakım ver" is the care-photo step:
// one or two fresh photos (the clients send one), screened and compared
// with this animal's gallery, then carer rights — an existing carer's are
// only screened ("fotoğraf ekle"). Pending files like the match step's —
// the miss path deletes them, the stored path renames them into the gallery.
router.post('/:id/follow', requireAuth, limits.follows, followAnimal);
router.delete('/:id/follow', requireAuth, limits.follows, unfollowAnimal);
router.post('/:id/photos/:photoId/like', requireAuth, limits.photoLikes, likePhoto);
router.delete('/:id/photos/:photoId/like', requireAuth, limits.photoLikes, unlikePhoto);
router.post(
  '/:id/care-photos',
  requireAuth,
  limits.matchAnimals,
  pendingUpload.fields([{ name: 'photos', maxCount: MAX_CARE_PHOTOS }]),
  resizeUploads(),
  submitCarePhotos
);

module.exports = router;
