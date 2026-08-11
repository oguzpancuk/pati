const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const {
  listAnimals,
  getAnimal,
  createAnimal,
  addPhoto,
  addHealthRecord,
  followAnimal,
} = require('../controllers/animal.controller');

const router = express.Router();

router.get('/', listAnimals);
router.get('/:id', getAnimal);
router.post('/', requireAuth, createAnimal);
router.post('/:id/photos', requireAuth, addPhoto);
router.post('/:id/health-records', requireAuth, addHealthRecord);
router.post('/:id/follow', requireAuth, followAnimal);

module.exports = router;
