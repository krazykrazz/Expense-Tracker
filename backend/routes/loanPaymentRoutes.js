/**
 * Loan Payment Routes
 * 
 * Defines API routes for loan payment tracking operations.
 * All routes are nested under /api/loans/:loanId
 * 
 * Routes:
 * - POST   /api/loans/:loanId/loan-payments          - Create a payment entry
 * - POST   /api/loans/:loanId/loan-payments/auto-log - Auto-log payment from fixed expense
 * - GET    /api/loans/:loanId/loan-payments          - Get all payments for a loan
 * - GET    /api/loans/:loanId/loan-payments/:id      - Get a specific payment
 * - PUT    /api/loans/:loanId/loan-payments/:id      - Update a payment entry
 * - DELETE /api/loans/:loanId/loan-payments/:id      - Delete a payment entry
 * - GET    /api/loans/:loanId/calculated-balance     - Get calculated balance
 * - GET    /api/loans/:loanId/balance-history        - Get balance history with running totals
 * - GET    /api/loans/:loanId/payment-suggestion     - Get suggested payment amount
 * - GET    /api/loans/:loanId/migrate-balances/preview - Preview migration
 * - POST   /api/loans/:loanId/migrate-balances       - Migrate balance entries to payments
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 3.1, 4.1, 4.4
 */

const express = require('express');
const router = express.Router();
const loanPaymentController = require('../controllers/loanPaymentController');

// Payment CRUD routes
// POST /api/loans/:loanId/loan-payments - Create a payment entry
router.post('/:loanId/loan-payments', loanPaymentController.createPayment);

// POST /api/loans/:loanId/loan-payments/auto-log - Auto-log payment from fixed expense
// _Requirements: 4.4_
router.post('/:loanId/loan-payments/auto-log', loanPaymentController.autoLogPayment);

// GET /api/loans/:loanId/loan-payments - Get all payments for a loan
router.get('/:loanId/loan-payments', loanPaymentController.getPayments);

// GET /api/loans/:loanId/loan-payments/:paymentId - Get a specific payment
router.get('/:loanId/loan-payments/:paymentId', loanPaymentController.getPaymentById);

// PUT /api/loans/:loanId/loan-payments/:paymentId - Update a payment entry
router.put('/:loanId/loan-payments/:paymentId', loanPaymentController.updatePayment);

// DELETE /api/loans/:loanId/loan-payments/:paymentId - Delete a payment entry
router.delete('/:loanId/loan-payments/:paymentId', loanPaymentController.deletePayment);

// Balance calculation routes
// GET /api/loans/:loanId/calculated-balance - Get calculated balance
router.get('/:loanId/calculated-balance', loanPaymentController.getCalculatedBalance);

// GET /api/loans/:loanId/balance-history - Get balance history with running totals
router.get('/:loanId/payment-balance-history', loanPaymentController.getBalanceHistory);

// Payment suggestion route
// GET /api/loans/:loanId/payment-suggestion - Get suggested payment amount
router.get('/:loanId/payment-suggestion', loanPaymentController.getPaymentSuggestion);

// Migration routes
// GET /api/loans/:loanId/migrate-balances/preview - Preview migration
router.get('/:loanId/migrate-balances/preview', loanPaymentController.previewMigration);

// POST /api/loans/:loanId/migrate-balances - Migrate balance entries to payments
router.post('/:loanId/migrate-balances', loanPaymentController.migrateBalances);

module.exports = router;
