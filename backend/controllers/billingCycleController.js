const billingCycleHistoryService = require('../services/billingCycleHistoryService');
const activityLogService = require('../services/activityLogService');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const billingCycleRepository = require('../repositories/billingCycleRepository');
const logger = require('../config/logger');
const path = require('path');
const fs = require('fs');
const { getStatementsPath } = require('../config/paths');

/**
 * BillingCycleController
 * HTTP request handlers for billing cycle history endpoints
 * 
 * _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
 */

/**
 * Generate a unique filename for statement PDF
 * @param {number} paymentMethodId - Payment method ID
 * @param {string} cycleEndDate - Cycle end date (YYYY-MM-DD)
 * @param {string} originalFilename - Original filename
 * @returns {string} Unique filename
 */
function generateStatementFilename(paymentMethodId, cycleEndDate, originalFilename) {
  const timestamp = Date.now();
  const ext = path.extname(originalFilename).toLowerCase() || '.pdf';
  const sanitizedDate = cycleEndDate.replace(/-/g, '');
  return `billing-cycle-${paymentMethodId}-${sanitizedDate}-${timestamp}${ext}`;
}

/**
 * Ensure statements directory exists
 */
function ensureStatementsDir() {
  const statementsDir = getStatementsPath();
  if (!fs.existsSync(statementsDir)) {
    fs.mkdirSync(statementsDir, { recursive: true });
  }
  return statementsDir;
}

/**
 * Create a billing cycle record
 * POST /api/payment-methods/:id/billing-cycles
 * 
 * Request body (JSON or multipart/form-data):
 * - actual_statement_balance (required): number >= 0
 * - minimum_payment (optional): number >= 0
 * - notes (optional): string
 * - statement (optional): PDF file (when using multipart/form-data)
 * 
 * _Requirements: 8.1_
 */
async function createBillingCycle(req, res) {
  let savedFilePath = null;
  
  try {
    const paymentMethodId = parseInt(req.params.id);
    
    if (isNaN(paymentMethodId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }
    
    // Handle both JSON and multipart/form-data
    let actual_statement_balance, minimum_payment, notes;
    
    if (req.body.actual_statement_balance !== undefined) {
      // Parse values - they may be strings from form-data
      actual_statement_balance = typeof req.body.actual_statement_balance === 'string' 
        ? parseFloat(req.body.actual_statement_balance) 
        : req.body.actual_statement_balance;
      minimum_payment = req.body.minimum_payment !== undefined && req.body.minimum_payment !== ''
        ? (typeof req.body.minimum_payment === 'string' ? parseFloat(req.body.minimum_payment) : req.body.minimum_payment)
        : undefined;
      notes = req.body.notes || undefined;
    } else {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: actual_statement_balance'
      });
    }
    
    // Validate actual_statement_balance is a non-negative number
    if (typeof actual_statement_balance !== 'number' || isNaN(actual_statement_balance) || actual_statement_balance < 0) {
      return res.status(400).json({
        success: false,
        error: 'Actual statement balance must be a non-negative number'
      });
    }
    
    // Validate minimum_payment if provided
    if (minimum_payment !== undefined && minimum_payment !== null) {
      if (typeof minimum_payment !== 'number' || isNaN(minimum_payment) || minimum_payment < 0) {
        return res.status(400).json({
          success: false,
          error: 'Minimum payment must be a non-negative number'
        });
      }
    }
    
    // Handle PDF file upload if present
    let statement_pdf_path = null;
    if (req.file) {
      try {
        const statementsDir = ensureStatementsDir();
        
        // Get cycle end date for filename (we'll get it from the service)
        const cycleStatus = await billingCycleHistoryService.getCurrentCycleStatus(paymentMethodId);
        const cycleEndDate = cycleStatus.cycleEndDate;
        
        const filename = generateStatementFilename(paymentMethodId, cycleEndDate, req.file.originalname);
        const filePath = path.join(statementsDir, filename);
        
        // Write file from memory buffer
        fs.writeFileSync(filePath, req.file.buffer);
        savedFilePath = filePath;
        statement_pdf_path = filename;
        
        logger.info('Saved billing cycle statement PDF:', { filename, paymentMethodId });
      } catch (fileError) {
        logger.error('Failed to save statement PDF:', fileError);
        return res.status(500).json({
          success: false,
          error: 'Failed to save statement PDF'
        });
      }
    }
    
    const billingCycle = await billingCycleHistoryService.createBillingCycle(
      paymentMethodId,
      { actual_statement_balance, minimum_payment, notes, statement_pdf_path }
    );
    
    logger.info('Billing cycle created via API:', {
      id: billingCycle.id,
      paymentMethodId,
      cycleEndDate: billingCycle.cycle_end_date,
      hasPdf: !!statement_pdf_path
    });
    
    // Activity logging (fire-and-forget)
    try {
      const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
      const cardName = paymentMethod ? (paymentMethod.display_name || paymentMethod.full_name) : `Card ${paymentMethodId}`;
      const discrepancyAmount = billingCycle.discrepancy ? billingCycle.discrepancy.amount : 0;
      const userAction = `Credit card ${cardName}, billing cycle ${billingCycle.cycle_start_date} to ${billingCycle.cycle_end_date} - statement balance of $${actual_statement_balance.toFixed(2)} logged - discrepancy = $${Math.abs(discrepancyAmount).toFixed(2)}`;
      await activityLogService.logEvent(
        'billing_cycle_created',
        'billing_cycle',
        billingCycle.id,
        userAction,
        {
          paymentMethodName: cardName,
          cycleStartDate: billingCycle.cycle_start_date,
          cycleEndDate: billingCycle.cycle_end_date,
          actualStatementBalance: actual_statement_balance,
          calculatedStatementBalance: billingCycle.calculated_statement_balance,
          discrepancyAmount
        }
      );
    } catch (logError) {
      logger.error('Failed to log billing cycle creation event:', logError);
    }
    
    res.status(201).json({
      success: true,
      billingCycle
    });
    
  } catch (error) {
    // Clean up saved file on error
    if (savedFilePath && fs.existsSync(savedFilePath)) {
      try {
        fs.unlinkSync(savedFilePath);
      } catch (cleanupError) {
        logger.error('Failed to cleanup file on error:', cleanupError);
      }
    }
    
    logger.error('Create billing cycle API error:', error);
    
    // Handle specific error codes
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
    
    if (error.code === 'VALIDATION_ERROR') {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    
    if (error.code === 'DUPLICATE_ENTRY') {
      return res.status(409).json({
        success: false,
        error: error.message,
        code: 'DUPLICATE_ENTRY'
      });
    }
    
    // Handle SQLite constraint errors
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({
        success: false,
        error: 'Billing cycle record already exists for this period',
        code: 'DUPLICATE_ENTRY'
      });
    }
    
    if (error.message && error.message.includes('FOREIGN KEY constraint failed')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error while creating billing cycle'
    });
  }
}

