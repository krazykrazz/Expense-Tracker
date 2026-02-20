const express = require('express');
const router = express.Router();
const billingCycleController = require('../controllers/billingCycleController');
const { upload, handleMulterError, validateUploadRequest } = require('../middleware/uploadMiddleware');

/**
 * Billing Cycle History Routes
 * 
 * These routes are nested under /api/payment-methods/:id/billing-cycles
 * They provide CRUD operations for credit card billing cycle history records.
 * 
 * _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
 */

// GET /api/payment-methods/:id/billing-cycles/unified - Get unified billing cycles with auto-generation
// Must be before /:cycleId routes to avoid conflict
router.get('/:id/billing-cycles/unified', billingCycleController.getUnifiedBillingCycles);

// GET /api/payment-methods/:id/billing-cycles/current - Get current billing cycle status
// Must be before /:cycleId routes to avoid conflict
router.get('/:id/billing-cycles/current', billingCycleController.getCurrentCycleStatus);

// GET /api/payment-methods/:id/billing-cycles/history - Get billing cycle history
// Must be before /:cycleId routes to avoid conflict
router.get('/:id/billing-cycles/history', billingCycleController.getBillingCycleHistory);

// POST /api/payment-methods/:id/billing-cycles - Create a billing cycle record (with optional PDF)
router.post(
  '/:id/billing-cycles',
  validateUploadRequest,
  upload.single('statement'),
  handleMulterError,
  billingCycleController.createBillingCycle
);

// GET /api/payment-methods/:id/billing-cycles/:cycleId/pdf - Get billing cycle PDF
router.get('/:id/billing-cycles/:cycleId/pdf', billingCycleController.getBillingCyclePdf);

// PUT /api/payment-methods/:id/billing-cycles/:cycleId - Update a billing cycle record (with optional PDF)
// Note: validateUploadRequest is intentionally omitted here because PDF is optional on updates.
// When no file is uploaded, the request is sent as JSON, which validateUploadRequest would reject.
router.put(
  '/:id/billing-cycles/:cycleId',
  upload.single('statement'),
  handleMulterError,
  billingCycleController.updateBillingCycle
);

// DELETE /api/payment-methods/:id/billing-cycles/:cycleId - Delete a billing cycle record
router.delete('/:id/billing-cycles/:cycleId', billingCycleController.deleteBillingCycle);

module.exports = router;
