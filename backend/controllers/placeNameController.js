const placeNameService = require('../services/placeNameService');

/**
 * Analyze place names and return similarity groups
 * GET /api/expenses/place-names/analyze
 */
async function analyzePlaceNames(req, res) {
  try {
    const result = await placeNameService.analyzePlaceNames();
    res.json(result);
  } catch (error) {
    console.error('Error analyzing place names:', error);
    res.status(500).json({ 
      error: 'Failed to analyze place names',
      message: error.message 
    });
  }
}

/**
 * Apply standardization changes to place names
 * POST /api/expenses/place-names/standardize
 */
async function standardizePlaceNames(req, res) {
  try {
    const { updates } = req.body;

    // Basic request validation
    if (!updates) {
      return res.status(400).json({ 
        error: 'Invalid request',
        message: 'updates array is required' 
      });
    }

    // Service handles detailed validation and will throw descriptive errors
    const result = await placeNameService.standardizePlaceNames(updates);
    res.json(result);
  } catch (error) {
    console.error('Error standardizing place names:', error);
    
    // Check if it's a validation error (from service)
    if (error.message && (
      error.message.includes('must be') || 
      error.message.includes('cannot be') ||
      error.message.includes('Updates')
    )) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: error.message 
      });
    }
    
    // Database or other errors
    res.status(500).json({ 
      error: 'Failed to standardize place names',
      message: error.message 
    });
  }
}

module.exports = {
  analyzePlaceNames,
  standardizePlaceNames
};
