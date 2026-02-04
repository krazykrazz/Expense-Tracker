const fixedExpenseService = require('../services/fixedExpenseService');

/**
 * Get all fixed expense items for a specific month
 * GET /api/fixed-expenses/:year/:month
 * 
 * Returns fixed expenses with loan details when linked.
 * _Requirements: 1.4, 2.3, 6.4_
 */
async function getMonthlyFixedExpenses(req, res) {
  try {
    const { year, month } = req.params;
    
    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month parameters are required' });
    }
    
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    
    if (isNaN(yearNum) || isNaN(monthNum)) {
      return res.status(400).json({ error: 'Year and month must be valid numbers' });
    }
    
    if (monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: 'Month must be between 1 and 12' });
    }
    
    // Use getMonthlyFixedExpensesWithLoans to include loan details
    const result = await fixedExpenseService.getMonthlyFixedExpensesWithLoans(yearNum, monthNum);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Create a new fixed expense item
 * POST /api/fixed-expenses
 * Body: { year, month, name, amount, category, payment_type, payment_due_day?, linked_loan_id? }
 * 
 * Supports optional payment_due_day (1-31) and linked_loan_id for loan linkage.
 * _Requirements: 1.4, 2.3, 6.4_
 */
async function createFixedExpense(req, res) {
  try {
    const fixedExpenseData = req.body;
    
    if (!fixedExpenseData.year || !fixedExpenseData.month || !fixedExpenseData.name || fixedExpenseData.amount === undefined) {
      return res.status(400).json({ error: 'Year, month, name, and amount are required' });
    }
    
    const createdFixedExpense = await fixedExpenseService.createFixedExpense(fixedExpenseData);
    res.status(201).json(createdFixedExpense);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Update a fixed expense item by ID
 * PUT /api/fixed-expenses/:id
 * Body: { name, amount, category, payment_type, payment_due_day?, linked_loan_id? }
 * 
 * Supports optional payment_due_day (1-31) and linked_loan_id for loan linkage.
 * _Requirements: 1.4, 2.3, 6.4_
 */
async function updateFixedExpense(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid fixed expense ID' });
    }
    
    const fixedExpenseData = req.body;
    
    if (!fixedExpenseData.name || fixedExpenseData.amount === undefined) {
      return res.status(400).json({ error: 'Name and amount are required' });
    }
    
    const updatedFixedExpense = await fixedExpenseService.updateFixedExpense(id, fixedExpenseData);
    
    if (!updatedFixedExpense) {
      return res.status(404).json({ error: 'Fixed expense not found' });
    }
    
    res.status(200).json(updatedFixedExpense);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Delete a fixed expense item by ID
 * DELETE /api/fixed-expenses/:id
 */
async function deleteFixedExpense(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid fixed expense ID' });
    }
    
    const deleted = await fixedExpenseService.deleteFixedExpense(id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Fixed expense not found' });
    }
    
    res.status(200).json({ message: 'Fixed expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Carry forward fixed expenses from previous month
 * POST /api/fixed-expenses/carry-forward
 * Body: { year, month }
 */
async function carryForwardFixedExpenses(req, res) {
  try {
    const { year, month } = req.body;
    
    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month are required' });
    }
    
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    
    if (isNaN(yearNum) || isNaN(monthNum)) {
      return res.status(400).json({ error: 'Year and month must be valid numbers' });
    }
    
    if (monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: 'Month must be between 1 and 12' });
    }
    
    const result = await fixedExpenseService.carryForwardFixedExpenses(yearNum, monthNum);
    
    // Return success even if count is 0 (no items to carry forward)
    res.status(200).json({
      message: result.count === 0 
        ? 'No fixed expenses found in previous month to carry forward'
        : `Carried forward ${result.count} fixed expense(s) from previous month`,
      items: result.items,
      count: result.count
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

module.exports = {
  getMonthlyFixedExpenses,
  createFixedExpense,
  updateFixedExpense,
  deleteFixedExpense,
  carryForwardFixedExpenses
};
