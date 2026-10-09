const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth.middleware');
const { upload } = require('../config/upload');
const { resizeUploads } = require('../middleware/imageResize.middleware');
const {
  getStats,
  listUsers,
  updateUser,
  deleteUser,
  listAnimals,
  updateAnimal,
  deleteAnimal,
  mergeAnimals,
  listCareActions,
  deleteCareAction,
  listVaccinations,
  deleteVaccination,
  listComments,
  deleteComment,
  listAdvertisers,
  createAdvertiser,
  updateAdvertiser,
  uploadAdvertiserImage,
  deleteAdvertiser,
  listReports,
  resolveReport,
  listAuditLog,
} = require('../controllers/admin.controller');
const {
  adminListPetshops,
  createPetshop,
  updatePetshop,
  deletePetshop,
} = require('../controllers/petshop.controller');

const router = express.Router();

// Every admin endpoint passes authentication first, then the role check.
router.use(requireAuth, requireAdmin);

router.get('/stats', getStats);

router.get('/users', listUsers);
router.patch('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

router.get('/animals', listAnimals);
router.patch('/animals/:id', updateAnimal);
router.delete('/animals/:id', deleteAnimal);
router.post('/animals/:id/merge', mergeAnimals);

router.get('/care-actions', listCareActions);
router.delete('/care-actions/:id', deleteCareAction);

router.get('/vaccinations', listVaccinations);
router.delete('/vaccinations/:id', deleteVaccination);

router.get('/comments', listComments);
router.delete('/comments/:id', deleteComment);

router.get('/advertisers', listAdvertisers);
router.post('/advertisers', createAdvertiser);
router.patch('/advertisers/:id', updateAdvertiser);
router.post('/advertisers/:id/image', upload.single('image'), resizeUploads(), uploadAdvertiserImage);
router.delete('/advertisers/:id', deleteAdvertiser);

router.get('/petshops', adminListPetshops);
router.post('/petshops', createPetshop);
router.patch('/petshops/:id', updatePetshop);
router.delete('/petshops/:id', deletePetshop);

router.get('/reports', listReports);
router.patch('/reports/:id', resolveReport);

router.get('/audit-log', listAuditLog);

module.exports = router;