/**
 * Get billing cycle history for a payment method
 * GET /api/payment-methods/:id/billing-cycles/history
 * 
 * Query params:
 * - limit (optional): number, max records to return
 * - startDate (optional): string YYYY-MM-DD, filter by cycle_end_date >= startDate
 * - endDate (optional): string YYYY-MM-DD, filter by cycle_end_date <= endDate
 * 
 * _Requirements: 8.2_
 */
async function getBillingCycleHistory(req, res) {
  try {
    const paymentMethodId = parseInt(req.params.id);
    
    if (isNaN(paymentMethodId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }
    
    const { limit, startDate, endDate } = req.query;
    
    const options = {};
    
    // Parse and validate limit
    if (limit !== undefined) {
      const parsedLimit = parseInt(limit);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return res.status(400).json({
          success: false,
          error: 'Limit must be a positive integer'
        });
      }
      options.limit = parsedLimit;
    }
    
    // Validate date formats
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    
    if (startDate !== undefined) {
      if (!dateRegex.test(startDate)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid startDate format. Use YYYY-MM-DD'
        });
      }
      options.startDate = startDate;
    }
    
    if (endDate !== undefined) {
      if (!dateRegex.test(endDate)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid endDate format. Use YYYY-MM-DD'
        });
      }
      options.endDate = endDate;
    }
    
    const cycles = await billingCycleHistoryService.getBillingCycleHistory(
      paymentMethodId,
      options
    );
    
    res.status(200).json({
      success: true,
      billingCycles: cycles,
      count: cycles.length
    });
    
  } catch (error) {
    logger.error('Get billing cycle history API error:', error);
    
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
    
    if (error.code === 'VALIDATION_ERROR') {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error while retrieving billing cycle history'
    });
  }
}

/**
 * Update a billing cycle record
 * PUT /api/payment-methods/:id/billing-cycles/:cycleId
 * 
 * Request body:
 * - actual_statement_balance (optional): number >= 0
 * - minimum_payment (optional): number >= 0 or null
 * - notes (optional): string or null
 * 
 * _Requirements: 8.3_
 */
