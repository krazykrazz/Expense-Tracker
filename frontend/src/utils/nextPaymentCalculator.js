/**
 * Next Payment Date Calculator
 * 
 * Calculates the next mortgage payment date based on payment_due_day
 * from linked fixed expenses. Mirrors backend/utils/dateUtils.js
 * calculateDaysUntilDue logic.
 */

/**
 * Get the last day of a given month.
 * @param {number} year - Full year (e.g., 2025)
 * @param {number} month - 0-indexed month (0=Jan, 11=Dec)
 * @returns {number} Last day of the month (28-31)
 */
export function getLastDayOfMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Calculate the next payment date based on payment_due_day and current date.
 * Mirrors backend/utils/dateUtils.js calculateDaysUntilDue logic.
 * 
 * @param {number} paymentDueDay - Day of month (1-31)
 * @param {Date} [referenceDate=new Date()] - Reference date
 * @returns {{ nextDate: Date, daysUntil: number } | null} Next payment info or null if invalid
 */
export function calculateNextPaymentDate(paymentDueDay, referenceDate = new Date()) {
  if (!paymentDueDay || paymentDueDay < 1 || paymentDueDay > 31) {
    return null;
  }

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  const currentDay = today.getDate();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  let targetMonth;
  let targetYear;

  // Determine the target month first, using the effective due day
  // (clamped to the last day of the current month) for comparison
  const lastDayCurrentMonth = getLastDayOfMonth(currentYear, currentMonth);
  const effectiveDueDay = Math.min(paymentDueDay, lastDayCurrentMonth);

  if (currentDay <= effectiveDueDay) {
    // Due date is this month
    targetMonth = currentMonth;
    targetYear = currentYear;
  } else {
    // Due date is next month
    targetMonth = currentMonth + 1;
    targetYear = currentYear;
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear += 1;
    }
  }

  // Clamp the due day to the last day of the target month
  const lastDayTargetMonth = getLastDayOfMonth(targetYear, targetMonth);
  const actualDay = Math.min(paymentDueDay, lastDayTargetMonth);

  const dueDate = new Date(targetYear, targetMonth, actualDay);

  const diffTime = dueDate.getTime() - today.getTime();
  const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return {
    nextDate: dueDate,
    daysUntil
  };
}

/**
 * Format a next payment date for user-friendly display.
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string (e.g., "January 15, 2025")
 */
export function formatNextPaymentDate(date) {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Classify payment urgency based on days until next payment.
 * 
 * @param {number} daysUntil - Number of days until next payment (integer >= 0)
 * @returns {{ isPaymentToday: boolean, isPaymentSoon: boolean, urgency: string }}
 *   - isPaymentToday: true when daysUntil === 0
 *   - isPaymentSoon: true when daysUntil >= 0 && daysUntil <= 7 (includes today)
 *   - urgency: "today" | "soon" | "normal"
 */
export function classifyPaymentUrgency(daysUntil) {
  const isPaymentToday = daysUntil === 0;
  const isPaymentSoon = daysUntil >= 0 && daysUntil <= 7;

  let urgency;
  if (isPaymentToday) {
    urgency = 'today';
  } else if (isPaymentSoon) {
    urgency = 'soon';
  } else {
    urgency = 'normal';
  }

  return { isPaymentToday, isPaymentSoon, urgency };
}
