const creditCardStatementService = require('../services/creditCardStatementService');
const paymentMethodService = require('../services/paymentMethodService');
const logger = require('../config/logger');
const fs = require('fs');

/**
 * Upload a credit card statement
 * POST /api/payment-methods/:id/statements
 * Body: FormData with statement file, statementDate, statementPeriodStart, statementPeriodEnd
 */
async function uploadStatement(req, res) {
  try {
    const paymentMethodId = parseInt(req.params.id);
    // Support both snake_case (from frontend FormData) and camelCase field names
    const statementDate = req.body.statement_date || req.body.statementDate;
    const statementPeriodStart = req.body.statement_period_start || req.body.statementPeriodStart;
    const statementPeriodEnd = req.body.statement_period_end || req.body.statementPeriodEnd;
    const file = req.file;

    if (isNaN(paymentMethodId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'Statement file is required'
      });
    }

    if (!statementDate) {
      return res.status(400).json({
        success: false,
        error: 'Statement date is required'
      });
    }

    if (!statementPeriodStart || !statementPeriodEnd) {
      return res.status(400).json({
        success: false,
        error: 'Statement period start and end dates are required'
      });
    }

    // Verify payment method exists and is a credit card
    const paymentMethod = await paymentMethodService.getPaymentMethodById(paymentMethodId);
    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        error: 'Payment method not found'
      });
    }

    if (paymentMethod.type !== 'credit_card') {
      return res.status(400).json({
        success: false,
        error: 'Statements can only be uploaded for credit card payment methods'
      });
    }

    const statement = await creditCardStatementService.uploadStatement(
      paymentMethodId,
      file,
      statementDate,
      statementPeriodStart,
      statementPeriodEnd
    );

    logger.debug('Credit card statement uploaded via API:', {
      statementId: statement.id,
      paymentMethodId,
      filename: statement.original_filename
    });

    res.status(201).json({
      success: true,
      statement: {
        id: statement.id,
        paymentMethodId: statement.payment_method_id,
        statementDate: statement.statement_date,
        statementPeriodStart: statement.statement_period_start,
        statementPeriodEnd: statement.statement_period_end,
        filename: statement.filename,
        originalFilename: statement.original_filename,
        fileSize: statement.file_size,
        createdAt: statement.created_at
      }
    });

  } catch (error) {
    logger.error('Upload credit card statement API error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    if (error.message.includes('required') ||
        error.message.includes('format') ||
        error.message.includes('validation failed') ||
        error.message.includes('Invalid') ||
        error.message.includes('only be uploaded for credit card')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    if (error.message.includes('storage') || error.message.includes('space')) {
      return res.status(507).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error during statement upload'
    });
  }
}

/**
 * Get all statements for a credit card
 * GET /api/payment-methods/:id/statements
 */
async function getStatements(req, res) {
  try {
    const paymentMethodId = parseInt(req.params.id);

    if (isNaN(paymentMethodId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }

    // Verify payment method exists and is a credit card
    const paymentMethod = await paymentMethodService.getPaymentMethodById(paymentMethodId);
    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        error: 'Payment method not found'
      });
    }

    if (paymentMethod.type !== 'credit_card') {
      return res.status(400).json({
        success: false,
        error: 'Statements are only available for credit card payment methods'
      });
    }

    const statements = await creditCardStatementService.getStatements(paymentMethodId);

    res.status(200).json({
      success: true,
      statements: statements.map(s => ({
        id: s.id,
        paymentMethodId: s.paymentMethodId,
        statementDate: s.statementDate,
        statementPeriodStart: s.statementPeriodStart,
        statementPeriodEnd: s.statementPeriodEnd,
        filename: s.filename,
        originalFilename: s.originalFilename,
        fileSize: s.fileSize,
        createdAt: s.createdAt
      })),
      count: statements.length
    });

  } catch (error) {
    logger.error('Get credit card statements API error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error while retrieving statements'
    });
  }
}

/**
 * Download a credit card statement file
 * GET /api/payment-methods/:id/statements/:statementId
 */
async function downloadStatement(req, res) {
  try {
    const paymentMethodId = parseInt(req.params.id);
    const statementId = parseInt(req.params.statementId);

    if (isNaN(paymentMethodId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }

    if (isNaN(statementId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid statement ID'
      });
    }

    // Verify payment method exists and is a credit card
    const paymentMethod = await paymentMethodService.getPaymentMethodById(paymentMethodId);
    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        error: 'Payment method not found'
      });
    }

    if (paymentMethod.type !== 'credit_card') {
      return res.status(400).json({
        success: false,
        error: 'Statements are only available for credit card payment methods'
      });
    }

    // Get statement with file path
    const statementData = await creditCardStatementService.downloadStatement(statementId);

    // Verify statement belongs to this payment method
    if (statementData.paymentMethodId !== paymentMethodId) {
      return res.status(404).json({
        success: false,
        error: 'Statement not found for this payment method'
      });
    }

    // Verify file exists
    if (!fs.existsSync(statementData.fullFilePath)) {
      logger.error('Statement file not found on disk:', {
        statementId,
        paymentMethodId,
        filePath: statementData.fullFilePath
      });
      return res.status(404).json({
        success: false,
        error: 'Statement file not found'
      });
    }

    // Set appropriate headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${statementData.originalFilename}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Stream the file
    const fileStream = fs.createReadStream(statementData.fullFilePath);

    fileStream.on('error', (error) => {
      logger.error('Error streaming statement file:', { statementId, paymentMethodId, error });
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Error reading statement file'
        });
      }
    });

    fileStream.pipe(res);

  } catch (error) {
    logger.error('Download credit card statement API error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    if (error.message.includes('permission')) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to access this statement'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error while retrieving statement'
    });
  }
}

/**
 * Delete a credit card statement
 * DELETE /api/payment-methods/:id/statements/:statementId
 */
async function deleteStatement(req, res) {
  try {
    const paymentMethodId = parseInt(req.params.id);
    const statementId = parseInt(req.params.statementId);

    if (isNaN(paymentMethodId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }

    if (isNaN(statementId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid statement ID'
      });
    }

    // Verify payment method exists and is a credit card
    const paymentMethod = await paymentMethodService.getPaymentMethodById(paymentMethodId);
    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        error: 'Payment method not found'
      });
    }

    if (paymentMethod.type !== 'credit_card') {
      return res.status(400).json({
        success: false,
        error: 'Statements can only be deleted for credit card payment methods'
      });
    }

    // Verify statement belongs to this payment method
    const statement = await creditCardStatementService.getStatementById(statementId);
    if (!statement) {
      return res.status(404).json({
        success: false,
        error: 'Statement not found'
      });
    }

    if (statement.paymentMethodId !== paymentMethodId) {
      return res.status(404).json({
        success: false,
        error: 'Statement not found for this payment method'
      });
    }

    const deleted = await creditCardStatementService.deleteStatement(statementId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Statement not found'
      });
    }

    logger.debug('Credit card statement deleted via API:', {
      statementId,
      paymentMethodId
    });

    res.status(200).json({
      success: true,
      message: 'Statement deleted successfully'
    });

  } catch (error) {
    logger.error('Delete credit card statement API error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    if (error.message.includes('permission')) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to delete this statement'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error while deleting statement'
    });
  }
}

module.exports = {
  uploadStatement,
  getStatements,
  downloadStatement,
  deleteStatement
};
