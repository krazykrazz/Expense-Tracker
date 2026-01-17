const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const logger = require('../config/logger');
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

// POST /api/invoices/upload - Upload invoice for an expense (with optional personId)
router.post('/upload', 
  validateUploadRequest, 
  trackUploadProgress,
  protectConcurrentUploads,
  upload.single('invoice'), 
  handleMulterError, 
  invoiceController.uploadInvoice
);

// DELETE /api/invoices/expense/:expenseId - Delete all invoices for an expense (backward compatible)
router.delete('/expense/:expenseId', invoiceController.deleteInvoice);

// GET /api/invoices/:expenseId/file - Get first invoice file for an expense (backward compatible)
router.get('/:expenseId/file', setDownloadHeaders, invoiceController.getInvoice);

// GET /api/invoices/:expenseId/metadata - Get invoice metadata for an expense
router.get('/:expenseId/metadata', invoiceController.getInvoiceMetadata);

// PUT /api/invoices/:expenseId - Replace existing invoice with a new one
router.put('/:expenseId', 
  validateUploadRequest, 
  trackUploadProgress,
  protectConcurrentUploads,
  upload.single('invoice'), 
  handleMulterError, 
  invoiceController.replaceInvoice
);

// GET /api/invoices/:expenseId/:invoiceId - Get specific invoice file by ID
router.get('/:expenseId/:invoiceId', setDownloadHeaders, invoiceController.getInvoiceFile);

// GET /api/invoices/:expenseId - Get all invoices for an expense (returns array)
router.get('/:expenseId', invoiceController.getInvoicesForExpense);

// DELETE /api/invoices/:invoiceId - Delete specific invoice by ID
router.delete('/:invoiceId', invoiceController.deleteInvoiceById);

// PATCH /api/invoices/:invoiceId - Update person association for an invoice
router.patch('/:invoiceId', invoiceController.updateInvoicePersonLink);

module.exports = router;