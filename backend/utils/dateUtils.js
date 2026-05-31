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
      // Fallback for other formats — parse as UTC midnight
      const dateObj = new Date(date + 'T00:00:00Z');
      dayOfMonth = dateObj.getUTCDate();
    }
  } else {
    // Use UTC date to avoid local-timezone day shifts
    dayOfMonth = date.getUTCDate();
  }
  
  return Math.ceil(dayOfMonth / 7);
}

/**
 * Get today's date as a YYYY-MM-DD string in the configured business timezone.
 * Delegates to TimeBoundaryService which uses Intl.DateTimeFormat with the
 * BUSINESS_TIMEZONE setting. Falls back to DEFAULT_BUSINESS_TIMEZONE if unavailable.
 * @returns {string} Today's date in YYYY-MM-DD format
 */
function getTodayString() {
  const timeBoundaryService = require('../services/timeBoundaryService');
  const { DEFAULT_BUSINESS_TIMEZONE } = require('../config/timezone');
  return timeBoundaryService.getBusinessDate(new Date(), DEFAULT_BUSINESS_TIMEZONE);
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

  // Truncate to UTC midnight to avoid local-timezone day shifts
  const ref = new Date(referenceDate);
  const today = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));

  const currentDay = today.getUTCDate();
  const currentMonth = today.getUTCMonth();
  const currentYear = today.getUTCFullYear();

  // Determine the intended target month (this month if the due day hasn't
  // passed, otherwise next month). Date.UTC normalizes Dec + 1 into next year.
  const targetMonthIndex = currentDay <= paymentDueDay ? currentMonth : currentMonth + 1;

  // Clamp the due day to the target month's length BEFORE constructing the
  // date. Building the date first (e.g. Date.UTC(year, 1, 31) => Mar 3) would
  // overflow into a later month, after which the month length can no longer be
  // measured correctly.
  const lastDayOfMonth = new Date(Date.UTC(currentYear, targetMonthIndex + 1, 0)).getUTCDate();
  const clampedDay = Math.min(paymentDueDay, lastDayOfMonth);
  const dueDate = new Date(Date.UTC(currentYear, targetMonthIndex, clampedDay));

  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

module.exports = {
  calculateWeek,
  getTodayString,
  calculateDaysUntilDue
};
