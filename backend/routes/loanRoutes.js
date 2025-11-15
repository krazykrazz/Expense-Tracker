const express = require('express');
const router = express.Router();
const loanController = require('../controllers/loanController');

// GET /api/loans - Get all loans with current balances
router.get('/', loanController.getAllLoans);

// POST /api/loans - Create a new loan
router.post('/', loanController.createLoan);

// PUT /api/loans/:id - Update a loan by ID
router.put('/:id', loanController.updateLoan);

// DELETE /api/loans/:id - Delete a loan by ID
router.delete('/:id', loanController.deleteLoan);

// PUT /api/loans/:id/paid-off - Mark loan as paid off or reactivate
router.put('/:id/paid-off', loanController.markPaidOff);

module.exports = router;
