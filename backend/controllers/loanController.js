const loanService = require('../services/loanService');

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
 * Body: { name, initial_balance, start_date, notes }
 */
async function createLoan(req, res) {
  try {
    const loanData = req.body;
    
    if (!loanData.name || loanData.initial_balance === undefined || !loanData.start_date) {
      return res.status(400).json({ error: 'Name, initial_balance, and start_date are required' });
    }
    
    const createdLoan = await loanService.createLoan(loanData);
    res.status(201).json(createdLoan);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Update a loan by ID
 * PUT /api/loans/:id
 * Body: { name, notes, start_date }
 */
async function updateLoan(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid loan ID' });
    }
    
    const loanData = req.body;
    
    if (!loanData.name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const updatedLoan = await loanService.updateLoan(id, loanData);
    
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
    
    const deleted = await loanService.deleteLoan(id);
    
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
    
    if (isPaidOff === undefined) {
      return res.status(400).json({ error: 'isPaidOff is required' });
    }
    
    const updatedLoan = await loanService.markPaidOff(id, isPaidOff);
    
    if (!updatedLoan) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    
    res.status(200).json(updatedLoan);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

module.exports = {
  getAllLoans,
  createLoan,
  updateLoan,
  deleteLoan,
  markPaidOff
};
