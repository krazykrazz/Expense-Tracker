const paymentMethodService = require('../services/paymentMethodService');
const logger = require('../config/logger');

/**
 * Get all payment methods with optional filtering
 * GET /api/payment-methods
 * Query params: type, activeOnly
 */
async function getAll(req, res) {
  try {
    const { type, activeOnly, withCounts } = req.query;
    
    const options = {};
    if (type) {
      options.type = type;
    }
    if (activeOnly === 'true') {
      options.activeOnly = true;
    }

    let paymentMethods;
    if (withCounts === 'true') {
      paymentMethods = await paymentMethodService.getAllWithExpenseCounts();
      // Apply filters if needed
      if (options.type) {
        paymentMethods = paymentMethods.filter(pm => pm.type === options.type);
      }
      if (options.activeOnly) {
        paymentMethods = paymentMethods.filter(pm => pm.is_active === 1);
      }
    } else {
      paymentMethods = await paymentMethodService.getAllPaymentMethods(options);
    }

    res.status(200).json({
      success: true,
      paymentMethods,
      count: paymentMethods.length
    });

  } catch (error) {
    logger.error('Get all payment methods API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while retrieving payment methods'
    });
  }
}

/**
 * Get a specific payment method by ID
 * GET /api/payment-methods/:id
 */
async function getById(req, res) {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }

    // For credit cards, return with computed fields
    const paymentMethod = await paymentMethodService.getCreditCardWithComputedFields(id);
    
    if (!paymentMethod) {
      // Try getting as regular payment method
      const regularPaymentMethod = await paymentMethodService.getPaymentMethodById(id);
      if (!regularPaymentMethod) {
        return res.status(404).json({
          success: false,
          error: 'Payment method not found'
        });
      }
      
      return res.status(200).json({
        success: true,
        paymentMethod: regularPaymentMethod
      });
    }

    res.status(200).json({
      success: true,
      paymentMethod
    });

  } catch (error) {
    logger.error('Get payment method by ID API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while retrieving payment method'
    });
  }
}

/**
 * Create a new payment method
 * POST /api/payment-methods
 */
async function create(req, res) {
  try {
    const data = req.body;

    const paymentMethod = await paymentMethodService.createPaymentMethod(data);

    logger.debug('Payment method created via API:', {
      id: paymentMethod.id,
      type: paymentMethod.type,
      displayName: paymentMethod.display_name
    });

    res.status(201).json({
      success: true,
      paymentMethod
    });

  } catch (error) {
    logger.error('Create payment method API error:', error);

    // Handle validation errors
    if (error.message.includes('required') ||
        error.message.includes('Invalid') ||
        error.message.includes('must be') ||
        error.message.includes('cannot be') ||
        error.message.includes('already exists')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error while creating payment method'
    });
  }
}

/**
 * Update a payment method
 * PUT /api/payment-methods/:id
 */
async function update(req, res) {
  try {
    const id = parseInt(req.params.id);
    const data = req.body;

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }

    const paymentMethod = await paymentMethodService.updatePaymentMethod(id, data);

    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        error: 'Payment method not found'
      });
    }

    logger.debug('Payment method updated via API:', {
      id: paymentMethod.id,
      type: paymentMethod.type,
      displayName: paymentMethod.display_name
    });

    res.status(200).json({
      success: true,
      paymentMethod
    });

  } catch (error) {
    logger.error('Update payment method API error:', error);

    // Handle validation errors
    if (error.message.includes('required') ||
        error.message.includes('Invalid') ||
        error.message.includes('must be') ||
        error.message.includes('cannot be') ||
        error.message.includes('already exists')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error while updating payment method'
    });
  }
}

/**
 * Delete a payment method
 * DELETE /api/payment-methods/:id
 */
async function deletePaymentMethod(req, res) {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }

    const result = await paymentMethodService.deletePaymentMethod(id);

    if (!result.success) {
      // Determine appropriate status code
      if (result.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: result.message
        });
      }
      
      // Business logic errors (has expenses, last active, etc.)
      return res.status(400).json({
        success: false,
        error: result.message,
        expenseCount: result.expenseCount
      });
    }

    logger.debug('Payment method deleted via API:', { id });

    res.status(200).json({
      success: true,
      message: result.message
    });

  } catch (error) {
    logger.error('Delete payment method API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while deleting payment method'
    });
  }
}

/**
 * Set payment method active/inactive status
 * PATCH /api/payment-methods/:id/active
 */
