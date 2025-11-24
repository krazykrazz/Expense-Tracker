/**
 * Validation utility functions
 */

/**
 * Validate a number field
 * @param {*} value - The value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @param {Object} options - Validation options
 * @param {number} options.min - Minimum value (inclusive)
 * @param {number} options.max - Maximum value (inclusive)
 * @param {boolean} options.required - Whether the field is required
 * @param {boolean} options.allowNull - Whether null is allowed
 * @returns {boolean} - Returns true if valid
 * @throws {Error} - Throws error with descriptive message if invalid
 */
const validateNumber = (value, fieldName, options = {}) => {
  const { 
    min = null, 
    max = null, 
    required = true,
    allowNull = false 
  } = options;
  
  // Check if value is provided
  if (value === undefined || value === null) {
    if (allowNull && value === null) {
      return true;
    }
    if (required) {
      throw new Error(`${fieldName} is required`);
    }
    return true;
  }
  
  // Check if value is a number
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error(`${fieldName} must be a valid number`);
  }
  
  // Check minimum value
  if (min !== null && value < min) {
    throw new Error(`${fieldName} must be at least ${min}`);
  }
  
  // Check maximum value
  if (max !== null && value > max) {
    throw new Error(`${fieldName} must be at most ${max}`);
  }
  
  return true;
};

/**
 * Validate a string field
 * @param {*} value - The value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @param {Object} options - Validation options
 * @param {number} options.minLength - Minimum string length
 * @param {number} options.maxLength - Maximum string length
 * @param {boolean} options.required - Whether the field is required
 * @param {RegExp} options.pattern - Regex pattern to match
 * @returns {boolean} - Returns true if valid
 * @throws {Error} - Throws error with descriptive message if invalid
 */
const validateString = (value, fieldName, options = {}) => {
  const { 
    minLength = null, 
    maxLength = null, 
    required = true,
    pattern = null 
  } = options;
  
  // Check if value is provided
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new Error(`${fieldName} is required`);
    }
    return true;
  }
  
  // Check if value is a string
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  
  // Check minimum length
  if (minLength !== null && value.length < minLength) {
    throw new Error(`${fieldName} must be at least ${minLength} characters long`);
  }
  
  // Check maximum length
  if (maxLength !== null && value.length > maxLength) {
    throw new Error(`${fieldName} must be at most ${maxLength} characters long`);
  }
  
  // Check pattern
  if (pattern !== null && !pattern.test(value)) {
    throw new Error(`${fieldName} has invalid format`);
  }
  
  return true;
};

/**
 * Validate year and month values
 * @param {number} year - Year value
 * @param {number} month - Month value
 * @throws {Error} - Throws error if invalid
 */
const validateYearMonth = (year, month) => {
  validateNumber(year, 'Year', { min: 1900, max: 2100 });
  validateNumber(month, 'Month', { min: 1, max: 12 });
  return true;
};

module.exports = {
  validateNumber,
  validateString,
  validateYearMonth
};
