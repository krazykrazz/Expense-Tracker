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

/**
 * Calculate days until next payment due date
 * Handles month boundaries and months with fewer days
 * @param {number} paymentDueDay - Day of month payment is due (1-31)
 * @param {Date} referenceDate - Reference date (defaults to today)
 * @returns {number|null} Days until due or null if no due day set
 */
function calculateDaysUntilDue(paymentDueDay, referenceDate = new Date()) {
  if (!paymentDueDay || paymentDueDay < 1 || paymentDueDay > 31) {
    return null;
  }

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);
  
  const currentDay = today.getDate();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  
  let dueDate;
  
  if (currentDay <= paymentDueDay) {
    // Due date is this month
    dueDate = new Date(currentYear, currentMonth, paymentDueDay);
  } else {
    // Due date is next month
    dueDate = new Date(currentYear, currentMonth + 1, paymentDueDay);
  }
  
  // Handle months with fewer days
  // If the due day doesn't exist in the target month, use the last day
  const lastDayOfMonth = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0).getDate();
  if (paymentDueDay > lastDayOfMonth) {
    dueDate.setDate(lastDayOfMonth);
  }
  
  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

module.exports = {
  calculateWeek,
  getTodayString,
  calculateDaysUntilDue
};
