const billingCycleHistoryService = require('../services/billingCycleHistoryService');
const logger = require('../config/logger');

/**
 * BillingCycleController
 * HTTP request handlers for billing cycle history endpoints
 * 
 * _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
 */

/**
 * Create a billing cycle record
 * POST /api/payment-methods/:id/billing-cycles
 * 
 * Request body:
 * - actual_statement_balance (required): number >= 0
 * - minimum_payment (optional): number >= 0
 * - due_date (optional): string YYYY-MM-DD
 * - notes (optional): string
 * 
 * _Requirements: 8.1_
 */
async function createBillingCycle(req, res) {
  try {
    const paymentMethodId = parseInt(req.params.id);
    
    if (isNaN(paymentMethodId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }
    
    const { actual_statement_balance, minimum_payment, due_date, notes } = req.body;
    
    // Validate required field
    if (actual_statement_balance === undefined || actual_statement_balance === null) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: actual_statement_balance'
      });
    }
    
    // Validate actual_statement_balance is a non-negative number
    if (typeof actual_statement_balance !== 'number' || actual_statement_balance < 0) {
      return res.status(400).json({
        success: false,
        error: 'Actual statement balance must be a non-negative number'
      });
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
    
    // Validate due_date format if provided
    if (due_date !== undefined && due_date !== null) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(due_date)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format. Use YYYY-MM-DD'
        });
      }
    }
    
    const billingCycle = await billingCycleHistoryService.createBillingCycle(
      paymentMethodId,
      { actual_statement_balance, minimum_payment, due_date, notes }
    );
    
    logger.info('Billing cycle created via API:', {
      id: billingCycle.id,
      paymentMethodId,
      cycleEndDate: billingCycle.cycle_end_date
    });
    
    res.status(201).json({
      success: true,
      billingCycle
    });
    
  } catch (error) {
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
      cycles,
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
 * - due_date (optional): string YYYY-MM-DD or null
 * - notes (optional): string or null
 * 
 * _Requirements: 8.3_
 */
async function updateBillingCycle(req, res) {
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
    
    const { actual_statement_balance, minimum_payment, due_date, notes } = req.body;
    
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
    
    // Validate due_date format if provided
    if (due_date !== undefined && due_date !== null) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(due_date)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format. Use YYYY-MM-DD'
        });
      }
    }
    
    const billingCycle = await billingCycleHistoryService.updateBillingCycle(
      paymentMethodId,
      cycleId,
      { actual_statement_balance, minimum_payment, due_date, notes }
    );
    
    logger.info('Billing cycle updated via API:', {
      id: cycleId,
      paymentMethodId
    });
    
    res.status(200).json({
      success: true,
      billingCycle
    });
    
  } catch (error) {
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
    
    const deleted = await billingCycleHistoryService.deleteBillingCycle(
      paymentMethodId,
      cycleId
    );
    
    logger.info('Billing cycle deleted via API:', {
      id: cycleId,
      paymentMethodId
    });
    
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

module.exports = {
  createBillingCycle,
  getBillingCycleHistory,
  updateBillingCycle,
  deleteBillingCycle,
  getCurrentCycleStatus
};
