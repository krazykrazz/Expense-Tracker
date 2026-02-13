/**
 * Billing Cycle Due Date Derivation
 * 
 * Derives the payment due date from a cycle end date and payment_due_day.
 * The due date is payment_due_day of the month following cycle_end_date,
 * clamped to the last day of that month when payment_due_day exceeds the month's length.
 */

/**
 * Derive the payment due date from cycle end date and payment due day.
 * @param {string} cycleEndDate - Cycle end date in YYYY-MM-DD format
 * @param {number} paymentDueDay - Day of month for payment (1-31)
 * @returns {string} Derived due date in YYYY-MM-DD format
 */
export function deriveDueDate(cycleEndDate, paymentDueDay) {
  // Parse date string directly to avoid timezone issues with new Date()
  const [year, month] = cycleEndDate.split('-').map(Number);

  // Calculate next month and year
  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }

  // Days in the next month
  const daysInNextMonth = new Date(nextYear, nextMonth, 0).getDate();
  const dueDay = Math.min(paymentDueDay, daysInNextMonth);

  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
}
