const { CATEGORIES, normalizeCategory } = require('../utils/categories');
const VALID_CLAIM_STATUSES = ['not_claimed', 'in_progress', 'paid', 'denied'];

class ExpenseValidationService {
  validateExpense(expense) {
    const errors = [];
    if (!expense.date) errors.push('Date is required');
    if (expense.amount === undefined || expense.amount === null) errors.push('Amount is required');
    if (!expense.type) errors.push('Type is required');
    if (!expense.payment_method_id && !expense.method) errors.push('Payment method is required');
    if (expense.date && !this.isValidDate(expense.date)) errors.push('Date must be a valid date in YYYY-MM-DD format');
    if (expense.amount !== undefined && expense.amount !== null) {
      const amount = parseFloat(expense.amount);
      if (isNaN(amount) || amount <= 0) errors.push('Amount must be a positive number');
      if (!/^\d+(\.\d{1,2})?$/.test(expense.amount.toString())) errors.push('Amount must have at most 2 decimal places');
    }
    // Normalize legacy category names (e.g., "Vehicle Maintenance" → "Automotive")
    if (expense.type) {
      expense.type = normalizeCategory(expense.type);
      if (!CATEGORIES.includes(expense.type)) errors.push(`Type must be one of: ${CATEGORIES.join(', ')}`);
    }
    if (expense.place && expense.place.length > 200) errors.push('Place must not exceed 200 characters');
    if (expense.notes && expense.notes.length > 200) errors.push('Notes must not exceed 200 characters');
    if (errors.length > 0) throw new Error(errors.join('; '));
  }

  isValidDate(dateString) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date) && dateString.match(/^\d{4}-\d{2}-\d{2}$/);
  }

  validatePostedDate(expense) {
    if (expense.posted_date === undefined || expense.posted_date === null || expense.posted_date === '') return;
    if (!this.isValidDate(expense.posted_date)) throw new Error('Posted date must be a valid date in YYYY-MM-DD format');
    if (expense.date && expense.posted_date < expense.date) throw new Error('Posted date cannot be before transaction date');
  }

  validateInsuranceData(insuranceData, expenseAmount) {
    const errors = [];
    if (!insuranceData) return;
    if (insuranceData.claim_status !== undefined && insuranceData.claim_status !== null) {
      if (!VALID_CLAIM_STATUSES.includes(insuranceData.claim_status))
        errors.push(`Claim status must be one of: ${VALID_CLAIM_STATUSES.join(', ')}`);
    }
    if (insuranceData.original_cost !== undefined && insuranceData.original_cost !== null) {
      const oc = parseFloat(insuranceData.original_cost);
      if (isNaN(oc) || oc < 0) errors.push('Original cost must be a non-negative number');
    }
    if (insuranceData.original_cost !== undefined && insuranceData.original_cost !== null) {
      const oc = parseFloat(insuranceData.original_cost);
      const amt = parseFloat(expenseAmount);
      if (!isNaN(oc) && !isNaN(amt) && amt > oc) errors.push('Out-of-pocket amount cannot exceed original cost');
    }
    if (errors.length > 0) throw new Error(errors.join('; '));
  }

  validateReimbursement(reimbursement, originalAmount) {
    if (reimbursement === undefined || reimbursement === null || reimbursement === '' || reimbursement === 0) return;
    const reimbursementNum = parseFloat(reimbursement);
    const originalNum = parseFloat(originalAmount);
    if (isNaN(reimbursementNum) || reimbursementNum < 0) throw new Error('Reimbursement must be a non-negative number');
    if (!isNaN(originalNum) && reimbursementNum > originalNum) throw new Error('Reimbursement cannot exceed the expense amount');
  }

  validateInsurancePersonAllocations(personAllocations) {
    if (!personAllocations || !Array.isArray(personAllocations)) return;
    const errors = [];
    for (const alloc of personAllocations) {
      if (alloc.originalAmount !== undefined && alloc.originalAmount !== null) {
        const amt = parseFloat(alloc.amount);
        const origAmt = parseFloat(alloc.originalAmount);
        if (!isNaN(amt) && !isNaN(origAmt) && amt > origAmt)
          errors.push(`Person allocation amount (${amt.toFixed(2)}) cannot exceed their original cost allocation (${origAmt.toFixed(2)})`);
      }
    }
    if (errors.length > 0) throw new Error(errors.join('; '));
  }

  validatePersonAllocations(totalAmount, allocations) {
    if (!allocations || !Array.isArray(allocations)) throw new Error('Person allocations must be an array');
    if (allocations.length === 0) throw new Error('At least one person allocation is required');
    for (const alloc of allocations) {
      if (!alloc.personId || typeof alloc.personId !== 'number' || alloc.personId <= 0) throw new Error('Each allocation must have a valid personId');
      if (alloc.amount === undefined || alloc.amount === null) throw new Error('Each allocation must have an amount');
      const amt = parseFloat(alloc.amount);
      if (isNaN(amt) || amt <= 0) throw new Error('Each allocation amount must be a positive number');
      if (!/^\d+(\.\d{1,2})?$/.test(alloc.amount.toString())) throw new Error('Allocation amounts must have at most 2 decimal places');
    }
    const pids = allocations.map(a => a.personId);
    if (pids.length !== [...new Set(pids)].length) throw new Error('Cannot allocate to the same person multiple times');
    const total = allocations.reduce((s, a) => s + parseFloat(a.amount), 0);
    if (Math.abs(total - totalAmount) > 0.005) throw new Error(`Total allocated amount (${total.toFixed(2)}) must equal expense amount (${totalAmount.toFixed(2)})`);
  }
}

ExpenseValidationService.VALID_CLAIM_STATUSES = VALID_CLAIM_STATUSES;
module.exports = new ExpenseValidationService();
