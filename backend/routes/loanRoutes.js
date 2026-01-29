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

// GET /api/loans/:id/amortization - Get amortization schedule for a mortgage
router.get('/:id/amortization', loanController.getAmortizationSchedule);

// GET /api/loans/:id/equity-history - Get equity history for a mortgage
router.get('/:id/equity-history', loanController.getEquityHistory);

// PUT /api/loans/:id/property-value - Update estimated property value for a mortgage
router.put('/:id/property-value', loanController.updatePropertyValue);

// Mortgage Insights Routes
// GET /api/loans/:id/insights - Get mortgage insights
router.get('/:id/insights', loanController.getMortgageInsights);

// GET /api/loans/:id/payments - Get mortgage payment history
router.get('/:id/payments', loanController.getMortgagePayments);

// POST /api/loans/:id/payments - Create a mortgage payment entry
router.post('/:id/payments', loanController.createMortgagePayment);

// PUT /api/loans/:id/payments/:paymentId - Update a mortgage payment entry
router.put('/:id/payments/:paymentId', loanController.updateMortgagePayment);

// DELETE /api/loans/:id/payments/:paymentId - Delete a mortgage payment entry
router.delete('/:id/payments/:paymentId', loanController.deleteMortgagePayment);

// POST /api/loans/:id/insights/scenario - Calculate what-if scenario
router.post('/:id/insights/scenario', loanController.calculateScenario);

// PUT /api/loans/:id/rate - Update current interest rate (for variable rate mortgages)
router.put('/:id/rate', loanController.updateCurrentRate);

module.exports = router;
