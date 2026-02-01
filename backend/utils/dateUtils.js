/**
 * Calculate the week number (1-5) based on the day of the month
 * @param {string|Date} date - Date string (YYYY-MM-DD) or Date object
 * @returns {number} Week number (1-5)
 */
function calculateWeek(date) {
  let dayOfMonth;
  
  if (typeof date === 'string') {
    // Parse YYYY-MM-DD format directly to avoid timezone issues
    const parts = date.split('-');
    if (parts.length === 3) {
      dayOfMonth = parseInt(parts[2], 10);
    } else {
      // Fallback for other formats
      const dateObj = new Date(date + 'T00:00:00');
      dayOfMonth = dateObj.getDate();
    }
  } else {
    dayOfMonth = date.getDate();
  }
  
  return Math.ceil(dayOfMonth / 7);
}

/**
 * Get today's date as a YYYY-MM-DD string in the configured timezone
 * This avoids timezone issues where UTC date differs from local date
 * @returns {string} Today's date in YYYY-MM-DD format
 */
function getTodayString() {
  const { getTimezone } = require('../config/timezone');
  const timezone = getTimezone();
  
  // Use Intl.DateTimeFormat to get the date in the configured timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  // en-CA locale returns YYYY-MM-DD format
  return formatter.format(new Date());
}

module.exports = {
  calculateWeek,
  getTodayString
};