async function updateBillingCycle(req, res) {
  let savedFilePath = null;
  
  try {
    const paymentMethodId = parseInt(req.params.id);
    const cycleId = parseInt(req.params.cycleId);
    
    if (isNaN(paymentMethodId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }
    
    if (isNaN(cycleId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid billing cycle ID'
      });
    }
    
    // Handle both JSON and multipart/form-data
    let actual_statement_balance = req.body.actual_statement_balance;
    let minimum_payment = req.body.minimum_payment;
    let notes = req.body.notes;
    
    // Parse values that may be strings from form-data
    if (actual_statement_balance !== undefined && actual_statement_balance !== null && actual_statement_balance !== '') {
      actual_statement_balance = typeof actual_statement_balance === 'string' 
        ? parseFloat(actual_statement_balance) 
        : actual_statement_balance;
    }
    
    if (minimum_payment !== undefined && minimum_payment !== null && minimum_payment !== '') {
      minimum_payment = typeof minimum_payment === 'string' 
        ? parseFloat(minimum_payment) 
        : minimum_payment;
    }
    
    // Validate actual_statement_balance if provided
    if (actual_statement_balance !== undefined && actual_statement_balance !== null) {
      if (typeof actual_statement_balance !== 'number' || actual_statement_balance < 0) {
        return res.status(400).json({
          success: false,
          error: 'Actual statement balance must be a non-negative number'
        });
      }
    }
    
    // Validate minimum_payment if provided
    if (minimum_payment !== undefined && minimum_payment !== null) {
      if (typeof minimum_payment !== 'number' || minimum_payment < 0) {
        return res.status(400).json({
          success: false,
          error: 'Minimum payment must be a non-negative number'
        });
      }
    }
    
    // Handle PDF file upload if present
    let statement_pdf_path = undefined;
    if (req.file) {
      try {
        const statementsDir = ensureStatementsDir();
        
        // Get cycle end date for filename from existing record
        const existingCycle = await billingCycleRepository.findById(cycleId);
        const cycleEndDate = existingCycle ? existingCycle.cycle_end_date : new Date().toISOString().split('T')[0];
        
        const filename = generateStatementFilename(paymentMethodId, cycleEndDate, req.file.originalname);
        const filePath = path.join(statementsDir, filename);
        
        // Write file from memory buffer
        fs.writeFileSync(filePath, req.file.buffer);
        savedFilePath = filePath;
        statement_pdf_path = filename;
        
        // Clean up old PDF if replacing
        if (existingCycle && existingCycle.statement_pdf_path) {
          try {
            const oldPdfPath = path.join(statementsDir, existingCycle.statement_pdf_path);
            if (fs.existsSync(oldPdfPath)) {
              fs.unlinkSync(oldPdfPath);
              logger.info('Replaced old billing cycle PDF:', { old: existingCycle.statement_pdf_path, new: filename });
            }
          } catch (cleanupError) {
            logger.error('Failed to cleanup old PDF:', cleanupError);
          }
        }
        
        logger.info('Saved billing cycle statement PDF:', { filename, paymentMethodId, cycleId });
      } catch (fileError) {
        logger.error('Failed to save statement PDF:', fileError);
        return res.status(500).json({
          success: false,
          error: 'Failed to save statement PDF'
        });
      }
    }
    
    // Fetch previous record for activity logging
    let previousBalance = null;
    try {
      const existingCycle = await billingCycleRepository.findById(cycleId);
      if (existingCycle) {
        previousBalance = existingCycle.actual_statement_balance;
      }
    } catch (fetchError) {
      logger.error('Failed to fetch previous billing cycle for logging:', fetchError);
    }
    
    const updateData = { actual_statement_balance, minimum_payment, notes };
    if (statement_pdf_path !== undefined) {
      updateData.statement_pdf_path = statement_pdf_path;
    }
    
    const billingCycle = await billingCycleHistoryService.updateBillingCycle(
      paymentMethodId,
      cycleId,
      updateData
    );
    
    logger.info('Billing cycle updated via API:', {
      id: cycleId,
      paymentMethodId
    });
    
    // Activity logging (fire-and-forget)
    try {
      const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
      const cardName = paymentMethod ? (paymentMethod.display_name || paymentMethod.full_name) : `Card ${paymentMethodId}`;
      const newBalance = billingCycle.actual_statement_balance;
      const prevBal = previousBalance !== null ? previousBalance : newBalance;
      const userAction = `Updated billing cycle for ${cardName} (${billingCycle.cycle_start_date} to ${billingCycle.cycle_end_date}) - statement balance: $${prevBal.toFixed(2)} → $${newBalance.toFixed(2)}`;
      
      // Determine changed fields
      const changedFields = [];
      if (actual_statement_balance !== undefined) changedFields.push('actual_statement_balance');
      if (minimum_payment !== undefined) changedFields.push('minimum_payment');
      if (notes !== undefined) changedFields.push('notes');
      if (statement_pdf_path !== undefined) changedFields.push('statement_pdf_path');
      
      await activityLogService.logEvent(
        'billing_cycle_updated',
        'billing_cycle',
        cycleId,
        userAction,
        {
          paymentMethodName: cardName,
          cycleEndDate: billingCycle.cycle_end_date,
          previousBalance: prevBal,
          newBalance,
          changedFields
        }
      );
    } catch (logError) {
      logger.error('Failed to log billing cycle update event:', logError);
    }
    
    res.status(200).json({
      success: true,
      billingCycle
    });
    
  } catch (error) {
    // Clean up saved file on error
    if (savedFilePath && fs.existsSync(savedFilePath)) {
      try {
        fs.unlinkSync(savedFilePath);
      } catch (cleanupError) {
        logger.error('Failed to cleanup file on error:', cleanupError);
      }
    }
    
    logger.error('Update billing cycle API error:', error);
    
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
    
    if (error.code === 'VALIDATION_ERROR') {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    
    if (error.code === 'UPDATE_FAILED') {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error while updating billing cycle'
    });
  }
}

