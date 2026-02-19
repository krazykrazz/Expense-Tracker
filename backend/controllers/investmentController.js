const investmentService = require('../services/investmentService');

/**
 * Get all investments with current values
 * GET /api/investments
 */
async function getAllInvestments(req, res) {
  try {
    const investments = await investmentService.getAllInvestments();
    res.status(200).json(investments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Create a new investment
 * POST /api/investments
 * Body: { name, type, initial_value }
 */
async function createInvestment(req, res) {
  try {
    const investmentData = req.body;
    
    if (!investmentData.name || !investmentData.type || investmentData.initial_value === undefined) {
      return res.status(400).json({ error: 'Name, type, and initial_value are required' });
    }
    
    const createdInvestment = await investmentService.createInvestment(investmentData, req.headers['x-tab-id'] ?? null);
    res.status(201).json(createdInvestment);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Update an investment by ID
 * PUT /api/investments/:id
 * Body: { name, type, initial_value }
 */
async function updateInvestment(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid investment ID' });
    }
    
    const investmentData = req.body;
    
    if (!investmentData.name || !investmentData.type || investmentData.initial_value === undefined) {
      return res.status(400).json({ error: 'Name, type, and initial_value are required' });
    }
    
    const updatedInvestment = await investmentService.updateInvestment(id, investmentData, req.headers['x-tab-id'] ?? null);
    
    if (!updatedInvestment) {
      return res.status(404).json({ error: 'Investment not found' });
    }
    
    res.status(200).json(updatedInvestment);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Delete an investment by ID
 * DELETE /api/investments/:id
 */
async function deleteInvestment(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid investment ID' });
    }
    
    const deleted = await investmentService.deleteInvestment(id, req.headers['x-tab-id'] ?? null);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Investment not found' });
    }
    
    res.status(200).json({ message: 'Investment deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getAllInvestments,
  createInvestment,
  updateInvestment,
  deleteInvestment
};
