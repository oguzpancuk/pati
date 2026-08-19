const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { limits } = require('../middleware/rateLimit.middleware');
const { upload } = require('../config/upload');
const {
  listAnimals,
  matchAnimals,
  getAnimal,
  createAnimal,
  reportSighting,
  addPhoto,
  addHealthRecord,
  addVaccination,
  markRecovered,
  listComments,
  addComment,
  followAnimal,
} = require('../controllers/animal.controller');

const router = express.Router();

router.get('/', listAnimals);
// The literal '/match' path must precede '/:id', or "match" parses as an id.
router.get('/match', requireAuth, matchAnimals);
router.get('/:id', requireAuth, getAnimal);
router.post('/', requireAuth, limits.createAnimal, createAnimal);
router.post('/:id/sightings', requireAuth, limits.animalTouch, reportSighting);
router.post('/:id/photos', requireAuth, limits.animalTouch, upload.single('photo'), addPhoto);
router.post('/:id/health-records', requireAuth, limits.healthRecords, addHealthRecord);
router.post('/:id/health-records/:recordId/recover', requireAuth, limits.healthRecords, markRecovered);
router.post('/:id/vaccinations', requireAuth, limits.healthRecords, addVaccination);
router.get('/:id/comments', requireAuth, listComments);
router.post('/:id/comments', requireAuth, limits.comments, addComment);
router.post('/:id/follow', requireAuth, limits.animalTouch, followAnimal);

module.exports = router;