/**
 * Delete a billing cycle record
 * DELETE /api/payment-methods/:id/billing-cycles/:cycleId
 * 
 * _Requirements: 8.4_
 */
async function deleteBillingCycle(req, res) {
  try {
    const paymentMethodId = parseInt(req.params.id);
    const cycleId = parseInt(req.params.cycleId);
    
    if (isNaN(paymentMethodId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }
    
    if (isNaN(cycleId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid billing cycle ID'
      });
    }
    
    // Get the billing cycle to check for PDF before deleting
    const cycles = await billingCycleHistoryService.getBillingCycleHistory(paymentMethodId, {});
    const cycleToDelete = cycles.find(c => c.id === cycleId);
    
    const deleted = await billingCycleHistoryService.deleteBillingCycle(
      paymentMethodId,
      cycleId
    );
    
    // Clean up PDF file if it exists
    if (cycleToDelete && cycleToDelete.statement_pdf_path) {
      try {
        const statementsDir = getStatementsPath();
        const pdfPath = path.join(statementsDir, cycleToDelete.statement_pdf_path);
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath);
          logger.info('Deleted billing cycle PDF:', { filename: cycleToDelete.statement_pdf_path });
        }
      } catch (cleanupError) {
        logger.error('Failed to delete billing cycle PDF:', cleanupError);
        // Don't fail the request, just log the error
      }
    }
    
    logger.info('Billing cycle deleted via API:', {
      id: cycleId,
      paymentMethodId
    });
    
    // Activity logging (fire-and-forget)
    if (cycleToDelete) {
      try {
        const paymentMethod = await paymentMethodRepository.findById(paymentMethodId);
        const cardName = paymentMethod ? (paymentMethod.display_name || paymentMethod.full_name) : `Card ${paymentMethodId}`;
        const userAction = `Deleted billing cycle for ${cardName} (${cycleToDelete.cycle_start_date} to ${cycleToDelete.cycle_end_date})`;
        await activityLogService.logEvent(
          'billing_cycle_deleted',
          'billing_cycle',
          cycleId,
          userAction,
          {
            paymentMethodName: cardName,
            cycleStartDate: cycleToDelete.cycle_start_date,
            cycleEndDate: cycleToDelete.cycle_end_date,
            actualStatementBalance: cycleToDelete.actual_statement_balance
          }
        );
      } catch (logError) {
        logger.error('Failed to log billing cycle deletion event:', logError);
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Billing cycle record deleted successfully'
    });
    
  } catch (error) {
    logger.error('Delete billing cycle API error:', error);
    
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
    
    if (error.code === 'VALIDATION_ERROR') {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error while deleting billing cycle'
    });
  }
}

/**
 * Get billing cycle statement PDF
 * GET /api/payment-methods/:id/billing-cycles/:cycleId/pdf
 * 
 * Returns the PDF file for a billing cycle
 */
