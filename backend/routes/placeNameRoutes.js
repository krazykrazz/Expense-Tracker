const express = require('express');
const router = express.Router();
const placeNameController = require('../controllers/placeNameController');

// GET /api/expenses/place-names/analyze - Analyze place names and return similarity groups
router.get('/analyze', placeNameController.analyzePlaceNames);

// POST /api/expenses/place-names/standardize - Apply standardization changes
router.post('/standardize', placeNameController.standardizePlaceNames);

module.exports = router;
