const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth.middleware');
const { upload } = require('../config/upload');
const {
  getStats,
  listUsers,
  updateUser,
  listAnimals,
  updateAnimal,
  deleteAnimal,
  mergeAnimals,
  listCareActions,
  deleteCareAction,
  listComments,
  deleteComment,
  listAdvertisers,
  createAdvertiser,
  updateAdvertiser,
  uploadAdvertiserImage,
  deleteAdvertiser,
  listAuditLog,
} = require('../controllers/admin.controller');

const router = express.Router();

// Tüm admin uç noktaları önce kimlik, sonra rol kontrolünden geçiyor.
router.use(requireAuth, requireAdmin);

router.get('/stats', getStats);

router.get('/users', listUsers);
router.patch('/users/:id', updateUser);

router.get('/animals', listAnimals);
router.patch('/animals/:id', updateAnimal);
router.delete('/animals/:id', deleteAnimal);
router.post('/animals/:id/merge', mergeAnimals);

router.get('/care-actions', listCareActions);
router.delete('/care-actions/:id', deleteCareAction);

router.get('/comments', listComments);
router.delete('/comments/:id', deleteComment);

router.get('/advertisers', listAdvertisers);
router.post('/advertisers', createAdvertiser);
router.patch('/advertisers/:id', updateAdvertiser);
router.post('/advertisers/:id/image', upload.single('image'), uploadAdvertiserImage);
router.delete('/advertisers/:id', deleteAdvertiser);

router.get('/audit-log', listAuditLog);

module.exports = router;