async function getBillingCyclePdf(req, res) {
  try {
    const paymentMethodId = parseInt(req.params.id);
    const cycleId = parseInt(req.params.cycleId);
    
    if (isNaN(paymentMethodId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }
    
    if (isNaN(cycleId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid billing cycle ID'
      });
    }
    
    // Get the billing cycle to find the PDF path
    const cycles = await billingCycleHistoryService.getBillingCycleHistory(paymentMethodId, {});
    const cycle = cycles.find(c => c.id === cycleId);
    
    if (!cycle) {
      return res.status(404).json({
        success: false,
        error: 'Billing cycle not found'
      });
    }
    
    if (!cycle.statement_pdf_path) {
      return res.status(404).json({
        success: false,
        error: 'No PDF attached to this billing cycle'
      });
    }
    
    const statementsDir = getStatementsPath();
    const pdfPath = path.join(statementsDir, cycle.statement_pdf_path);
    
    if (!fs.existsSync(pdfPath)) {
      logger.error('Billing cycle PDF file not found:', { pdfPath });
      return res.status(404).json({
        success: false,
        error: 'PDF file not found'
      });
    }
    
    // Set headers for PDF response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${cycle.statement_pdf_path}"`);
    
    // Stream the file
    const fileStream = fs.createReadStream(pdfPath);
    fileStream.pipe(res);
    
  } catch (error) {
    logger.error('Get billing cycle PDF API error:', error);
    
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error while retrieving PDF'
    });
  }
}

/**
 * Get current billing cycle status
 * GET /api/payment-methods/:id/billing-cycles/current
 * 
 * Returns:
 * - hasActualBalance: boolean
 * - cycleStartDate: string YYYY-MM-DD
 * - cycleEndDate: string YYYY-MM-DD
 * - actualBalance: number or null
 * - calculatedBalance: number
 * - daysUntilCycleEnd: number
 * - needsEntry: boolean
 * 
 * _Requirements: 8.5_
 */
async function getCurrentCycleStatus(req, res) {
  try {
    const paymentMethodId = parseInt(req.params.id);
    
    if (isNaN(paymentMethodId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }
    
    const status = await billingCycleHistoryService.getCurrentCycleStatus(paymentMethodId);
    
    res.status(200).json({
      success: true,
      ...status
    });
    
  } catch (error) {
    logger.error('Get current cycle status API error:', error);
    
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
    
    if (error.code === 'VALIDATION_ERROR') {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error while retrieving current cycle status'
    });
  }
}

/**
 * Get unified billing cycles with auto-generation, transaction counts, and trends
 * GET /api/payment-methods/:id/billing-cycles/unified
 * 
 * Query params:
 * - limit (optional): number, max records to return (default 12)
 * - include_auto_generate (optional): boolean, whether to auto-generate missing cycles (default true)
 * 
 * Returns:
 * - billingCycles: Array of enriched billing cycle records
 * - autoGeneratedCount: Number of cycles auto-generated in this request
 * - totalCount: Total number of cycles returned
 * 
 * _Requirements: 8.1, 8.3, 8.4_
 */
async function getUnifiedBillingCycles(req, res) {
  try {
    const paymentMethodId = parseInt(req.params.id);
    
    if (isNaN(paymentMethodId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }
    
    const { limit, include_auto_generate } = req.query;
    
    const options = {};
    
    // Parse and validate limit
    if (limit !== undefined) {
      const parsedLimit = parseInt(limit);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return res.status(400).json({
          success: false,
          error: 'Limit must be a positive integer'
        });
      }
      options.limit = parsedLimit;
    }
    
    // Parse include_auto_generate (default true)
    if (include_auto_generate !== undefined) {
      // Accept 'true', 'false', '1', '0'
      const value = include_auto_generate.toLowerCase();
      if (value !== 'true' && value !== 'false' && value !== '1' && value !== '0') {
        return res.status(400).json({
          success: false,
          error: 'include_auto_generate must be a boolean (true/false)'
        });
      }
      options.includeAutoGenerate = value === 'true' || value === '1';
    }
    
    const result = await billingCycleHistoryService.getUnifiedBillingCycles(
      paymentMethodId,
      options
    );
    
    res.status(200).json({
      success: true,
      billingCycles: result.billingCycles,
      autoGeneratedCount: result.autoGeneratedCount,
      totalCount: result.totalCount
    });
    
  } catch (error) {
    logger.error('Get unified billing cycles API error:', error);
    
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }
    
    if (error.code === 'VALIDATION_ERROR') {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error while retrieving unified billing cycles'
    });
  }
}

module.exports = {
  createBillingCycle,
  getBillingCycleHistory,
  updateBillingCycle,
  deleteBillingCycle,
  getCurrentCycleStatus,
  getBillingCyclePdf,
  getUnifiedBillingCycles
};
