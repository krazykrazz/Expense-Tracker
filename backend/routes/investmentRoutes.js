const express = require('express');
const router = express.Router();
const investmentController = require('../controllers/investmentController');

// GET /api/investments - Get all investments with current values
router.get('/', investmentController.getAllInvestments);

// POST /api/investments - Create a new investment
router.post('/', investmentController.createInvestment);

// PUT /api/investments/:id - Update an investment by ID
router.put('/:id', investmentController.updateInvestment);

// DELETE /api/investments/:id - Delete an investment by ID
router.delete('/:id', investmentController.deleteInvestment);

module.exports = router;
