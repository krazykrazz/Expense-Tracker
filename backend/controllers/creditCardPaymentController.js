const creditCardPaymentService = require('../services/creditCardPaymentService');
const paymentMethodService = require('../services/paymentMethodService');
const logger = require('../config/logger');

/**
 * Record a credit card payment
 * POST /api/payment-methods/:id/payments
 */
async function recordPayment(req, res) {
  try {
    const paymentMethodId = parseInt(req.params.id);
    const { amount, payment_date, notes } = req.body;

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
        error: 'Payments can only be recorded for credit card payment methods'
      });
    }

    const paymentData = {
      payment_method_id: paymentMethodId,
      amount,
      payment_date,
      notes
    };

    const payment = await creditCardPaymentService.recordPayment(paymentData);

    logger.debug('Credit card payment recorded via API:', {
      paymentId: payment.id,
      paymentMethodId,
      amount
    });

    res.status(201).json({
      success: true,
      payment
    });

  } catch (error) {
    logger.error('Record credit card payment API error:', error);

    // Handle validation errors
    if (error.message.includes('required') ||
        error.message.includes('must be') ||
        error.message.includes('greater than zero') ||
        error.message.includes('format')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    if (error.message.includes('only be recorded for credit card')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error while recording payment'
    });
  }
}

/**
 * Get payment history for a credit card
 * GET /api/payment-methods/:id/payments
 * Query params: startDate, endDate (optional for date range filtering)
 */
async function getPayments(req, res) {
  try {
    const paymentMethodId = parseInt(req.params.id);
    const { startDate, endDate } = req.query;

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
        error: 'Payment history is only available for credit card payment methods'
      });
    }

    let payments;
    let total = null;

    if (startDate && endDate) {
      // Get payments in date range
      payments = await creditCardPaymentService.getPaymentsInRange(paymentMethodId, startDate, endDate);
      total = await creditCardPaymentService.getTotalPaymentsInRange(paymentMethodId, startDate, endDate);
    } else {
      // Get all payments
      payments = await creditCardPaymentService.getPaymentHistory(paymentMethodId);
    }

    res.status(200).json({
      success: true,
      payments,
      count: payments.length,
      total
    });

  } catch (error) {
    logger.error('Get credit card payments API error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    if (error.message.includes('format') || error.message.includes('required')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error while retrieving payments'
    });
  }
}

/**
 * Delete a credit card payment
 * DELETE /api/payment-methods/:id/payments/:paymentId
 */
async function deletePayment(req, res) {
  try {
    const paymentMethodId = parseInt(req.params.id);
    const paymentId = parseInt(req.params.paymentId);

    if (isNaN(paymentMethodId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }

    if (isNaN(paymentId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment ID'
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
        error: 'Payments can only be deleted for credit card payment methods'
      });
    }

    // Verify payment belongs to this payment method
    const payment = await creditCardPaymentService.getPaymentById(paymentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment record not found'
      });
    }

    if (payment.payment_method_id !== paymentMethodId) {
      return res.status(404).json({
        success: false,
        error: 'Payment record not found for this payment method'
      });
    }

    const deleted = await creditCardPaymentService.deletePayment(paymentId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Payment record not found'
      });
    }

    logger.debug('Credit card payment deleted via API:', {
      paymentId,
      paymentMethodId
    });

    res.status(200).json({
      success: true,
      message: 'Payment deleted successfully'
    });

  } catch (error) {
    logger.error('Delete credit card payment API error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error while deleting payment'
    });
  }
}

/**
 * Get total payments for a credit card in a date range
 * GET /api/payment-methods/:id/payments/total
 * Query params: startDate, endDate (required)
 */
async function getTotalPayments(req, res) {
  try {
    const paymentMethodId = parseInt(req.params.id);
    const { startDate, endDate } = req.query;

    if (isNaN(paymentMethodId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payment method ID'
      });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
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
        error: 'Payment totals are only available for credit card payment methods'
      });
    }

    const total = await creditCardPaymentService.getTotalPaymentsInRange(
      paymentMethodId,
      startDate,
      endDate
    );

    res.status(200).json({
      success: true,
      total,
      startDate,
      endDate
    });

  } catch (error) {
    logger.error('Get total payments API error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    if (error.message.includes('format') || error.message.includes('required')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error while calculating total payments'
    });
  }
}

module.exports = {
  recordPayment,
  getPayments,
  deletePayment,
  getTotalPayments
};
