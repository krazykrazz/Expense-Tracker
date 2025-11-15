const express = require('express');
const router = express.Router();
const loanBalanceController = require('../controllers/loanBalanceController');

// GET /api/loan-balances/:loanId - Get balance history for a loan
router.get('/:loanId', loanBalanceController.getBalanceHistory);

// GET /api/loan-balances/:loanId/:year/:month - Get balance entry for a specific month
router.get('/:loanId/:year/:month', loanBalanceController.getBalanceForMonth);

// POST /api/loan-balances - Create or update a balance entry
router.post('/', loanBalanceController.createOrUpdateBalance);

// PUT /api/loan-balances/:id - Update a balance entry by ID
router.put('/:id', loanBalanceController.updateBalance);

// DELETE /api/loan-balances/:id - Delete a balance entry by ID
router.delete('/:id', loanBalanceController.deleteBalance);

module.exports = router;
