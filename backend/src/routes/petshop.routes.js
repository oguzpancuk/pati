const express = require('express');
const { listPetshops } = require('../controllers/petshop.controller');

const router = express.Router();

// Read-only and open to signed-out visitors, like the care markers.
// Listings are written only through /api/admin/petshops.
router.get('/', listPetshops);

module.exports = router;
