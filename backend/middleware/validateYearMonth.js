/**
 * Middleware to validate year and month parameters
 * Can extract from query, params, or body
 */
const validateYearMonth = (source = 'query') => {
  return (req, res, next) => {
    const data = source === 'query' ? req.query : 
                 source === 'params' ? req.params : 
                 req.body;
    
    const { year, month } = data;
    
    if (!year || !month) {
      return res.status(400).json({ 
        error: 'Year and month are required' 
      });
    }
    
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    
    if (isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
      return res.status(400).json({ 
        error: 'Invalid year format. Year must be between 1900 and 2100' 
      });
    }
    
    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ 
        error: 'Invalid month format. Month must be between 1 and 12' 
      });
    }
    
    // Attach validated values to request
    req.validatedYear = yearNum;
    req.validatedMonth = monthNum;
    
    next();
  };
};

module.exports = { validateYearMonth };
