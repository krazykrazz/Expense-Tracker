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
  
  // Handle YYYY-MM-DD format as local date (not UTC)
  // This prevents timezone issues where "2026-02-01" becomes "Jan 31" in EST
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  }
  
  // For ISO format with time, use standard parsing
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

/**
 * Get today's date in YYYY-MM-DD format using local timezone
 * This avoids timezone issues where new Date().toISOString() might return
 * a different date than the user's local date
 * @returns {string} Today's date in YYYY-MM-DD format
 */
export const getTodayLocalDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Convert a Date object to YYYY-MM-DD format using local timezone
 * @param {Date} date - Date object to convert
 * @returns {string} Date in YYYY-MM-DD format
 */
export const dateToLocalString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Get current year-month in YYYY-MM format using local timezone
 * @returns {string} Current year-month in YYYY-MM format
 */
export const getCurrentYearMonth = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

/**
 * Get short month name from month number
 * @param {number} monthNum - Month number (1-12)
 * @returns {string} Short month name (e.g., "Jan", "Feb")
 */
export const getMonthNameShort = (monthNum) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[monthNum - 1] || '';
};

/**
 * Get long month name from month number
 * @param {number} monthNum - Month number (1-12)
 * @returns {string} Long month name (e.g., "January", "February")
 */
export const getMonthNameLong = (monthNum) => {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[monthNum - 1] || '';
};
