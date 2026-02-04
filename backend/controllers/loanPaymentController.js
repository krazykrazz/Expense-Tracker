/**
 * Loan Payment Controller
 * 
 * Handles HTTP requests for loan payment tracking operations.
 * Provides endpoints for CRUD operations on payments, balance calculation,
 * payment suggestions, and balance entry migration.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 3.1, 4.1
 */

const loanPaymentService = require('../services/loanPaymentService');
const balanceCalculationService = require('../services/balanceCalculationService');
const paymentSuggestionService = require('../services/paymentSuggestionService');
const migrationService = require('../services/migrationService');

/**
 * Create a new payment entry for a loan
 * POST /api/loans/:loanId/loan-payments
 * Body: { amount, payment_date, notes? }
 * 
 * Requirements: 1.1
 */
async function createPayment(req, res) {
  try {
    const loanId = parseInt(req.params.loanId);
    
    if (isNaN(loanId)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    
    const { amount, payment_date, notes } = req.body;
    
    const payment = await loanPaymentService.createPayment(loanId, {
      amount,
      payment_date,
      notes
    });
    
    res.status(201).json(payment);
  } catch (error) {
    // Handle specific validation errors
    if (error.message === 'Loan not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Payment tracking is only available for loans and mortgages' ||
        error.message.includes('Payment amount') ||
        error.message.includes('Payment date')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get all payments for a loan
 * GET /api/loans/:loanId/loan-payments
 * 
 * Requirements: 1.2
 */
async function getPayments(req, res) {
  try {
    const loanId = parseInt(req.params.loanId);
    
    if (isNaN(loanId)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    
    const payments = await loanPaymentService.getPayments(loanId);
    res.status(200).json(payments);
  } catch (error) {
    if (error.message === 'Loan not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Payment tracking is only available for loans and mortgages') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
}


/**
 * Get a specific payment by ID
 * GET /api/loans/:loanId/loan-payments/:paymentId
 * 
 * Requirements: 1.2
 */
async function getPaymentById(req, res) {
  try {
    const loanId = parseInt(req.params.loanId);
    const paymentId = parseInt(req.params.paymentId);
    
    if (isNaN(loanId)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    if (isNaN(paymentId)) {
      return res.status(400).json({ error: 'Invalid payment ID' });
    }
    
    const payment = await loanPaymentService.getPaymentById(paymentId);
    
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    // Verify the payment belongs to the specified loan
    if (payment.loan_id !== loanId) {
      return res.status(400).json({ error: 'Payment does not belong to this loan' });
    }
    
    res.status(200).json(payment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Update a payment entry
 * PUT /api/loans/:loanId/loan-payments/:paymentId
 * Body: { amount, payment_date, notes? }
 * 
 * Requirements: 1.3
 */
async function updatePayment(req, res) {
  try {
    const loanId = parseInt(req.params.loanId);
    const paymentId = parseInt(req.params.paymentId);
    
    if (isNaN(loanId)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    if (isNaN(paymentId)) {
      return res.status(400).json({ error: 'Invalid payment ID' });
    }
    
    // Verify the payment exists and belongs to this loan
    const existingPayment = await loanPaymentService.getPaymentById(paymentId);
    if (!existingPayment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    if (existingPayment.loan_id !== loanId) {
      return res.status(400).json({ error: 'Payment does not belong to this loan' });
    }
    
    const { amount, payment_date, notes } = req.body;
    
    const updatedPayment = await loanPaymentService.updatePayment(paymentId, {
      amount,
      payment_date,
      notes
    });
    
    if (!updatedPayment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    res.status(200).json(updatedPayment);
  } catch (error) {
    if (error.message === 'Loan not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Payment tracking is only available for loans and mortgages' ||
        error.message.includes('Payment amount') ||
        error.message.includes('Payment date')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
}

/**
 * Delete a payment entry
 * DELETE /api/loans/:loanId/loan-payments/:paymentId
 * 
 * Requirements: 1.4
 */
async function deletePayment(req, res) {
  try {
    const loanId = parseInt(req.params.loanId);
    const paymentId = parseInt(req.params.paymentId);
    
    if (isNaN(loanId)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    if (isNaN(paymentId)) {
      return res.status(400).json({ error: 'Invalid payment ID' });
    }
    
    // Verify the payment exists and belongs to this loan
    const existingPayment = await loanPaymentService.getPaymentById(paymentId);
    if (!existingPayment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    if (existingPayment.loan_id !== loanId) {
      return res.status(400).json({ error: 'Payment does not belong to this loan' });
    }
    
    const deleted = await loanPaymentService.deletePayment(paymentId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    res.status(200).json({ message: 'Payment deleted successfully' });
  } catch (error) {
    if (error.message === 'Loan not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Payment tracking is only available for loans and mortgages') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
}


/**
 * Get calculated balance for a loan
 * GET /api/loans/:loanId/calculated-balance
 * 
 * Requirements: 2.1
 */
async function getCalculatedBalance(req, res) {
  try {
    const loanId = parseInt(req.params.loanId);
    
    if (isNaN(loanId)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    
    const balance = await balanceCalculationService.calculateBalance(loanId);
    res.status(200).json(balance);
  } catch (error) {
    if (error.message === 'Loan not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get balance history with running totals
 * GET /api/loans/:loanId/balance-history
 * 
 * Requirements: 2.1
 */
async function getBalanceHistory(req, res) {
  try {
    const loanId = parseInt(req.params.loanId);
    
    if (isNaN(loanId)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    
    const history = await balanceCalculationService.getBalanceHistory(loanId);
    res.status(200).json(history);
  } catch (error) {
    if (error.message === 'Loan not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get payment suggestion for a loan
 * GET /api/loans/:loanId/payment-suggestion
 * 
 * Requirements: 3.1
 */
async function getPaymentSuggestion(req, res) {
  try {
    const loanId = parseInt(req.params.loanId);
    
    if (isNaN(loanId)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    
    const suggestion = await paymentSuggestionService.getSuggestion(loanId);
    res.status(200).json(suggestion);
  } catch (error) {
    if (error.message === 'Loan not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Payment suggestions are not available for lines of credit') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
}

/**
 * Preview migration of balance entries to payments
 * GET /api/loans/:loanId/migrate-balances/preview
 * 
 * Requirements: 4.1
 */
async function previewMigration(req, res) {
  try {
    const loanId = parseInt(req.params.loanId);
    
    if (isNaN(loanId)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    
    const preview = await migrationService.previewMigration(loanId);
    res.status(200).json(preview);
  } catch (error) {
    if (error.message === 'Loan not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Migration is only available for loans and mortgages') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
}

/**
 * Migrate balance entries to payment entries
 * POST /api/loans/:loanId/migrate-balances
 * 
 * Requirements: 4.1
 */
async function migrateBalances(req, res) {
  try {
    const loanId = parseInt(req.params.loanId);
    
    if (isNaN(loanId)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    
    const result = await migrationService.migrateBalanceEntries(loanId);
    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Loan not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Migration is only available for loans and mortgages') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  createPayment,
  getPayments,
  getPaymentById,
  updatePayment,
  deletePayment,
  getCalculatedBalance,
  getBalanceHistory,
  getPaymentSuggestion,
  previewMigration,
  migrateBalances
};
