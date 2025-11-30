const express = require('express');
const router = express.Router();
const investmentValueController = require('../controllers/investmentValueController');

// GET /api/investment-values/:investmentId - Get all value entries for an investment
router.get('/:investmentId', investmentValueController.getValueHistory);

// GET /api/investment-values/:investmentId/:year/:month - Get specific value entry
router.get('/:investmentId/:year/:month', investmentValueController.getValueForMonth);

// POST /api/investment-values - Create or update a value entry
router.post('/', investmentValueController.createOrUpdateValue);

// PUT /api/investment-values/:id - Update a value entry by ID
router.put('/:id', investmentValueController.updateValue);

// DELETE /api/investment-values/:id - Delete a value entry by ID
router.delete('/:id', investmentValueController.deleteValue);

module.exports = router;
