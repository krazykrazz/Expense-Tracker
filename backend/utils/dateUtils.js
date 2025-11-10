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

module.exports = {
  calculateWeek
};
