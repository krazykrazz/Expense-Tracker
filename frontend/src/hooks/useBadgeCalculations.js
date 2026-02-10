/**
 * Badge calculation utilities for ExpenseForm collapsible sections
 * 
 * Pure functions that compute badge text based on form state.
 * Extracted from ExpenseForm.jsx for better testability and reusability.
 */

/**
 * Calculate the future date range preview text
 * @param {string} sourceDate - The source date in YYYY-MM-DD format
 * @param {number} futureMonths - Number of future months
 * @returns {string} Preview text showing the date range
 */
export const calculateFutureDatePreview = (sourceDate, futureMonths) => {
  if (!sourceDate || futureMonths <= 0) return '';
  
  const date = new Date(sourceDate + 'T00:00:00');
  
  // Handle invalid dates
  if (isNaN(date.getTime())) {
    return '';
  }
  
  const sourceDay = date.getDate();
  
  // Calculate the last future month date
  const futureDate = new Date(date);
  futureDate.setMonth(futureDate.getMonth() + futureMonths);
  
  // Handle month-end edge cases
  const targetMonth = futureDate.getMonth();
  const daysInTargetMonth = new Date(futureDate.getFullYear(), targetMonth + 1, 0).getDate();
  
  if (sourceDay > daysInTargetMonth) {
    futureDate.setDate(daysInTargetMonth);
  } else {
    futureDate.setDate(sourceDay);
  }
  
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  
  return `through ${monthNames[futureDate.getMonth()]} ${futureDate.getFullYear()}`;
};

/**
 * Calculate badge text for Advanced Options section (Requirements 2.2)
 * @param {number} futureMonths - Number of future months
 * @param {string} postedDate - Posted date value
 * @returns {string} Badge text or empty string
 */
export const calculateAdvancedOptionsBadge = (futureMonths, postedDate) => {
  const parts = [];
  
  if (futureMonths > 0) {
    parts.push(`Future: ${futureMonths} month${futureMonths > 1 ? 's' : ''}`);
  }
  
  if (postedDate) {
    const date = new Date(postedDate + 'T00:00:00');
    
    // Handle invalid dates
    if (isNaN(date.getTime())) {
      return parts.join(' • ');
    }
    
    const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    parts.push(`Posted: ${formatted}`);
  }
  
  return parts.join(' • ');
};

/**
 * Calculate badge text for Reimbursement section (Requirements 5.2)
 * @param {string} genericOriginalCost - Original cost value
 * @param {string} amount - Net amount value
 * @returns {string} Badge text or empty string
 */
export const calculateReimbursementBadge = (genericOriginalCost, amount) => {
  if (!genericOriginalCost || !amount) return '';
  
  const origCostNum = parseFloat(genericOriginalCost);
  const amountNum = parseFloat(amount);
  
  if (isNaN(origCostNum) || isNaN(amountNum) || origCostNum <= amountNum) return '';
  
  const reimbursed = origCostNum - amountNum;
  return `Reimbursed: $${reimbursed.toFixed(2)}`;
};

/**
 * Calculate badge text for Insurance Tracking section (Requirements 6.2)
 * @param {boolean} insuranceEligible - Whether insurance is enabled
 * @param {string} claimStatus - Current claim status
 * @returns {string} Badge text or empty string
 */
export const calculateInsuranceBadge = (insuranceEligible, claimStatus) => {
  if (!insuranceEligible) return '';

  const statusLabels = {
    'not_claimed': 'Not Claimed',
    'in_progress': 'In Progress',
    'paid': 'Paid',
    'denied': 'Denied'
  };

  return `Claim: ${statusLabels[claimStatus] || 'Not Claimed'}`;
};

/**
 * Calculate badge text for People Assignment section (Requirements 7.2)
 * @param {Array} selectedPeople - Array of selected people
 * @returns {string} Badge text or empty string
 */
export const calculatePeopleBadge = (selectedPeople) => {
  if (!selectedPeople || selectedPeople.length === 0) return '';
  
  const count = selectedPeople.length;
  return `${count} ${count === 1 ? 'person' : 'people'}`;
};

/**
 * Calculate badge text for Invoice Attachments section (Requirements 8.2)
 * @param {Array} invoices - Array of existing invoices
 * @param {Array} invoiceFiles - Array of invoice files to upload
 * @returns {string} Badge text or empty string
 */
export const calculateInvoiceBadge = (invoices, invoiceFiles) => {
  const totalCount = (invoices?.length || 0) + (invoiceFiles?.length || 0);
  if (totalCount === 0) return '';
  
  return `${totalCount} invoice${totalCount === 1 ? '' : 's'}`;
};
