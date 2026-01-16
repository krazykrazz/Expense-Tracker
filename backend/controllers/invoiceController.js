const invoiceService = require('../services/invoiceService');
const logger = require('../config/logger');
const path = require('path');
const fs = require('fs');

/**
 * Upload invoice for an expense
 * POST /api/invoices/upload
 */
async function uploadInvoice(req, res) {
  try {
    const { expenseId } = req.body;
    const file = req.file;

    // Validate required fields
    if (!expenseId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Expense ID is required' 
      });
    }

    if (!file) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invoice file is required' 
      });
    }

    // Convert expenseId to number
    const expenseIdNum = parseInt(expenseId);
    if (isNaN(expenseIdNum)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid expense ID' 
      });
    }

    // Upload invoice using service
    const invoice = await invoiceService.uploadInvoice(expenseIdNum, file);

    logger.info('Invoice uploaded via API:', { 
      expenseId: expenseIdNum, 
      invoiceId: invoice.id,
      filename: invoice.originalFilename 
    });

    res.status(200).json({
      success: true,
      invoice: {
        id: invoice.id,
        expenseId: invoice.expenseId,
        filename: invoice.filename,
        originalFilename: invoice.originalFilename,
        fileSize: invoice.fileSize,
        uploadDate: invoice.uploadDate
      }
    });

  } catch (error) {
    logger.error('Invoice upload API error:', error);

    // Handle specific error types with appropriate status codes
    if (error.message.includes('not found')) {
      return res.status(404).json({ 
        success: false, 
        error: error.message 
      });
    }

    if (error.message.includes('already has an invoice') || 
        error.message.includes('only be attached to medical expenses')) {
      return res.status(409).json({ 
        success: false, 
        error: error.message 
      });
    }

    if (error.message.includes('validation failed') || 
        error.message.includes('Invalid') ||
        error.message.includes('too large')) {
      return res.status(400).json({ 
        success: false, 
        error: error.message 
      });
    }

    if (error.message.includes('storage') || 
        error.message.includes('space')) {
      return res.status(507).json({ 
        success: false, 
        error: error.message 
      });
    }

    // Generic server error
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error during invoice upload' 
    });
  }
}

/**
 * Get invoice file for an expense
 * GET /api/invoices/:expenseId
 */
async function getInvoice(req, res) {
  try {
    const expenseId = parseInt(req.params.expenseId);

    if (isNaN(expenseId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid expense ID' 
      });
    }

    // Get invoice from service
    const invoiceData = await invoiceService.getInvoice(expenseId);

    // Verify file exists
    if (!fs.existsSync(invoiceData.fullFilePath)) {
      logger.error('Invoice file not found on disk:', { 
        expenseId, 
        filePath: invoiceData.fullFilePath 
      });
      return res.status(404).json({ 
        success: false, 
        error: 'Invoice file not found' 
      });
    }

    // Set appropriate headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${invoiceData.originalFilename}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600'); // Cache for 1 hour
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Stream the file
    const fileStream = fs.createReadStream(invoiceData.fullFilePath);
    
    fileStream.on('error', (error) => {
      logger.error('Error streaming invoice file:', { expenseId, error });
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          error: 'Error reading invoice file' 
        });
      }
    });

    fileStream.pipe(res);

    logger.debug('Invoice file served:', { 
      expenseId, 
      filename: invoiceData.originalFilename 
    });

  } catch (error) {
    logger.error('Get invoice API error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ 
        success: false, 
        error: error.message 
      });
    }

    if (error.message.includes('permission')) {
      return res.status(403).json({ 
        success: false, 
        error: 'You do not have permission to access this invoice' 
      });
    }

    res.status(500).json({ 
      success: false, 
      error: 'Internal server error while retrieving invoice' 
    });
  }
}

/**
 * Delete invoice for an expense
 * DELETE /api/invoices/:expenseId
 */
