/**
 * Centralized formatting utilities for consistent data display across the application
 */

/**
 * Format a number as currency with dollar sign
 * @param {number|string} amount - Amount to format
 * @param {boolean} useLocale - Whether to use locale string formatting (default: true)
 * @returns {string} Formatted currency string (e.g., "$1,234.56")
 */
export const formatCurrency = (amount, useLocale = true) => {
  const value = parseFloat(amount || 0);
  if (useLocale) {
    return `$${value.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`;
  }
  return `$${value.toFixed(2)}`;
};

/**
 * Format a date string to readable format
 * @param {string} dateString - Date string (YYYY-MM-DD or ISO format)
 * @returns {string} Formatted date (e.g., "Jan 15, 2025")
 */
export const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
};

/**
 * Format a date string to readable format with time
 * @param {string} dateString - Date string (ISO format)
 * @returns {string} Formatted date and time
 */
export const formatDateTime = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleString();
};

/**
 * Format year and month to readable format
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @param {boolean} longMonth - Use long month name (default: false)
 * @returns {string} Formatted month/year (e.g., "Jan 2025" or "January 2025")
 */
export const formatMonth = (year, month, longMonth = false) => {
  const date = new Date(year, month - 1);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: longMonth ? 'long' : 'short'
  });
};

/**
 * Format year and month to readable format with long month name
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {string} Formatted month/year (e.g., "January 2025")
 */
export const formatMonthYear = (year, month) => {
  return formatMonth(year, month, true);
};

/**
 * Format a month string (YYYY-MM) to readable format
 * @param {string} monthStr - Month string in YYYY-MM format
 * @returns {string} Formatted month or "Ongoing" if empty
 */
export const formatMonthString = (monthStr) => {
  if (!monthStr) return 'Ongoing';
  const [year, month] = monthStr.split('-');
  return formatMonth(parseInt(year), parseInt(month));
};

/**
 * Format a date string for local display (avoiding timezone issues)
 * @param {string} dateString - Date string (YYYY-MM-DD)
 * @returns {string} Formatted date
 */
export const formatLocalDate = (dateString) => {
  if (!dateString) return '';
  // Parse date string (YYYY-MM-DD) to avoid timezone issues
  const [year, month, day] = dateString.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
};

/**
 * Format an amount for display (without currency symbol)
 * @param {number|string} amount - Amount to format
 * @returns {string} Formatted amount (e.g., "1,234.56")
 */
export const formatAmount = (amount) => {
  const value = parseFloat(amount || 0);
  return value.toLocaleString('en-US', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
};
