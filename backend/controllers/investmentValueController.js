const investmentValueService = require('../services/investmentValueService');

/**
 * Get value history for an investment
 * GET /api/investment-values/:investmentId
 */
async function getValueHistory(req, res) {
  try {
    const investmentId = parseInt(req.params.investmentId);
    
    if (isNaN(investmentId)) {
      return res.status(400).json({ error: 'Invalid investment ID' });
    }
    
    const valueHistory = await investmentValueService.getValueHistory(investmentId);
    res.status(200).json(valueHistory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Get value for a specific month
 * GET /api/investment-values/:investmentId/:year/:month
 */
async function getValueForMonth(req, res) {
  try {
    const investmentId = parseInt(req.params.investmentId);
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);
    
    if (isNaN(investmentId)) {
      return res.status(400).json({ error: 'Invalid investment ID' });
    }
    
    if (isNaN(year) || isNaN(month)) {
      return res.status(400).json({ error: 'Year and month must be valid numbers' });
    }
    
    if (month < 1 || month > 12) {
      return res.status(400).json({ error: 'Month must be between 1 and 12' });
    }
    
    const investmentValueRepository = require('../repositories/investmentValueRepository');
    const valueEntry = await investmentValueRepository.findByInvestmentAndMonth(investmentId, year, month);
    
    if (!valueEntry) {
      return res.status(404).json({ error: 'Value entry not found for the specified month' });
    }
    
    res.status(200).json(valueEntry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/**
 * Create or update a value entry
 * POST /api/investment-values
 * Body: { investment_id, year, month, value }
 */
async function createOrUpdateValue(req, res) {
  try {
    const valueData = req.body;
    
    if (valueData.investment_id === undefined || valueData.year === undefined || 
        valueData.month === undefined || valueData.value === undefined) {
      return res.status(400).json({ error: 'Investment ID, year, month, and value are required' });
    }
    
    const valueEntry = await investmentValueService.createOrUpdateValue(valueData);
    res.status(201).json(valueEntry);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Update a value entry by ID
 * PUT /api/investment-values/:id
 * Body: { value }
 */
async function updateValue(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid value entry ID' });
    }
    
    const valueData = req.body;
    
    if (valueData.value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }
    
    const updatedValue = await investmentValueService.updateValue(id, valueData);
    
    if (!updatedValue) {
      return res.status(404).json({ error: 'Value entry not found' });
    }
    
    res.status(200).json(updatedValue);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * Delete a value entry by ID
 * DELETE /api/investment-values/:id
 */
async function deleteValue(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid value entry ID' });
    }
    
    const deleted = await investmentValueService.deleteValue(id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Value entry not found' });
    }
    
    res.status(200).json({ message: 'Value entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getValueHistory,
  getValueForMonth,
  createOrUpdateValue,
  updateValue,
  deleteValue
};
