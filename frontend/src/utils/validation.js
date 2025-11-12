/**
 * Shared validation utilities for forms across the application
 */

/**
 * Validate a name field
 * @param {string} name - The name to validate
 * @param {number} maxLength - Maximum length (default: 100)
 * @returns {string} Error message or empty string if valid
 */
export const validateName = (name, maxLength = 100) => {
  if (!name || !name.trim()) {
    return 'Name is required';
  }
  if (name.trim().length > maxLength) {
    return `Name must not exceed ${maxLength} characters`;
  }
  return '';
};

/**
 * Validate an amount field
 * @param {number|string} amount - The amount to validate
 * @param {boolean} allowNegative - Whether to allow negative numbers (default: false)
 * @returns {string} Error message or empty string if valid
 */
export const validateAmount = (amount, allowNegative = false) => {
  if (amount === '' || amount === null || amount === undefined) {
    return 'Amount is required';
  }
  
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount)) {
    return 'Amount must be a valid number';
  }
  
  if (!allowNegative && numAmount < 0) {
    return 'Amount must be a non-negative number';
  }
  
  // Check for max 2 decimal places
  const decimalPart = amount.toString().split('.')[1];
  if (decimalPart && decimalPart.length > 2) {
    return 'Amount must have at most 2 decimal places';
  }
  
  return '';
};

/**
 * Validate a date field
 * @param {string} date - The date to validate (YYYY-MM-DD format)
 * @returns {string} Error message or empty string if valid
 */
export const validateDate = (date) => {
  if (!date) {
    return 'Date is required';
  }
  
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return 'Date must be in YYYY-MM-DD format';
  }
  
  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) {
    return 'Date must be a valid date';
  }
  
  return '';
};

/**
 * Validate a required field
 * @param {any} value - The value to validate
 * @param {string} fieldName - Name of the field for error message
 * @returns {string} Error message or empty string if valid
 */
export const validateRequired = (value, fieldName = 'Field') => {
  if (value === '' || value === null || value === undefined) {
    return `${fieldName} is required`;
  }
  if (typeof value === 'string' && !value.trim()) {
    return `${fieldName} is required`;
  }
  return '';
};

/**
 * Validate a select/dropdown field
 * @param {any} value - The selected value
 * @param {Array} options - Array of valid options
 * @param {string} fieldName - Name of the field for error message
 * @returns {string} Error message or empty string if valid
 */
export const validateSelect = (value, options, fieldName = 'Selection') => {
  if (!value) {
    return `${fieldName} is required`;
  }
  if (!options.includes(value)) {
    return `Invalid ${fieldName.toLowerCase()} selected`;
  }
  return '';
};

/**
 * Validate string length
 * @param {string} value - The string to validate
 * @param {number} minLength - Minimum length
 * @param {number} maxLength - Maximum length
 * @param {string} fieldName - Name of the field for error message
 * @returns {string} Error message or empty string if valid
 */
export const validateLength = (value, minLength, maxLength, fieldName = 'Field') => {
  if (!value) {
    return '';
  }
  
  const length = value.trim().length;
  
  if (minLength && length < minLength) {
    return `${fieldName} must be at least ${minLength} characters`;
  }
  
  if (maxLength && length > maxLength) {
    return `${fieldName} must not exceed ${maxLength} characters`;
  }
  
  return '';
};

/**
 * Validate year
 * @param {number|string} year - The year to validate
 * @returns {string} Error message or empty string if valid
 */
export const validateYear = (year) => {
  const numYear = parseInt(year);
  if (isNaN(numYear)) {
    return 'Year must be a valid number';
  }
  if (numYear < 1900 || numYear > 2100) {
    return 'Year must be between 1900 and 2100';
  }
  return '';
};

/**
 * Validate month
 * @param {number|string} month - The month to validate (1-12)
 * @returns {string} Error message or empty string if valid
 */
export const validateMonth = (month) => {
  const numMonth = parseInt(month);
  if (isNaN(numMonth)) {
    return 'Month must be a valid number';
  }
  if (numMonth < 1 || numMonth > 12) {
    return 'Month must be between 1 and 12';
  }
  return '';
};
