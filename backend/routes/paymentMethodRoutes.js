const express = require('express');
const router = express.Router();
const paymentMethodController = require('../controllers/paymentMethodController');
const creditCardPaymentController = require('../controllers/creditCardPaymentController');
const creditCardStatementController = require('../controllers/creditCardStatementController');
const {
  upload,
  handleMulterError,
  validateUploadRequest,
  trackUploadProgress,
  protectConcurrentUploads
} = require('../middleware/uploadMiddleware');

// Response headers middleware for file downloads
const setDownloadHeaders = (req, res, next) => {
  // Security headers for file downloads
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "default-src 'none'; object-src 'none';");
  res.setHeader('X-Download-Options', 'noopen');
  
  next();
};

// ==========================================
// Payment Method Routes
// ==========================================

// GET /api/payment-methods/display-names - Get all display names (for validation)
// Must be before /:id route to avoid conflict
router.get('/display-names', paymentMethodController.getDisplayNames);

// GET /api/payment-methods/active - Get active payment methods for dropdown population
// Must be before /:id route to avoid conflict
router.get('/active', paymentMethodController.getActive);

// GET /api/payment-methods - Get all payment methods
router.get('/', paymentMethodController.getAll);

// POST /api/payment-methods - Create a new payment method
router.post('/', paymentMethodController.create);

// GET /api/payment-methods/:id - Get a specific payment method by ID
router.get('/:id', paymentMethodController.getById);

// PUT /api/payment-methods/:id - Update a payment method
router.put('/:id', paymentMethodController.update);

// DELETE /api/payment-methods/:id - Delete a payment method
router.delete('/:id', paymentMethodController.deletePaymentMethod);

// PATCH /api/payment-methods/:id/active - Set payment method active/inactive status
router.patch('/:id/active', paymentMethodController.setActive);

// POST /api/payment-methods/:id/recalculate-balance - Recalculate credit card balance
router.post('/:id/recalculate-balance', paymentMethodController.recalculateBalance);

// GET /api/payment-methods/:id/billing-cycles - Get billing cycle history
router.get('/:id/billing-cycles', paymentMethodController.getBillingCycles);

// GET /api/payment-methods/:id/statement-balance - Get calculated statement balance
router.get('/:id/statement-balance', paymentMethodController.getStatementBalance);

// ==========================================
// Credit Card Payment Routes
// ==========================================

// GET /api/payment-methods/:id/payments/total - Get total payments in date range
// Must be before /:id/payments to avoid conflict
router.get('/:id/payments/total', creditCardPaymentController.getTotalPayments);

// POST /api/payment-methods/:id/payments - Record a credit card payment
router.post('/:id/payments', creditCardPaymentController.recordPayment);

// GET /api/payment-methods/:id/payments - Get payment history for a credit card
router.get('/:id/payments', creditCardPaymentController.getPayments);

// DELETE /api/payment-methods/:id/payments/:paymentId - Delete a payment record
router.delete('/:id/payments/:paymentId', creditCardPaymentController.deletePayment);

// ==========================================
// Credit Card Statement Routes
// ==========================================

// POST /api/payment-methods/:id/statements - Upload a credit card statement
router.post('/:id/statements',
  validateUploadRequest,
  trackUploadProgress,
  protectConcurrentUploads,
  upload.single('statement'),
  handleMulterError,
  creditCardStatementController.uploadStatement
);

// GET /api/payment-methods/:id/statements - Get all statements for a credit card
router.get('/:id/statements', creditCardStatementController.getStatements);

// GET /api/payment-methods/:id/statements/:statementId - Download a statement file
router.get('/:id/statements/:statementId', setDownloadHeaders, creditCardStatementController.downloadStatement);

// DELETE /api/payment-methods/:id/statements/:statementId - Delete a statement
router.delete('/:id/statements/:statementId', creditCardStatementController.deleteStatement);

module.exports = router;
