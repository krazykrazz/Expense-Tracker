/**
 * useExpenseFormValidation - Pure validation hook for expense form data.
 *
 * Extracted from ExpenseForm.jsx validateForm function.
 * No state, no side effects, no API calls — just validation logic.
 *
 * @returns {{ validate: (formData: Object, options: Object) => { valid: boolean, errors: Array<{ message: string, field: string }> } }}
 */
function useExpenseFormValidation() {
  /**
   * Validate expense form data.
   *
   * @param {Object} formData - { date, amount, type, payment_method_id, place, notes }
   * @param {Object} options
   * @param {boolean} [options.isMedicalExpense] - Whether the expense type is medical
   * @param {boolean} [options.insuranceEligible] - Whether insurance is eligible for this medical expense
   * @param {string}  [options.originalCost] - Original cost string for insurance-eligible expenses
   * @param {boolean} [options.isCreditCard] - Whether the payment method is a credit card
   * @param {string}  [options.postedDate] - Posted date string for credit card expenses
   * @param {boolean} [options.showGenericReimbursementUI] - Whether generic reimbursement UI is shown
   * @param {string}  [options.genericOriginalCost] - Original cost string for generic reimbursement
   * @returns {{ valid: boolean, errors: Array<{ message: string, field: string }> }}
   */
  const validate = (formData, options = {}) => {
    const errors = [];
    const {
      isMedicalExpense = false,
      insuranceEligible = false,
      originalCost = '',
      isCreditCard = false,
      postedDate = '',
      showGenericReimbursementUI = false,
      genericOriginalCost = '',
    } = options;

    // Basic required field validations
    if (!formData.date) {
      errors.push({ message: 'Date is required', field: 'date' });
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      errors.push({ message: 'Amount must be a positive number', field: 'amount' });
    }

    if (!formData.type) {
      errors.push({ message: 'Type is required', field: 'type' });
    }

    if (!formData.payment_method_id) {
      errors.push({ message: 'Payment method is required', field: 'payment_method_id' });
    }

    // Length validations
    if (formData.place && formData.place.length > 200) {
      errors.push({ message: 'Place must be 200 characters or less', field: 'place' });
    }

    if (formData.notes && formData.notes.length > 200) {
      errors.push({ message: 'Notes must be 200 characters or less', field: 'notes' });
    }

    // Insurance validation for medical expenses
    if (isMedicalExpense && insuranceEligible) {
      const amountNum = parseFloat(formData.amount) || 0;
      const origCostNum = parseFloat(originalCost) || 0;

      if (origCostNum <= 0) {
        errors.push({ message: 'Original cost is required for insurance-eligible expenses', field: 'originalCost' });
      }

      if (amountNum > origCostNum) {
        errors.push({ message: 'Out-of-pocket amount cannot exceed original cost', field: 'originalCost' });
      }
    }

    // Posted date validation for credit card expenses
    if (isCreditCard && postedDate && formData.date && postedDate < formData.date) {
      errors.push({ message: 'Posted date cannot be before transaction date', field: 'postedDate' });
    }

    // Generic original cost validation for non-medical expenses with reimbursement
    if (showGenericReimbursementUI && genericOriginalCost) {
      const origCostNum = parseFloat(genericOriginalCost);
      const amountNum = parseFloat(formData.amount) || 0;

      if (isNaN(origCostNum) || origCostNum < 0) {
        errors.push({ message: 'Original cost must be a non-negative number', field: 'genericOriginalCost' });
      }

      if (amountNum > origCostNum) {
        errors.push({ message: 'Net amount cannot exceed original cost', field: 'genericOriginalCost' });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  };

  return { validate };
}

export default useExpenseFormValidation;
