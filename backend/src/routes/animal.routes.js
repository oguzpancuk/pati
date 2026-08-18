const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const { upload } = require('../config/upload');
const {
  listAnimals,
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
router.get('/:id', requireAuth, getAnimal);
router.post('/', requireAuth, createAnimal);
router.post('/:id/sightings', requireAuth, reportSighting);
router.post('/:id/photos', requireAuth, upload.single('photo'), addPhoto);
router.post('/:id/health-records', requireAuth, addHealthRecord);
router.post('/:id/health-records/:recordId/recover', requireAuth, markRecovered);
router.post('/:id/vaccinations', requireAuth, addVaccination);
router.get('/:id/comments', requireAuth, listComments);
router.post('/:id/comments', requireAuth, addComment);
router.post('/:id/follow', requireAuth, followAnimal);

module.exports = router;
