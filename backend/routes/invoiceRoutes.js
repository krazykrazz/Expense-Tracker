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

// POST /api/invoices/upload - Upload invoice for an expense
router.post('/upload', 
  validateUploadRequest, 
  trackUploadProgress,
  protectConcurrentUploads,
  upload.single('invoice'), 
  handleMulterError, 
  invoiceController.uploadInvoice
);

// GET /api/invoices/:expenseId - Get invoice file for an expense
router.get('/:expenseId', setDownloadHeaders, invoiceController.getInvoice);

// DELETE /api/invoices/:expenseId - Delete invoice for an expense
router.delete('/:expenseId', invoiceController.deleteInvoice);

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

module.exports = router;