async function deleteInvoice(req, res) {
  try {
    const expenseId = parseInt(req.params.expenseId);

    if (isNaN(expenseId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid expense ID' 
      });
    }

    // Delete invoice using service
    const deleted = await invoiceService.deleteInvoice(expenseId);

    if (!deleted) {
      return res.status(404).json({ 
        success: false, 
        error: 'No invoice found for this expense' 
      });
    }

    logger.info('Invoice deleted via API:', { expenseId });

    res.status(200).json({
      success: true,
      message: 'Invoice deleted successfully'
    });

  } catch (error) {
    logger.error('Delete invoice API error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({ 
        success: false, 
        error: error.message 
      });
    }

    if (error.message.includes('permission')) {
      return res.status(403).json({ 
        success: false, 
        error: 'You do not have permission to delete this invoice' 
      });
    }

    res.status(500).json({ 
      success: false, 
      error: 'Internal server error while deleting invoice' 
    });
  }
}

/**
 * Get invoice metadata for an expense
 * GET /api/invoices/:expenseId/metadata
 */
async function getInvoiceMetadata(req, res) {
  try {
    const expenseId = parseInt(req.params.expenseId);

    if (isNaN(expenseId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid expense ID' 
      });
    }

    // Get invoice metadata from service
    const invoice = await invoiceService.getInvoiceMetadata(expenseId);

    if (!invoice) {
      return res.status(404).json({ 
        success: false, 
        error: 'No invoice found for this expense' 
      });
    }

    logger.debug('Invoice metadata retrieved via API:', { 
      expenseId, 
      invoiceId: invoice.id 
    });

    res.status(200).json({
      success: true,
      invoice: {
        id: invoice.id,
        expenseId: invoice.expenseId,
        filename: invoice.filename,
        originalFilename: invoice.originalFilename,
        fileSize: invoice.fileSize,
        mimeType: invoice.mimeType,
        uploadDate: invoice.uploadDate
      }
    });

  } catch (error) {
    logger.error('Get invoice metadata API error:', error);

    // Check for specific error types
    if (error.message === 'Expense not found') {
      return res.status(404).json({ 
        success: false, 
        error: 'Expense not found' 
      });
    }

    res.status(500).json({ 
      success: false, 
      error: 'Internal server error while retrieving invoice metadata' 
    });
  }
}

/**
 * Replace existing invoice with a new one
 * PUT /api/invoices/:expenseId
 */
async function replaceInvoice(req, res) {
  try {
    const expenseId = parseInt(req.params.expenseId);
    const file = req.file;

    if (isNaN(expenseId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid expense ID' 
      });
    }

    if (!file) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invoice file is required' 
      });
    }

    // Replace invoice using service
    const invoice = await invoiceService.replaceInvoice(expenseId, file);

    logger.info('Invoice replaced via API:', { 
      expenseId, 
      newInvoiceId: invoice.id,
      filename: invoice.originalFilename 
    });

    res.status(200).json({
      success: true,
      invoice: {
        id: invoice.id,
        expenseId: invoice.expenseId,
        filename: invoice.filename,
        originalFilename: invoice.originalFilename,
        fileSize: invoice.fileSize,
        uploadDate: invoice.uploadDate
      }
    });

  } catch (error) {
    logger.error('Replace invoice API error:', error);

    // Handle specific error types with appropriate status codes
    if (error.message.includes('not found')) {
      return res.status(404).json({ 
        success: false, 
        error: error.message 
      });
    }

    if (error.message.includes('only be attached to medical expenses')) {
      return res.status(409).json({ 
        success: false, 
        error: error.message 
      });
    }

    if (error.message.includes('validation failed') || 
        error.message.includes('Invalid') ||
        error.message.includes('too large')) {
      return res.status(400).json({ 
        success: false, 
        error: error.message 
      });
    }

    if (error.message.includes('storage') || 
        error.message.includes('space')) {
      return res.status(507).json({ 
        success: false, 
        error: error.message 
      });
    }

    res.status(500).json({ 
      success: false, 
      error: 'Internal server error during invoice replacement' 
    });
  }
}

module.exports = {
  uploadInvoice,
  getInvoice,
  deleteInvoice,
  getInvoiceMetadata,
  replaceInvoice
};