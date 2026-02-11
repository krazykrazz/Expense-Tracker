const expenseRepository = require('../repositories/expenseRepository');
const expensePeopleRepository = require('../repositories/expensePeopleRepository');
const expenseValidationService = require('./expenseValidationService');
const activityLogService = require('./activityLogService');

class ExpenseInsuranceService {
  /**
   * Update insurance status for a medical expense (quick status update)
   * @param {number} id - Expense ID
   * @param {string} status - New claim status ('not_claimed', 'in_progress', 'paid', 'denied')
   * @returns {Promise<Object|null>} Updated expense or null if not found
   * @throws {Error} If validation fails or expense is not a medical expense
   */
  async updateInsuranceStatus(id, status) {
    // Validate the status
    expenseValidationService.validateInsuranceData({ claim_status: status }, 0);

    // Get the expense to verify it's a medical expense
    const expense = await expenseRepository.findById(id);
    if (!expense) {
      return null;
    }

    if (expense.type !== 'Tax - Medical') {
      throw new Error('Insurance fields are only valid for Tax - Medical expenses');
    }

    if (!expense.insurance_eligible) {
      throw new Error('Expense is not marked as insurance eligible');
    }

    // Update the claim status
    const updatedExpense = await expenseRepository.updateInsuranceFields(id, { claim_status: status });

    if (!updatedExpense) {
      return null;
    }

    // Log insurance status change activity
    await activityLogService.logEvent(
      'insurance_status_changed',
      'expense',
      id,
      `Insurance status changed: ${expense.claim_status || 'None'} → ${status} (${expense.place || 'Unknown'} - $${parseFloat(expense.amount).toFixed(2)})`,
      {
        previousStatus: expense.claim_status || null,
        newStatus: status,
        place: expense.place,
        amount: expense.amount
      }
    );

    // Include people data in the response to preserve UI state
    const people = await expensePeopleRepository.getPeopleForExpense(id);

    return {
      ...updatedExpense,
      people: people || []
    };
  }

  /**
   * Update insurance eligibility for a medical expense
   * @param {number} id - Expense ID
   * @param {boolean} eligible - Whether expense is insurance eligible
   * @param {number} [originalCost] - Original cost (required if eligible is true)
   * @returns {Promise<Object|null>} Updated expense or null if not found
   * @throws {Error} If validation fails or expense is not a medical expense
   */
  async updateInsuranceEligibility(id, eligible, originalCost = null) {
    // Get the expense to verify it's a medical expense
    const expense = await expenseRepository.findById(id);
    if (!expense) {
      return null;
    }

    if (expense.type !== 'Tax - Medical') {
      throw new Error('Insurance fields are only valid for Tax - Medical expenses');
    }

    const insuranceData = {
      insurance_eligible: eligible
    };

    if (eligible) {
      // When setting eligible to true, apply defaults
      insuranceData.claim_status = 'not_claimed';

      // If originalCost is provided, use it; otherwise use current amount
      if (originalCost !== null && originalCost !== undefined) {
        insuranceData.original_cost = parseFloat(originalCost);
      } else {
        insuranceData.original_cost = expense.amount;
      }

      // Validate the insurance data
      expenseValidationService.validateInsuranceData(insuranceData, expense.amount);
    } else {
      // When setting eligible to false, clear insurance fields
      insuranceData.claim_status = null;
      insuranceData.original_cost = null;
    }

    return await expenseRepository.updateInsuranceFields(id, insuranceData);
  }

  /**
   * Apply insurance defaults when creating/updating an expense with insurance_eligible = true
   * @param {Object} expenseData - Expense data
   * @returns {Object} Expense data with defaults applied
   */
  applyInsuranceDefaults(expenseData) {
    // Only apply defaults for medical expenses with insurance_eligible = true
    if (expenseData.type !== 'Tax - Medical' || !expenseData.insurance_eligible) {
      return expenseData;
    }

    const result = { ...expenseData };

    // Default claim_status to 'not_claimed' if not provided
    if (result.claim_status === undefined || result.claim_status === null) {
      result.claim_status = 'not_claimed';
    }

    // Default original_cost to amount if not provided
    if (result.original_cost === undefined || result.original_cost === null) {
      result.original_cost = parseFloat(result.amount);
    }

    return result;
  }
}

module.exports = new ExpenseInsuranceService();
