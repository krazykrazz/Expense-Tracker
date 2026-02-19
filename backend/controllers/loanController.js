const loanService = require('../services/loanService');
const mortgageService = require('../services/mortgageService');
const mortgageInsightsService = require('../services/mortgageInsightsService');
const mortgagePaymentService = require('../services/mortgagePaymentService');
const loanBalanceService = require('../services/loanBalanceService');
const loanRepository = require('../repositories/loanRepository');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');

/**
 * Get all loans with current balances
 * GET /api/loans
 */
async function getAllLoans(req, res) {
  try {
    const loans = await loanService.getAllLoans();
    res.status(200).json(loans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Create a new loan
 * POST /api/loans
 * Body: { name, initial_balance, start_date, notes, loan_type, ...mortgageFields }
 */
async function createLoan(req, res) {
  try {
    const loanData = req.body;
    const tabId = req.headers['x-tab-id'] ?? null;
    
    if (!loanData.name || loanData.initial_balance === undefined || !loanData.start_date) {
      return res.status(400).json({ error: 'Name, initial_balance, and start_date are required' });
    }
    
    // Use createMortgage for mortgage loan type
    let createdLoan;
    if (loanData.loan_type === 'mortgage') {
      createdLoan = await loanService.createMortgage(loanData, tabId);
    } else {
      createdLoan = await loanService.createLoan(loanData, tabId);
    }
    
    res.status(201).json(createdLoan);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Update a loan by ID
 * PUT /api/loans/:id
 * Body: { name, notes, start_date, ...mortgageFields }
 */
async function updateLoan(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    
    const loanData = req.body;
    const tabId = req.headers['x-tab-id'] ?? null;
    
    if (!loanData.name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    // Check if this is a mortgage to use the appropriate update method
    const existingLoan = await loanRepository.findById(id);
    if (!existingLoan) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    
    let updatedLoan;
    if (existingLoan.loan_type === 'mortgage') {
      // Use updateMortgage which restricts which fields can be modified
      updatedLoan = await loanService.updateMortgage(id, loanData, tabId);
    } else {
      updatedLoan = await loanService.updateLoan(id, loanData, tabId);
    }
    
    if (!updatedLoan) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    
    res.status(200).json(updatedLoan);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Delete a loan by ID
 * DELETE /api/loans/:id
 */
async function deleteLoan(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    
    const tabId = req.headers['x-tab-id'] ?? null;
    const deleted = await loanService.deleteLoan(id, tabId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    
    res.status(200).json({ message: 'Loan deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Mark a loan as paid off or reactivate it
 * PUT /api/loans/:id/paid-off
 * Body: { isPaidOff }
 */
async function markPaidOff(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    
    const { isPaidOff } = req.body;
    const tabId = req.headers['x-tab-id'] ?? null;
    
    if (isPaidOff === undefined) {
      return res.status(400).json({ error: 'isPaidOff is required' });
    }
    
    const updatedLoan = await loanService.markPaidOff(id, isPaidOff, tabId);
    
    if (!updatedLoan) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    
    res.status(200).json(updatedLoan);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Get amortization schedule for a mortgage
 * GET /api/loans/:id/amortization
 */
async function getAmortizationSchedule(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    
    // Get the loan
    const loan = await loanRepository.findById(id);
    
    if (!loan) {
      return res.status(404).json({ error: 'Mortgage not found' });
    }
    
    if (loan.loan_type !== 'mortgage') {
      return res.status(400).json({ error: 'Amortization schedule is only available for mortgages' });
    }
    
    // Get current balance and rate
    const currentBalanceEntry = await loanRepository.getCurrentBalance(id);
    const currentBalance = currentBalanceEntry ? currentBalanceEntry.remaining_balance : loan.initial_balance;
    const currentRate = currentBalanceEntry ? currentBalanceEntry.rate : 0;
    
    // Generate amortization schedule
    const schedule = mortgageService.generateAmortizationSchedule({
      balance: currentBalance,
      rate: currentRate,
      amortizationYears: loan.amortization_period,
      paymentFrequency: loan.payment_frequency
    });
    
    // Calculate payment amount
    const paymentAmount = mortgageService.calculatePaymentAmount({
      balance: currentBalance,
      rate: currentRate,
      amortizationYears: loan.amortization_period,
      paymentFrequency: loan.payment_frequency
    });
    
    res.status(200).json({
      loanId: id,
      loanName: loan.name,
      currentBalance,
      currentRate,
      amortizationPeriod: loan.amortization_period,
      paymentFrequency: loan.payment_frequency,
      paymentAmount: Math.round(paymentAmount * 100) / 100,
      schedule
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get equity history for a mortgage
 * GET /api/loans/:id/equity-history
 */
async function getEquityHistory(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    
    // Get the loan
    const loan = await loanRepository.findById(id);
    
    if (!loan) {
      return res.status(404).json({ error: 'Mortgage not found' });
    }
    
    if (loan.loan_type !== 'mortgage') {
      return res.status(400).json({ error: 'Equity history is only available for mortgages' });
    }
    
    if (!loan.estimated_property_value) {
      return res.status(200).json({
        loanId: id,
        loanName: loan.name,
        estimatedPropertyValue: null,
        currentEquity: null,
        history: [],
        message: 'No estimated property value set for this mortgage'
      });
    }
    
    // Get balance history
    const balanceHistory = await loanBalanceRepository.getBalanceHistory(id);
    
    // Calculate equity for each balance entry
    const equityHistory = balanceHistory.map(entry => {
      const equity = mortgageService.calculateEquity(
        loan.estimated_property_value,
        entry.remaining_balance
      );
      
      return {
        year: entry.year,
        month: entry.month,
        balance: entry.remaining_balance,
        estimatedPropertyValue: loan.estimated_property_value,
        equityAmount: equity ? equity.equityAmount : null,
        equityPercentage: equity ? equity.equityPercentage : null
      };
    });
    
    // Calculate current equity
    const currentBalanceEntry = await loanRepository.getCurrentBalance(id);
    const currentBalance = currentBalanceEntry ? currentBalanceEntry.remaining_balance : loan.initial_balance;
    const currentEquity = mortgageService.calculateEquity(loan.estimated_property_value, currentBalance);
    
    res.status(200).json({
      loanId: id,
      loanName: loan.name,
      estimatedPropertyValue: loan.estimated_property_value,
      currentBalance,
      currentEquity,
      history: equityHistory
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Update estimated property value for a mortgage
 * PUT /api/loans/:id/property-value
 * Body: { estimatedPropertyValue }
 */
async function updatePropertyValue(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    
    const { estimatedPropertyValue } = req.body;
    
    if (estimatedPropertyValue === undefined) {
      return res.status(400).json({ error: 'estimatedPropertyValue is required' });
    }
    
    // Get the loan
    const loan = await loanRepository.findById(id);
    
    if (!loan) {
      return res.status(404).json({ error: 'Mortgage not found' });
    }
    
    if (loan.loan_type !== 'mortgage') {
      return res.status(400).json({ error: 'Property value can only be updated for mortgages' });
    }
    
    // Update the property value using the mortgage update method
    const updatedLoan = await loanService.updateMortgage(id, {
      name: loan.name, // Required field
      estimated_property_value: estimatedPropertyValue
    });
    
    if (!updatedLoan) {
      return res.status(404).json({ error: 'Mortgage not found' });
    }
    
    // Calculate new equity
    const currentBalanceEntry = await loanRepository.getCurrentBalance(id);
    const currentBalance = currentBalanceEntry ? currentBalanceEntry.remaining_balance : loan.initial_balance;
    const equity = mortgageService.calculateEquity(estimatedPropertyValue, currentBalance);
    
    res.status(200).json({
      ...updatedLoan,
      currentBalance,
      equity
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Get mortgage insights
 * GET /api/loans/:id/insights
 */
async function getMortgageInsights(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    
    const insights = await mortgageInsightsService.getMortgageInsights(id);
    res.status(200).json(insights);
  } catch (error) {
    if (error.message === 'Mortgage not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Insights are only available for mortgages') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get mortgage payment history
 * GET /api/loans/:id/payments
 */
async function getMortgagePayments(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    
    // Verify the loan exists and is a mortgage
    const loan = await loanRepository.findById(id);
    if (!loan) {
      return res.status(404).json({ error: 'Mortgage not found' });
    }
    if (loan.loan_type !== 'mortgage') {
      return res.status(400).json({ error: 'Payment tracking is only available for mortgages' });
    }
    
    const payments = await mortgagePaymentService.getPaymentHistory(id);
    res.status(200).json(payments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Create a mortgage payment entry
 * POST /api/loans/:id/payments
 * Body: { payment_amount, effective_date, notes? }
 */
async function createMortgagePayment(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    
    const { payment_amount, effective_date, notes } = req.body;
    
    const payment = await mortgagePaymentService.setPaymentAmount(
      id,
      payment_amount,
      effective_date,
      notes
    );
    
    res.status(201).json(payment);
  } catch (error) {
    if (error.message === 'Mortgage not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message.includes('Payment amount') || 
        error.message.includes('Effective date') ||
        error.message === 'Payment tracking is only available for mortgages') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
}

/**
 * Update a mortgage payment entry
 * PUT /api/loans/:id/payments/:paymentId
 * Body: { payment_amount, effective_date, notes? }
 */
async function updateMortgagePayment(req, res) {
  try {
    const id = parseInt(req.params.id);
    const paymentId = parseInt(req.params.paymentId);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    if (isNaN(paymentId)) {
      return res.status(400).json({ error: 'Invalid payment ID' });
    }
    
    // Verify the loan exists and is a mortgage
    const loan = await loanRepository.findById(id);
    if (!loan) {
      return res.status(404).json({ error: 'Mortgage not found' });
    }
    if (loan.loan_type !== 'mortgage') {
      return res.status(400).json({ error: 'Payment tracking is only available for mortgages' });
    }
    
    // Verify the payment belongs to this mortgage
    const existingPayment = await mortgagePaymentService.getPaymentById(paymentId);
    if (!existingPayment) {
      return res.status(404).json({ error: 'Payment entry not found' });
    }
    if (existingPayment.loan_id !== id) {
      return res.status(400).json({ error: 'Payment entry does not belong to this mortgage' });
    }
    
    const { payment_amount, effective_date, notes } = req.body;
    
    const updated = await mortgagePaymentService.updatePayment(
      paymentId,
      payment_amount,
      effective_date,
      notes
    );
    
    if (!updated) {
      return res.status(404).json({ error: 'Payment entry not found' });
    }
    
    res.status(200).json(updated);
  } catch (error) {
    if (error.message.includes('Payment amount') || 
        error.message.includes('Effective date')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
}

/**
 * Delete a mortgage payment entry
 * DELETE /api/loans/:id/payments/:paymentId
 */
async function deleteMortgagePayment(req, res) {
  try {
    const id = parseInt(req.params.id);
    const paymentId = parseInt(req.params.paymentId);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    if (isNaN(paymentId)) {
      return res.status(400).json({ error: 'Invalid payment ID' });
    }
    
    // Verify the loan exists and is a mortgage
    const loan = await loanRepository.findById(id);
    if (!loan) {
      return res.status(404).json({ error: 'Mortgage not found' });
    }
    if (loan.loan_type !== 'mortgage') {
      return res.status(400).json({ error: 'Payment tracking is only available for mortgages' });
    }
    
    // Verify the payment belongs to this mortgage
    const existingPayment = await mortgagePaymentService.getPaymentById(paymentId);
    if (!existingPayment) {
      return res.status(404).json({ error: 'Payment entry not found' });
    }
    if (existingPayment.loan_id !== id) {
      return res.status(400).json({ error: 'Payment entry does not belong to this mortgage' });
    }
    
    const deleted = await mortgagePaymentService.deletePayment(paymentId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Payment entry not found' });
    }
    
    res.status(200).json({ message: 'Payment entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Calculate what-if scenario for extra payment
 * POST /api/loans/:id/insights/scenario
 * Body: { extra_payment }
 */
async function calculateScenario(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    
    const { extra_payment } = req.body;
    
    if (extra_payment === undefined || extra_payment === null) {
      return res.status(400).json({ error: 'Extra payment amount is required' });
    }
    if (typeof extra_payment !== 'number' || isNaN(extra_payment)) {
      return res.status(400).json({ error: 'Extra payment amount must be a number' });
    }
    if (extra_payment <= 0) {
      return res.status(400).json({ error: 'Extra payment amount must be a positive number' });
    }
    
    // Get current insights to get balance, rate, and current payment
    const insights = await mortgageInsightsService.getMortgageInsights(id);
    
    // Calculate scenario with extra payment
    const scenario = mortgageInsightsService.calculateExtraPaymentScenario({
      balance: insights.currentStatus.balance,
      rate: insights.currentStatus.rate,
      currentPayment: insights.currentStatus.currentPayment,
      extraPayment: extra_payment,
      paymentFrequency: 'monthly' // Default to monthly
    });
    
    res.status(200).json(scenario);
  } catch (error) {
    if (error.message === 'Mortgage not found') {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === 'Insights are only available for mortgages') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
}

/**
 * Update the current interest rate for a mortgage (variable rate support)
 * PUT /api/loans/:id/rate
 * Body: { rate }
 */
async function updateCurrentRate(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    
    const { rate } = req.body;
    
    if (rate === undefined || rate === null) {
      return res.status(400).json({ error: 'Rate is required' });
    }
    if (typeof rate !== 'number' || isNaN(rate)) {
      return res.status(400).json({ error: 'Rate must be a number' });
    }
    if (rate < 0 || rate > 100) {
      return res.status(400).json({ error: 'Rate must be between 0 and 100' });
    }
    
    // Verify the loan exists and is a mortgage
    const loan = await loanRepository.findById(id);
    if (!loan) {
      return res.status(404).json({ error: 'Mortgage not found' });
    }
    if (loan.loan_type !== 'mortgage') {
      return res.status(400).json({ error: 'Rate updates are only available for mortgages' });
    }
    
    // Update the rate
    const result = await loanBalanceService.updateCurrentRate(id, rate);
    
    // Return updated insights
    const insights = await mortgageInsightsService.getMortgageInsights(id);
    
    res.status(200).json({
      message: 'Rate updated successfully',
      balanceEntry: result,
      currentStatus: insights.currentStatus
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getAllLoans,
  createLoan,
  updateLoan,
  deleteLoan,
  markPaidOff,
  getAmortizationSchedule,
  getEquityHistory,
  updatePropertyValue,
  getMortgageInsights,
  getMortgagePayments,
  createMortgagePayment,
  updateMortgagePayment,
  deleteMortgagePayment,
  calculateScenario,
  updateCurrentRate
};