async function setActive(req, res) {
  try {
    const id = parseInt(req.params.id);
    const { isActive } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'isActive must be a boolean value'
      });
    }

    const paymentMethod = await paymentMethodService.setPaymentMethodActive(id, isActive);

    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        error: 'Payment method not found'
      });
    }

    logger.debug('Payment method active status updated via API:', {
      id,
      isActive
    });

    res.status(200).json({
      success: true,
      paymentMethod
    });

  } catch (error) {
    logger.error('Set payment method active API error:', error);

    // Handle business logic errors
    if (error.message.includes('Cannot deactivate')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error while updating payment method status'
    });
  }
}

/**
 * Get all display names (for validation)
 * GET /api/payment-methods/display-names
 */
async function getDisplayNames(req, res) {
  try {
    const paymentMethods = await paymentMethodService.getAllPaymentMethods();
    
    const displayNames = paymentMethods.map(pm => ({
      id: pm.id,
      display_name: pm.display_name,
      type: pm.type,
      is_active: pm.is_active
    }));

    res.status(200).json({
      success: true,
      displayNames,
      count: displayNames.length
    });

  } catch (error) {
    logger.error('Get display names API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while retrieving display names'
    });
  }
}

/**
 * Get active payment methods for dropdown population
 * GET /api/payment-methods/active
 */
async function getActive(req, res) {
  try {
    const paymentMethods = await paymentMethodService.getActivePaymentMethods();

    res.status(200).json({
      success: true,
      paymentMethods,
      count: paymentMethods.length
    });

  } catch (error) {
    logger.error('Get active payment methods API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while retrieving active payment methods'
    });
  }
}

/**
 * Recalculate credit card balance based on actual expenses and payments
 * POST /api/payment-methods/:id/recalculate-balance
 * Only includes expenses dated today or earlier (excludes future pre-logged expenses)
 */
async function recalculateBalance(req, res) {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }

    const paymentMethod = await paymentMethodService.recalculateBalance(id);

    logger.info('Credit card balance recalculated via API:', {
      id,
      displayName: paymentMethod.display_name,
      newBalance: paymentMethod.current_balance
    });

    res.status(200).json({
      success: true,
      paymentMethod,
      message: `Balance recalculated to $${paymentMethod.current_balance.toFixed(2)}`
    });

  } catch (error) {
    logger.error('Recalculate balance API error:', error);

    // Handle business logic errors
    if (error.message.includes('not found') ||
        error.message.includes('only available for credit cards') ||
        error.message.includes('required')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error while recalculating balance'
    });
  }
}

/**
 * Get billing cycle history for a credit card
 * GET /api/payment-methods/:id/billing-cycles
 * Query params: count (optional, default 6)
 */
async function getBillingCycles(req, res) {
  try {
    const id = parseInt(req.params.id);
    const count = parseInt(req.query.count) || 6;

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }

    // Validate count is reasonable
    if (count < 1 || count > 24) {
      return res.status(400).json({
        success: false,
        error: 'Count must be between 1 and 24'
      });
    }

    // Check if payment method exists and is a credit card
    const paymentMethod = await paymentMethodService.getPaymentMethodById(id);
    
    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        error: 'Payment method not found'
      });
    }

    if (paymentMethod.type !== 'credit_card') {
      return res.status(400).json({
        success: false,
        error: 'Billing cycles are only available for credit cards'
      });
    }

    // Get billing cycles from service
    const cycles = await paymentMethodService.getPreviousBillingCycles(id, count);

    res.status(200).json({
      success: true,
      cycles,
      count: cycles.length
    });

  } catch (error) {
    logger.error('Get billing cycles API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while retrieving billing cycles'
    });
  }
}

/**
 * Get calculated statement balance for a credit card
 * GET /api/payment-methods/:id/statement-balance
 * Returns statement balance info based on billing_cycle_day
 */
async function getStatementBalance(req, res) {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }

    // Check if payment method exists and is a credit card
    const paymentMethod = await paymentMethodService.getPaymentMethodById(id);
    
    if (!paymentMethod) {
      return res.status(404).json({
        success: false,
        error: 'Payment method not found'
      });
    }

    if (paymentMethod.type !== 'credit_card') {
      return res.status(400).json({
        success: false,
        error: 'Statement balance is only available for credit cards'
      });
    }

    // Get statement balance from StatementBalanceService
    const statementBalanceService = require('../services/statementBalanceService');
    const statementBalance = await statementBalanceService.calculateStatementBalance(id);

    res.status(200).json({
      success: true,
      statementBalance
    });

  } catch (error) {
    logger.error('Get statement balance API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while retrieving statement balance'
    });
  }
}

module.exports = {
  getAll,
  getById,
  create,
  update,
  deletePaymentMethod,
  setActive,
  getDisplayNames,
  getActive,
  recalculateBalance,
  getBillingCycles,
  getStatementBalance
};
