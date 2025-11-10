/**
 * Calculate the week number (1-5) based on the day of the month
 * @param {string|Date} date - Date string (YYYY-MM-DD) or Date object
 * @returns {number} Week number (1-5)
 */
function calculateWeek(date) {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const dayOfMonth = dateObj.getDate();
  return Math.ceil(dayOfMonth / 7);
}

module.exports = {
  calculateWeek
};
