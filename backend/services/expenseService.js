const expenseRepository = require('../repositories/expenseRepository');
const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const expensePeopleRepository = require('../repositories/expensePeopleRepository');
const loanService = require('./loanService');
const investmentService = require('./investmentService');
const { calculateWeek } = require('../utils/dateUtils');
const { CATEGORIES } = require('../utils/categories');
const { validateYearMonth } = require('../utils/validators');
const { PAYMENT_METHODS } = require('../utils/constants');
const budgetEvents = require('../events/budgetEvents');

class ExpenseService {
  /**
   * Validate expense data
   * @param {Object} expense - Expense data to validate
   * @throws {Error} If validation fails
   */
  validateExpense(expense) {
    const errors = [];

    // Required fields validation
    if (!expense.date) {
      errors.push('Date is required');
    }

    if (expense.amount === undefined || expense.amount === null) {
      errors.push('Amount is required');
    }

    if (!expense.type) {
      errors.push('Type is required');
    }

    if (!expense.method) {
      errors.push('Payment method is required');
    }

    // Data type validation
    if (expense.date && !this.isValidDate(expense.date)) {
      errors.push('Date must be a valid date in YYYY-MM-DD format');
    }

    if (expense.amount !== undefined && expense.amount !== null) {
      const amount = parseFloat(expense.amount);
      if (isNaN(amount) || amount <= 0) {
        errors.push('Amount must be a positive number');
      }
      // Check for max 2 decimal places
      if (!/^\d+(\.\d{1,2})?$/.test(expense.amount.toString())) {
        errors.push('Amount must have at most 2 decimal places');
      }
    }

    // Type validation
    if (expense.type && !CATEGORIES.includes(expense.type)) {
      errors.push(`Type must be one of: ${CATEGORIES.join(', ')}`);
    }

    // Method validation
    if (expense.method && !PAYMENT_METHODS.includes(expense.method)) {
      errors.push(`Payment method must be one of: ${PAYMENT_METHODS.join(', ')}`);
    }

    // String length validation
    if (expense.place && expense.place.length > 200) {
      errors.push('Place must not exceed 200 characters');
    }

    if (expense.notes && expense.notes.length > 200) {
      errors.push('Notes must not exceed 200 characters');
    }

    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }
  }

  /**
   * Check if a date string is valid
   * @param {string} dateString - Date string to validate
   * @returns {boolean} True if valid
   */
  isValidDate(dateString) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date) && dateString.match(/^\d{4}-\d{2}-\d{2}$/);
  }

  /**
   * Valid claim status values for insurance tracking
   * @type {Array<string>}
   */
  static VALID_CLAIM_STATUSES = ['not_claimed', 'in_progress', 'paid', 'denied'];

  /**
   * Validate insurance data for a medical expense
   * @param {Object} insuranceData - Insurance data to validate
   * @param {boolean} [insuranceData.insurance_eligible] - Whether expense is insurance eligible
   * @param {string} [insuranceData.claim_status] - Claim status
   * @param {number} [insuranceData.original_cost] - Original cost before reimbursement
   * @param {number} expenseAmount - Current expense amount (out-of-pocket)
   * @throws {Error} If validation fails
   */
  validateInsuranceData(insuranceData, expenseAmount) {
    const errors = [];

    // If no insurance data provided, nothing to validate
    if (!insuranceData) {
      return;
    }

    // Validate claim_status enum values (Requirement 2.2)
    if (insuranceData.claim_status !== undefined && insuranceData.claim_status !== null) {
      if (!ExpenseService.VALID_CLAIM_STATUSES.includes(insuranceData.claim_status)) {
        errors.push(`Claim status must be one of: ${ExpenseService.VALID_CLAIM_STATUSES.join(', ')}`);
      }
    }

    // Validate original_cost is a positive number
    if (insuranceData.original_cost !== undefined && insuranceData.original_cost !== null) {
      const originalCost = parseFloat(insuranceData.original_cost);
      if (isNaN(originalCost) || originalCost < 0) {
        errors.push('Original cost must be a non-negative number');
      }
    }

    // Validate amount <= original_cost (Requirement 3.5)
    if (insuranceData.original_cost !== undefined && insuranceData.original_cost !== null) {
      const originalCost = parseFloat(insuranceData.original_cost);
      const amount = parseFloat(expenseAmount);
      
      if (!isNaN(originalCost) && !isNaN(amount) && amount > originalCost) {
        errors.push('Out-of-pocket amount cannot exceed original cost');
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }
  }

  /**
   * Validate person allocations for insurance expenses
   * Ensures per-person out-of-pocket amounts don't exceed their original cost allocations
   * @param {Array} personAllocations - Array of {personId, amount, originalAmount} objects
   * @throws {Error} If validation fails (Requirement 4.4)
   */
  validateInsurancePersonAllocations(personAllocations) {
    if (!personAllocations || !Array.isArray(personAllocations)) {
      return;
    }

    const errors = [];

    for (const allocation of personAllocations) {
      // Only validate if originalAmount is provided (insurance expense)
      if (allocation.originalAmount !== undefined && allocation.originalAmount !== null) {
        const amount = parseFloat(allocation.amount);
        const originalAmount = parseFloat(allocation.originalAmount);

        if (!isNaN(amount) && !isNaN(originalAmount) && amount > originalAmount) {
          errors.push(`Person allocation amount (${amount.toFixed(2)}) cannot exceed their original cost allocation (${originalAmount.toFixed(2)})`);
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }
  }

  /**
   * Update insurance status for a medical expense (quick status update)
   * @param {number} id - Expense ID
   * @param {string} status - New claim status ('not_claimed', 'in_progress', 'paid', 'denied')
   * @returns {Promise<Object|null>} Updated expense or null if not found
   * @throws {Error} If validation fails or expense is not a medical expense
   * _Requirements: 5.1, 5.2, 5.3, 5.4_
   */
  async updateInsuranceStatus(id, status) {
    // Validate the status
    this.validateInsuranceData({ claim_status: status }, 0);

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
    return await expenseRepository.updateInsuranceFields(id, { claim_status: status });
  }

  /**
   * Update insurance eligibility for a medical expense
   * @param {number} id - Expense ID
   * @param {boolean} eligible - Whether expense is insurance eligible
   * @param {number} [originalCost] - Original cost (required if eligible is true)
   * @returns {Promise<Object|null>} Updated expense or null if not found
   * @throws {Error} If validation fails or expense is not a medical expense
   * _Requirements: 1.2, 1.3_
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
      // When setting eligible to true, apply defaults (Requirement 2.4, 2.5)
      insuranceData.claim_status = 'not_claimed';
      
      // If originalCost is provided, use it; otherwise use current amount
      if (originalCost !== null && originalCost !== undefined) {
        insuranceData.original_cost = parseFloat(originalCost);
      } else {
        insuranceData.original_cost = expense.amount;
      }

      // Validate the insurance data
      this.validateInsuranceData(insuranceData, expense.amount);
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
   * @private
   * _Requirements: 1.2, 2.4, 2.5_
   */
  _applyInsuranceDefaults(expenseData) {
    // Only apply defaults for medical expenses with insurance_eligible = true
    if (expenseData.type !== 'Tax - Medical' || !expenseData.insurance_eligible) {
      return expenseData;
    }

    const result = { ...expenseData };

    // Default claim_status to 'not_claimed' if not provided (Requirement 2.4)
    if (result.claim_status === undefined || result.claim_status === null) {
      result.claim_status = 'not_claimed';
    }

    // Default original_cost to amount if not provided
    if (result.original_cost === undefined || result.original_cost === null) {
      result.original_cost = parseFloat(result.amount);
    }

    // Note: Amount represents out-of-pocket cost and should NOT be overwritten
    // Original cost is informational only - the user controls the amount field

    return result;
  }

  /**
   * Trigger budget recalculation for affected budgets
   * This is called after expense operations to ensure budget progress is updated
   * Uses event emitter to avoid circular dependency with budgetService
   * @param {string} date - Expense date (YYYY-MM-DD)
   * @param {string} category - Expense category
   * @private
   */
  _triggerBudgetRecalculation(date, category) {
    // Only emit event for budgetable categories
    const { BUDGETABLE_CATEGORIES } = require('../utils/categories');
    if (BUDGETABLE_CATEGORIES.includes(category)) {
      budgetEvents.emitBudgetRecalculation(date, category);
    }
  }

  /**
   * Calculate a future date by adding months to a source date
   * Preserves the day of month when possible, otherwise uses the last day of the target month
   * @param {string} sourceDate - Source date in YYYY-MM-DD format
   * @param {number} monthsAhead - Number of months to add (1-12)
   * @returns {string} Future date in YYYY-MM-DD format
   * @private
   */
  _calculateFutureDate(sourceDate, monthsAhead) {
    // Parse the source date
    const [year, month, day] = sourceDate.split('-').map(Number);
    const sourceDay = day;
    
    // Calculate target year and month
    let targetMonth = month + monthsAhead;
    let targetYear = year;
    
    // Handle year rollover
    while (targetMonth > 12) {
      targetMonth -= 12;
      targetYear += 1;
    }
    
    // Get the number of days in the target month
    // Using day 0 of the next month gives us the last day of the target month
    const daysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
    
    // Use the source day if it exists in the target month, otherwise use the last day
    const targetDay = sourceDay > daysInTargetMonth ? daysInTargetMonth : sourceDay;
    
    // Format as YYYY-MM-DD
    const yearStr = targetYear.toString();
    const monthStr = targetMonth.toString().padStart(2, '0');
    const dayStr = targetDay.toString().padStart(2, '0');
    
    return `${yearStr}-${monthStr}-${dayStr}`;
  }

  /**
   * Validate futureMonths parameter
   * @param {number} futureMonths - Number of future months (0-12)
   * @throws {Error} If validation fails
   * @private
   */
  _validateFutureMonths(futureMonths) {
    if (futureMonths === undefined || futureMonths === null) {
      return; // Optional parameter, default to 0
    }
    
    if (!Number.isInteger(futureMonths)) {
      throw new Error('Future months must be a whole number');
    }
    
    if (futureMonths < 0 || futureMonths > 12) {
      throw new Error('Future months must be between 0 and 12');
    }
  }

  /**
   * Validate that all people in the allocations exist in the database
   * @param {Array} personAllocations - Array of {personId, amount} objects
   * @throws {Error} If any person does not exist
   * @private
   */
  async _validatePeopleExist(personAllocations) {
    const peopleRepository = require('../repositories/peopleRepository');
    
    for (const allocation of personAllocations) {
      const person = await peopleRepository.findById(allocation.personId);
      if (!person) {
        throw new Error(`Person with ID ${allocation.personId} does not exist. Please add people in the People Management section first.`);
      }
    }
  }

  /**
   * Create a single expense (internal helper)
   * @param {Object} expenseData - Expense data
   * @returns {Promise<Object>} Created expense
   * @private
   */
  async _createSingleExpense(expenseData) {
    // Apply insurance defaults if applicable
    const processedData = this._applyInsuranceDefaults(expenseData);

    // Validate insurance data if provided
    if (processedData.insurance_eligible) {
      this.validateInsuranceData(
        {
          insurance_eligible: processedData.insurance_eligible,
          claim_status: processedData.claim_status,
          original_cost: processedData.original_cost
        },
        processedData.amount
      );
    }

    // Calculate week from date
    const week = calculateWeek(processedData.date);

    // Prepare expense object with calculated week
    const expense = {
      date: processedData.date,
      place: processedData.place || null,
      notes: processedData.notes || null,
      amount: parseFloat(processedData.amount),
      type: processedData.type,
      week: week,
      method: processedData.method,
      recurring_id: processedData.recurring_id !== undefined ? processedData.recurring_id : null,
      is_generated: processedData.is_generated !== undefined ? processedData.is_generated : 0,
      // Insurance fields (only meaningful for Tax - Medical)
      insurance_eligible: processedData.insurance_eligible ? 1 : 0,
      claim_status: processedData.claim_status || null,
      original_cost: processedData.original_cost !== undefined ? processedData.original_cost : null
    };

    // Create expense in repository
    const createdExpense = await expenseRepository.create(expense);

    // Trigger budget recalculation for affected budget
    this._triggerBudgetRecalculation(expense.date, expense.type);

    return createdExpense;
  }

  /**
   * Create a new expense with optional future months
   * @param {Object} expenseData - Expense data
   * @param {number} futureMonths - Number of future months to create (0-12, default 0)
   * @returns {Promise<Object>} Created expense with futureExpenses array
   */
  async createExpense(expenseData, futureMonths = 0) {
    // Validate the expense data
    this.validateExpense(expenseData);
    
    // Validate futureMonths parameter
    this._validateFutureMonths(futureMonths);
    
    // Normalize futureMonths to 0 if not provided
    const monthsToCreate = futureMonths || 0;

    // Create source expense
    const sourceExpense = await this._createSingleExpense(expenseData);
    
    // If no future months requested, return simple response for backward compatibility
    if (monthsToCreate === 0) {
      return sourceExpense;
    }

    // Create future expenses
    const futureExpenses = [];
    const createdExpenseIds = [sourceExpense.id];
    
    try {
      for (let i = 1; i <= monthsToCreate; i++) {
        const futureDate = this._calculateFutureDate(expenseData.date, i);
        
        // Create future expense with same data but different date
        const futureExpenseData = {
          ...expenseData,
          date: futureDate
        };
        
        const futureExpense = await this._createSingleExpense(futureExpenseData);
        futureExpenses.push(futureExpense);
        createdExpenseIds.push(futureExpense.id);
        
        // If this is a medical expense with people allocations, copy them
        // Note: People allocations are handled by createExpenseWithPeople, not here
        // Invoices are NOT copied (they are unique per expense)
      }
    } catch (error) {
      // Rollback: delete all created expenses on error (atomicity)
      for (const expenseId of createdExpenseIds) {
        try {
          await expenseRepository.delete(expenseId);
        } catch (deleteError) {
          // Log but continue cleanup
          const logger = require('../config/logger');
          logger.error('Error during rollback cleanup:', deleteError);
        }
      }
      throw new Error('Failed to create future expenses. Please try again.');
    }

    // Return response with source expense and futureExpenses array
    return {
      expense: sourceExpense,
      futureExpenses: futureExpenses
    };
  }

  /**
   * Get all expenses with optional filters
   * @param {Object} filters - Optional filters { year, month }
   * @returns {Promise<Array>} Array of expenses with people data for medical expenses
   */
  async getExpenses(filters = {}) {
    const expenses = await expenseRepository.findAll(filters);
    
    // Get medical expense IDs to fetch people data
    const medicalExpenseIds = expenses
      .filter(e => e.type === 'Tax - Medical')
      .map(e => e.id);
    
    // Fetch people data for medical expenses
    let peopleByExpense = {};
    if (medicalExpenseIds.length > 0) {
      peopleByExpense = await expensePeopleRepository.getPeopleForExpenses(medicalExpenseIds);
    }
    
    // Attach people data to medical expenses
    return expenses.map(expense => {
      if (expense.type === 'Tax - Medical') {
        return {
          ...expense,
          people: peopleByExpense[expense.id] || []
        };
      }
      return expense;
    });
  }

  /**
   * Get a single expense by ID
   * @param {number} id - Expense ID
   * @returns {Promise<Object|null>} Expense or null
   */
  async getExpenseById(id) {
    return await expenseRepository.findById(id);
  }

  /**
   * Update an expense with optional future months
   * @param {number} id - Expense ID
   * @param {Object} expenseData - Updated expense data
   * @param {number} futureMonths - Number of future months to create (0-12, default 0)
   * @returns {Promise<Object|null>} Updated expense with futureExpenses array or null
   */
  async updateExpense(id, expenseData, futureMonths = 0) {
    // Get the old expense data before updating
    const oldExpense = await expenseRepository.findById(id);

    // Validate the expense data
    this.validateExpense(expenseData);

    // Validate futureMonths parameter
    this._validateFutureMonths(futureMonths);

    // Apply insurance defaults if applicable
    const processedData = this._applyInsuranceDefaults(expenseData);

    // Validate insurance data if provided
    if (processedData.insurance_eligible) {
      this.validateInsuranceData(
        {
          insurance_eligible: processedData.insurance_eligible,
          claim_status: processedData.claim_status,
          original_cost: processedData.original_cost
        },
        processedData.amount
      );
    }

    // Normalize futureMonths to 0 if not provided
    const monthsToCreate = futureMonths || 0;

    // Calculate week from date
    const week = calculateWeek(processedData.date);

    // Prepare expense object with calculated week
    const expense = {
      date: processedData.date,
      place: processedData.place || null,
      notes: processedData.notes || null,
      amount: parseFloat(processedData.amount),
      type: processedData.type,
      week: week,
      method: processedData.method,
      // Insurance fields (only meaningful for Tax - Medical)
      insurance_eligible: processedData.insurance_eligible ? 1 : 0,
      claim_status: processedData.claim_status || null,
      original_cost: processedData.original_cost !== undefined ? processedData.original_cost : null
    };

    // Update expense in repository
    const updatedExpense = await expenseRepository.update(id, expense);

    // Trigger budget recalculation for affected budgets
    if (oldExpense) {
      // If category, amount, or date changed, recalculate old budget
      const categoryChanged = oldExpense.type !== expense.type;
      const amountChanged = oldExpense.amount !== expense.amount;
      const dateChanged = oldExpense.date !== expense.date;

      if (categoryChanged || amountChanged || dateChanged) {
        // Recalculate old budget (old category and date)
        this._triggerBudgetRecalculation(oldExpense.date, oldExpense.type);

        // If category or date changed, also recalculate new budget
        if (categoryChanged || dateChanged) {
          this._triggerBudgetRecalculation(expense.date, expense.type);
        }
      }
    }

    // If no future months requested, return simple response for backward compatibility
    if (monthsToCreate === 0) {
      return updatedExpense;
    }

    // Create future expenses with updated values (Requirement 2.3, 2.4)
    const futureExpenses = [];
    const createdExpenseIds = [];
    
    try {
      for (let i = 1; i <= monthsToCreate; i++) {
        const futureDate = this._calculateFutureDate(processedData.date, i);
        
        // Create future expense with updated values (not original values)
        const futureExpenseData = {
          ...processedData,
          date: futureDate
        };
        
        const futureExpense = await this._createSingleExpense(futureExpenseData);
        futureExpenses.push(futureExpense);
        createdExpenseIds.push(futureExpense.id);
        
        // Note: People allocations are handled by updateExpenseWithPeople
        // Invoices are NOT copied (they are unique per expense)
      }
    } catch (error) {
      // Rollback: delete all created future expenses on error (atomicity)
      for (const expenseId of createdExpenseIds) {
        try {
          await expenseRepository.delete(expenseId);
        } catch (deleteError) {
          // Log but continue cleanup
          const logger = require('../config/logger');
          logger.error('Error during rollback cleanup:', deleteError);
        }
      }
      throw new Error('Failed to create future expenses. Please try again.');
    }

    // Return response with updated expense and futureExpenses array
    return {
      expense: updatedExpense,
      futureExpenses: futureExpenses
    };
  }

  /**
   * Delete an expense
   * @param {number} id - Expense ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteExpense(id) {
    // Get the expense data before deleting
    const expense = await expenseRepository.findById(id);

    // Delete the expense
    const deleted = await expenseRepository.delete(id);

    // Trigger budget recalculation for affected budget
    if (deleted && expense) {
      this._triggerBudgetRecalculation(expense.date, expense.type);
    }

    return deleted;
  }

  /**
   * Get summary data for a specific month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @param {boolean} includePrevious - Whether to include previous month data
   * @returns {Promise<Object>} Summary object with current and optional previous month data
   */
  async getSummary(year, month, includePrevious = false) {
    // Validate year and month
    validateYearMonth(year, month);

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (isNaN(yearNum) || isNaN(monthNum)) {
      throw new Error('Year and month must be valid numbers');
    }

    if (monthNum < 1 || monthNum > 12) {
      throw new Error('Month must be between 1 and 12');
    }

    // Get current month summary
    const current = await this._getMonthSummary(yearNum, monthNum);
    
    // If includePrevious is false, return just the current summary
    if (!includePrevious) {
      return current;
    }
    
    // Calculate previous month and get its summary
    const { prevYear, prevMonth } = this._calculatePreviousMonth(yearNum, monthNum);
    const previous = await this._getMonthSummary(prevYear, prevMonth);
    
    // Return both current and previous month data
    return { current, previous };
  }

  /**
   * Get complete summary for a specific month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Object>} Complete month summary
   * @private
   */
  async _getMonthSummary(year, month) {
    // Fetch all data in parallel for better performance
    const [summary, monthlyGross, totalFixedExpenses, loans, fixedCategoryTotals, fixedPaymentTotals, investments] = await Promise.all([
      expenseRepository.getSummary(year, month),
      expenseRepository.getMonthlyGross(year, month),
      fixedExpenseRepository.getTotalFixedExpenses(year, month),
      loanService.getLoansForMonth(year, month),
      fixedExpenseRepository.getCategoryTotals(year, month),
      fixedExpenseRepository.getPaymentTypeTotals(year, month),
      investmentService.getAllInvestments()
    ]);
    
    // Calculate total outstanding debt from active loans
    const totalOutstandingDebt = loanService.calculateTotalOutstandingDebt(loans);
    
    // Calculate total investment value from all investments
    const totalInvestmentValue = investmentService.calculateTotalInvestmentValue(investments);
    
    // Combine category totals (regular + fixed)
    const combinedCategoryTotals = { ...summary.typeTotals };
    if (fixedCategoryTotals) {
      Object.keys(fixedCategoryTotals).forEach(category => {
        combinedCategoryTotals[category] = (combinedCategoryTotals[category] || 0) + fixedCategoryTotals[category];
      });
    }
    
    // Combine payment type totals (regular + fixed)
    const combinedMethodTotals = { ...summary.methodTotals };
    if (fixedPaymentTotals) {
      Object.keys(fixedPaymentTotals).forEach(method => {
        combinedMethodTotals[method] = (combinedMethodTotals[method] || 0) + fixedPaymentTotals[method];
      });
    }
    
    // Build complete summary object
    return {
      ...summary,
      typeTotals: combinedCategoryTotals,
      methodTotals: combinedMethodTotals,
      monthlyGross: monthlyGross || 0,
      totalFixedExpenses: totalFixedExpenses || 0,
      totalExpenses: summary.total + (totalFixedExpenses || 0),
      netBalance: (monthlyGross || 0) - (summary.total + (totalFixedExpenses || 0)),
      loans,
      totalOutstandingDebt,
      investments,
      totalInvestmentValue
    };
  }

  /**
   * Calculate previous month with year rollover handling
   * @param {number} year - Current year
   * @param {number} month - Current month
   * @returns {Object} Previous month { prevYear, prevMonth }
   * @private
   */
  _calculatePreviousMonth(year, month) {
    let prevYear = year;
    let prevMonth = month - 1;
    
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear = year - 1;
    }
    
    return { prevYear, prevMonth };
  }

  /**
   * Get monthly gross income
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<number|null>} Gross amount
   */
  async getMonthlyGross(year, month) {
    return await expenseRepository.getMonthlyGross(year, month);
  }

  /**
   * Set monthly gross income
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @param {number} grossAmount - Gross income amount
   * @returns {Promise<Object>} Updated record
   */
  async setMonthlyGross(year, month, grossAmount) {
    // Validate inputs
    if (!year || !month || grossAmount === undefined || grossAmount === null) {
      throw new Error('Year, month, and gross amount are required');
    }

    const amount = parseFloat(grossAmount);
    if (isNaN(amount) || amount < 0) {
      throw new Error('Gross amount must be a non-negative number');
    }

    return await expenseRepository.setMonthlyGross(year, month, amount);
  }

  /**
   * Get annual summary data
   * @param {number} year - Year
   * @returns {Promise<Object>} Annual summary object
   */
  async getAnnualSummary(year) {
    // Fetch all data in parallel
    const [
      monthlyVariableExpenses,
      monthlyFixedExpenses,
      monthlyIncome,
      categoryTotals,
      methodTotals,
      yearEndInvestments,
      yearEndLoans
    ] = await Promise.all([
      this._getMonthlyVariableExpenses(year),
      this._getMonthlyFixedExpenses(year),
      this._getMonthlyIncome(year),
      this._getCategoryTotals(year),
      this._getMethodTotals(year),
      this._getYearEndInvestmentValues(year),
      this._getYearEndLoanBalances(year)
    ]);

    // Calculate net worth components
    const totalAssets = yearEndInvestments.reduce((sum, inv) => sum + inv.value, 0);
    const totalLiabilities = yearEndLoans.reduce((sum, loan) => sum + loan.remaining_balance, 0);
    const netWorth = totalAssets - totalLiabilities;

    // Build summary from fetched data
    const summary = this._buildAnnualSummary(
      year,
      monthlyVariableExpenses,
      monthlyFixedExpenses,
      monthlyIncome,
      categoryTotals,
      methodTotals
    );

    // Add net worth data to summary
    return {
      ...summary,
      netWorth,
      totalAssets,
      totalLiabilities
    };
  }

  /**
   * Get year-end investment values (prefer December, fallback to latest month)
   * @param {number} year - Year
   * @returns {Promise<Array>} Array of investment values
   * @private
   */
  async _getYearEndInvestmentValues(year) {
    const db = await require('../database/db').getDatabase();
    
    return new Promise((resolve, reject) => {
      // Try to get December values first
      const decemberQuery = `
        SELECT iv.*, i.name as investment_name
        FROM investment_values iv
        JOIN investments i ON iv.investment_id = i.id
        WHERE iv.year = ? AND iv.month = 12
      `;
      
      db.all(decemberQuery, [year], (err, decemberRows) => {
        if (err) {
          reject(err);
          return;
        }
        
        // If we have December data, return it
        if (decemberRows && decemberRows.length > 0) {
          resolve(decemberRows);
          return;
        }
        
        // Otherwise, get the most recent value for each investment in that year
        const fallbackQuery = `
          SELECT iv.*, i.name as investment_name
          FROM investment_values iv
          JOIN investments i ON iv.investment_id = i.id
          WHERE iv.year = ?
          AND (iv.investment_id, iv.month) IN (
            SELECT investment_id, MAX(month)
            FROM investment_values
            WHERE year = ?
            GROUP BY investment_id
          )
        `;
        
        db.all(fallbackQuery, [year, year], (err, fallbackRows) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(fallbackRows || []);
        });
      });
    });
  }

  /**
   * Get year-end loan balances (prefer December, fallback to latest month)
   * Excludes paid-off loans
   * @param {number} year - Year
   * @returns {Promise<Array>} Array of loan balances
   * @private
   */
  async _getYearEndLoanBalances(year) {
    const db = await require('../database/db').getDatabase();
    
    return new Promise((resolve, reject) => {
      // Try to get December balances first
      const decemberQuery = `
        SELECT lb.*, l.name as loan_name
        FROM loan_balances lb
        JOIN loans l ON lb.loan_id = l.id
        WHERE lb.year = ? AND lb.month = 12
        AND l.is_paid_off = 0
      `;
      
      db.all(decemberQuery, [year], (err, decemberRows) => {
        if (err) {
          reject(err);
          return;
        }
        
        // If we have December data, return it
        if (decemberRows && decemberRows.length > 0) {
          resolve(decemberRows);
          return;
        }
        
        // Otherwise, get the most recent balance for each loan in that year
        const fallbackQuery = `
          SELECT lb.*, l.name as loan_name
          FROM loan_balances lb
          JOIN loans l ON lb.loan_id = l.id
          WHERE lb.year = ?
          AND l.is_paid_off = 0
          AND (lb.loan_id, lb.month) IN (
            SELECT loan_id, MAX(month)
            FROM loan_balances
            WHERE year = ?
            GROUP BY loan_id
          )
        `;
        
        db.all(fallbackQuery, [year, year], (err, fallbackRows) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(fallbackRows || []);
        });
      });
    });
  }

  /**
   * Get monthly variable expenses for a year
   * @param {number} year - Year
   * @returns {Promise<Array>} Monthly variable expenses
   * @private
   */
  async _getMonthlyVariableExpenses(year) {
    const db = await require('../database/db').getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT 
          CAST(strftime('%m', date) AS INTEGER) as month,
          SUM(amount) as total
        FROM expenses
        WHERE strftime('%Y', date) = ?
        GROUP BY strftime('%m', date)
        ORDER BY month
      `;
      
      db.all(query, [year.toString()], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Get monthly fixed expenses for a year
   * @param {number} year - Year
   * @returns {Promise<Array>} Monthly fixed expenses
   * @private
   */
  async _getMonthlyFixedExpenses(year) {
    const db = await require('../database/db').getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT month, SUM(amount) as total
        FROM fixed_expenses
        WHERE year = ?
        GROUP BY month
        ORDER BY month
      `;
      
      db.all(query, [year], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Get monthly income for a year
   * @param {number} year - Year
   * @returns {Promise<Array>} Monthly income
   * @private
   */
  async _getMonthlyIncome(year) {
    const db = await require('../database/db').getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT month, SUM(amount) as total
        FROM income_sources
        WHERE year = ?
        GROUP BY month
        ORDER BY month
      `;
      
      db.all(query, [year], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  /**
   * Get expenses by category for a specific month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @param {string} category - Category name
   * @returns {Promise<Object>} Object with regular, fixed, and total
   */
  async getExpensesByCategory(year, month, category) {
    // Get regular expenses
    const regularExpenses = await expenseRepository.findAll({ year, month });
    const filteredRegular = regularExpenses.filter(exp => exp.type === category);
    
    // Get fixed expenses for this category
    const fixedExpenses = await fixedExpenseRepository.getFixedExpensesByCategory(year, month, category);
    
    // Mark fixed expenses as such
    const markedFixedExpenses = fixedExpenses.map(exp => ({
      ...exp,
      isFixed: true
    }));
    
    return {
      regular: filteredRegular,
      fixed: markedFixedExpenses,
      total: filteredRegular.reduce((sum, e) => sum + e.amount, 0) + 
             fixedExpenses.reduce((sum, e) => sum + e.amount, 0)
    };
  }

  /**
   * Get category totals for a year (including fixed expenses)
   * @param {number} year - Year
   * @returns {Promise<Array>} Category totals
   * @private
   */
  async _getCategoryTotals(year) {
    const db = await require('../database/db').getDatabase();
    
    // Get regular expense totals
    const regularTotals = await new Promise((resolve, reject) => {
      const query = `
        SELECT type, SUM(amount) as total
        FROM expenses
        WHERE strftime('%Y', date) = ?
        GROUP BY type
        ORDER BY total DESC
      `;
      
      db.all(query, [year.toString()], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    // Get fixed expense totals
    const fixedTotals = await new Promise((resolve, reject) => {
      const query = `
        SELECT category as type, SUM(amount) as total
        FROM fixed_expenses
        WHERE year = ?
        GROUP BY category
      `;
      
      db.all(query, [year], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    // Combine totals
    const combinedMap = {};
    regularTotals.forEach(row => {
      combinedMap[row.type] = (combinedMap[row.type] || 0) + row.total;
    });
    fixedTotals.forEach(row => {
      combinedMap[row.type] = (combinedMap[row.type] || 0) + row.total;
    });
    
    // Convert back to array and sort
    return Object.entries(combinedMap)
      .map(([type, total]) => ({ type, total }))
      .sort((a, b) => b.total - a.total);
  }

  /**
   * Get expenses by payment method for a specific month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @param {string} method - Payment method
   * @returns {Promise<Object>} Object with regular, fixed, and total
   */
  async getExpensesByPaymentMethod(year, month, method) {
    // Get regular expenses
    const regularExpenses = await expenseRepository.findAll({ year, month });
    const filteredRegular = regularExpenses.filter(exp => exp.method === method);
    
    // Get fixed expenses for this payment type
    const fixedExpenses = await fixedExpenseRepository.getFixedExpensesByPaymentType(year, month, method);
    
    // Mark fixed expenses as such
    const markedFixedExpenses = fixedExpenses.map(exp => ({
      ...exp,
      isFixed: true
    }));
    
    return {
      regular: filteredRegular,
      fixed: markedFixedExpenses,
      total: filteredRegular.reduce((sum, e) => sum + e.amount, 0) + 
             fixedExpenses.reduce((sum, e) => sum + e.amount, 0)
    };
  }

  /**
   * Get payment method totals for a year (including fixed expenses)
   * @param {number} year - Year
   * @returns {Promise<Array>} Method totals
   * @private
   */
  async _getMethodTotals(year) {
    const db = await require('../database/db').getDatabase();
    
    // Get regular expense totals
    const regularTotals = await new Promise((resolve, reject) => {
      const query = `
        SELECT method, SUM(amount) as total
        FROM expenses
        WHERE strftime('%Y', date) = ?
        GROUP BY method
        ORDER BY total DESC
      `;
      
      db.all(query, [year.toString()], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    // Get fixed expense totals
    const fixedTotals = await new Promise((resolve, reject) => {
      const query = `
        SELECT payment_type as method, SUM(amount) as total
        FROM fixed_expenses
        WHERE year = ?
        GROUP BY payment_type
      `;
      
      db.all(query, [year], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
    
    // Combine totals
    const combinedMap = {};
    regularTotals.forEach(row => {
      combinedMap[row.method] = (combinedMap[row.method] || 0) + row.total;
    });
    fixedTotals.forEach(row => {
      combinedMap[row.method] = (combinedMap[row.method] || 0) + row.total;
    });
    
    // Convert back to array and sort
    return Object.entries(combinedMap)
      .map(([method, total]) => ({ method, total }))
      .sort((a, b) => b.total - a.total);
  }

  /**
   * Build annual summary from fetched data
   * @param {number} year - Year
   * @param {Array} monthlyVariableExpenses - Monthly variable expenses
   * @param {Array} monthlyFixedExpenses - Monthly fixed expenses
   * @param {Array} monthlyIncome - Monthly income
   * @param {Array} categoryTotals - Category totals
   * @param {Array} methodTotals - Method totals
   * @returns {Object} Annual summary
   * @private
   */
  _buildAnnualSummary(year, monthlyVariableExpenses, monthlyFixedExpenses, monthlyIncome, categoryTotals, methodTotals) {
    // Create lookup maps
    const fixedExpensesMap = this._createMonthMap(monthlyFixedExpenses);
    const incomeMap = this._createMonthMap(monthlyIncome);
    const variableExpensesMap = this._createMonthMap(monthlyVariableExpenses);
    
    // Build monthly totals for all 12 months
    const monthlyTotals = this._buildMonthlyTotals(fixedExpensesMap, variableExpensesMap, incomeMap);
    
    // Calculate annual totals
    const totalVariableExpenses = monthlyVariableExpenses.reduce((sum, m) => sum + m.total, 0);
    const totalFixedExpenses = monthlyFixedExpenses.reduce((sum, m) => sum + m.total, 0);
    const totalExpenses = totalVariableExpenses + totalFixedExpenses;
    const totalIncome = monthlyIncome.reduce((sum, m) => sum + m.total, 0);
    const netIncome = totalIncome - totalExpenses;
    
    // Calculate statistics
    const monthsWithData = monthlyTotals.filter(m => m.total > 0).length;
    const averageMonthly = monthsWithData > 0 ? totalExpenses / monthsWithData : 0;
    
    const monthsWithExpenses = monthlyTotals.filter(m => m.total > 0);
    const highestMonth = monthsWithExpenses.length > 0 
      ? monthsWithExpenses.reduce((max, m) => m.total > max.total ? m : max, monthsWithExpenses[0])
      : null;
    
    const lowestMonth = monthsWithExpenses.length > 0
      ? monthsWithExpenses.reduce((min, m) => m.total < min.total ? m : min, monthsWithExpenses[0])
      : null;
    
    // Convert arrays to objects
    const byCategory = this._arrayToObject(categoryTotals, 'type');
    const byMethod = this._arrayToObject(methodTotals, 'method');
    
    return {
      year,
      totalExpenses,
      totalFixedExpenses,
      totalVariableExpenses,
      totalIncome,
      netIncome,
      averageMonthly,
      monthlyTotals,
      highestMonth,
      lowestMonth,
      byCategory,
      byMethod
    };
  }

  /**
   * Create month lookup map from array
   * @param {Array} data - Array with month and total properties
   * @returns {Object} Month map
   * @private
   */
  _createMonthMap(data) {
    const map = {};
    data.forEach(item => {
      map[item.month] = item.total;
    });
    return map;
  }

  /**
   * Build monthly totals for all 12 months
   * @param {Object} fixedExpensesMap - Fixed expenses by month
   * @param {Object} variableExpensesMap - Variable expenses by month
   * @param {Object} incomeMap - Income by month
   * @returns {Array} Monthly totals
   * @private
   */
  _buildMonthlyTotals(fixedExpensesMap, variableExpensesMap, incomeMap) {
    const monthlyTotals = [];
    for (let month = 1; month <= 12; month++) {
      const fixedExpenses = fixedExpensesMap[month] || 0;
      const variableExpenses = variableExpensesMap[month] || 0;
      const income = incomeMap[month] || 0;
      const total = fixedExpenses + variableExpenses;
      
      monthlyTotals.push({
        month,
        total,
        fixedExpenses,
        variableExpenses,
        income
      });
    }
    return monthlyTotals;
  }

  /**
   * Convert array to object for easier frontend consumption
   * @param {Array} data - Array of objects
   * @param {string} keyField - Field to use as key
   * @returns {Object} Object with keys from keyField
   * @private
   */
  _arrayToObject(data, keyField) {
    const obj = {};
    data.forEach(item => {
      obj[item[keyField]] = item.total;
    });
    return obj;
  }

  /**
   * Get tax-deductible summary for a specific year
   * @param {number} year - Year
   * @returns {Promise<Object>} Tax-deductible summary object
   */
  async getTaxDeductibleSummary(year) {
    // Validate year parameter
    if (!year) {
      throw new Error('Year parameter is required');
    }

    const yearNum = parseInt(year);
    if (isNaN(yearNum)) {
      throw new Error('Year must be a valid number');
    }

    // Call repository method to fetch expenses
    const expenses = await expenseRepository.getTaxDeductibleExpenses(yearNum);

    // Separate expenses into medical and donations arrays
    const medicalExpenses = expenses.filter(exp => exp.type === 'Tax - Medical');
    const donationExpenses = expenses.filter(exp => exp.type === 'Tax - Donation');

    // Calculate totals
    const medicalTotal = medicalExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const donationTotal = donationExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const totalDeductible = medicalTotal + donationTotal;

    // Calculate insurance totals (Requirements 6.1, 6.2, 6.3, 6.4)
    const insuranceSummary = this._calculateInsuranceSummary(medicalExpenses);

    // Generate monthly breakdown by grouping expenses by month
    const monthlyBreakdown = [];
    for (let month = 1; month <= 12; month++) {
      const monthExpenses = expenses.filter(exp => {
        const expenseMonth = parseInt(exp.date.substring(5, 7));
        return expenseMonth === month;
      });
      
      const monthTotal = monthExpenses.reduce((sum, exp) => sum + exp.amount, 0);
      monthlyBreakdown.push({
        month: month,
        total: parseFloat(monthTotal.toFixed(2))
      });
    }

    // Return structured summary object matching the design interface
    return {
      year: yearNum,
      totalDeductible: parseFloat(totalDeductible.toFixed(2)),
      medicalTotal: parseFloat(medicalTotal.toFixed(2)),
      donationTotal: parseFloat(donationTotal.toFixed(2)),
      monthlyBreakdown: monthlyBreakdown,
      expenses: {
        medical: medicalExpenses,
        donations: donationExpenses
      },
      // Insurance summary (Requirements 6.1, 6.2, 6.3, 6.4)
      insuranceSummary: insuranceSummary
    };
  }

  /**
   * Calculate insurance summary from medical expenses
   * @param {Array} medicalExpenses - Array of medical expenses
   * @returns {Object} Insurance summary object
   * @private
   * _Requirements: 6.1, 6.2, 6.3, 6.4_
   */
  _calculateInsuranceSummary(medicalExpenses) {
    // Filter to insurance-eligible expenses
    const insuranceEligible = medicalExpenses.filter(exp => exp.insuranceEligible);
    
    // Calculate total original costs
    const totalOriginalCost = insuranceEligible.reduce((sum, exp) => {
      return sum + (exp.originalCost || exp.amount);
    }, 0);

    // Calculate total out-of-pocket amounts (the amount field represents out-of-pocket)
    const totalOutOfPocket = insuranceEligible.reduce((sum, exp) => sum + exp.amount, 0);

    // Calculate total reimbursements
    const totalReimbursement = insuranceEligible.reduce((sum, exp) => {
      return sum + (exp.reimbursement || 0);
    }, 0);

    // Group by claim status
    const byStatus = {
      not_claimed: { count: 0, originalCost: 0, outOfPocket: 0 },
      in_progress: { count: 0, originalCost: 0, outOfPocket: 0 },
      paid: { count: 0, originalCost: 0, outOfPocket: 0 },
      denied: { count: 0, originalCost: 0, outOfPocket: 0 }
    };

    insuranceEligible.forEach(exp => {
      const status = exp.claimStatus || 'not_claimed';
      if (byStatus[status]) {
        byStatus[status].count += 1;
        byStatus[status].originalCost += (exp.originalCost || exp.amount);
        byStatus[status].outOfPocket += exp.amount;
      }
    });

    // Round all values
    Object.keys(byStatus).forEach(status => {
      byStatus[status].originalCost = parseFloat(byStatus[status].originalCost.toFixed(2));
      byStatus[status].outOfPocket = parseFloat(byStatus[status].outOfPocket.toFixed(2));
    });

    return {
      totalOriginalCost: parseFloat(totalOriginalCost.toFixed(2)),
      totalOutOfPocket: parseFloat(totalOutOfPocket.toFixed(2)),
      totalReimbursement: parseFloat(totalReimbursement.toFixed(2)),
      eligibleCount: insuranceEligible.length,
      byStatus: byStatus
    };
  }

  /**
   * Get tax-deductible summary with people grouping for a specific year
   * @param {number} year - Year
   * @returns {Promise<Object>} Tax-deductible summary object with people grouping
   */
  async getTaxDeductibleWithPeople(year) {
    // Validate year parameter
    if (!year) {
      throw new Error('Year parameter is required');
    }

    const yearNum = parseInt(year);
    if (isNaN(yearNum)) {
      throw new Error('Year must be a valid number');
    }

    // Get all tax-deductible expenses for the year
    const expenses = await expenseRepository.getTaxDeductibleExpenses(yearNum);

    // Get people associations for all expenses
    const expensesWithPeople = await Promise.all(
      expenses.map(async (expense) => {
        const people = await expensePeopleRepository.getPeopleForExpense(expense.id);
        return {
          ...expense,
          people: people
        };
      })
    );

    // Group expenses by person
    const groupedByPerson = this.groupExpensesByPerson(expensesWithPeople);

    // Calculate person totals
    const personTotals = this.calculatePersonTotals(expensesWithPeople);

    // Handle unassigned expenses
    const unassignedExpenses = this.handleUnassignedExpenses(expensesWithPeople);

    // Calculate overall totals
    const medicalExpenses = expensesWithPeople.filter(exp => exp.type === 'Tax - Medical');
    const donationExpenses = expensesWithPeople.filter(exp => exp.type === 'Tax - Donation');
    const medicalTotal = medicalExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const donationTotal = donationExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    const totalDeductible = medicalTotal + donationTotal;

    return {
      year: yearNum,
      totalDeductible: parseFloat(totalDeductible.toFixed(2)),
      medicalTotal: parseFloat(medicalTotal.toFixed(2)),
      donationTotal: parseFloat(donationTotal.toFixed(2)),
      groupedByPerson,
      personTotals,
      unassignedExpenses,
      expenses: {
        medical: medicalExpenses,
        donations: donationExpenses
      }
    };
  }

  /**
   * Group expenses by person and provider
   * Only includes medical expenses (Tax - Medical) since person grouping is for medical expense tracking
   * @param {Array} expenses - Array of expenses with people associations
   * @returns {Object} Expenses grouped by person and provider
   */
  groupExpensesByPerson(expenses) {
    const grouped = {};

    // Filter to only medical expenses - person grouping is specifically for medical expense tracking
    const medicalExpenses = expenses.filter(exp => exp.type === 'Tax - Medical');

    medicalExpenses.forEach(expense => {
      if (expense.people && expense.people.length > 0) {
        expense.people.forEach(person => {
          // Initialize person group if not exists
          if (!grouped[person.personId]) {
            grouped[person.personId] = {
              personId: person.personId,
              personName: person.name,
              providers: {},
              total: 0
            };
          }

          // Initialize provider group if not exists
          const provider = expense.place || 'Unknown Provider';
          if (!grouped[person.personId].providers[provider]) {
            grouped[person.personId].providers[provider] = {
              providerName: provider,
              expenses: [],
              total: 0
            };
          }

          // Ensure expenses array exists before pushing
          if (!grouped[person.personId].providers[provider].expenses) {
            grouped[person.personId].providers[provider].expenses = [];
          }

          // Add expense to provider group
          grouped[person.personId].providers[provider].expenses.push({
            ...expense,
            allocatedAmount: person.amount
          });
          grouped[person.personId].providers[provider].total += person.amount;
          grouped[person.personId].total += person.amount;
        });
      }
    });

    // Convert providers object to array for easier frontend consumption
    Object.keys(grouped).forEach(personId => {
      grouped[personId].providers = Object.values(grouped[personId].providers);
      grouped[personId].total = parseFloat(grouped[personId].total.toFixed(2));
      
      // Sort providers by total amount (descending)
      grouped[personId].providers.sort((a, b) => b.total - a.total);
      
      // Round provider totals
      grouped[personId].providers.forEach(provider => {
        provider.total = parseFloat(provider.total.toFixed(2));
      });
    });

    return grouped;
  }

  /**
   * Calculate per-person totals from expenses
   * @param {Array} expenses - Array of expenses with people associations
   * @returns {Object} Person totals by person ID
   */
  calculatePersonTotals(expenses) {
    const totals = {};

    expenses.forEach(expense => {
      if (expense.people && expense.people.length > 0) {
        expense.people.forEach(person => {
          if (!totals[person.personId]) {
            totals[person.personId] = {
              personId: person.personId,
              personName: person.name,
              medicalTotal: 0,
              donationTotal: 0,
              total: 0
            };
          }

          const amount = person.amount;
          if (expense.type === 'Tax - Medical') {
            totals[person.personId].medicalTotal += amount;
          } else if (expense.type === 'Tax - Donation') {
            totals[person.personId].donationTotal += amount;
          }
          totals[person.personId].total += amount;
        });
      }
    });

    // Round all totals
    Object.keys(totals).forEach(personId => {
      totals[personId].medicalTotal = parseFloat(totals[personId].medicalTotal.toFixed(2));
      totals[personId].donationTotal = parseFloat(totals[personId].donationTotal.toFixed(2));
      totals[personId].total = parseFloat(totals[personId].total.toFixed(2));
    });

    return totals;
  }

  /**
   * Handle unassigned expenses (medical expenses without people associations)
   * Only includes medical expenses since person assignment is for medical expense tracking
   * @param {Array} expenses - Array of expenses with people associations
   * @returns {Object} Unassigned expenses grouped by provider
   */
  handleUnassignedExpenses(expenses) {
    // Filter to only medical expenses without people associations
    const unassigned = expenses.filter(
      expense => expense.type === 'Tax - Medical' && (!expense.people || expense.people.length === 0)
    );
    
    const groupedByProvider = {};
    let totalUnassigned = 0;

    unassigned.forEach(expense => {
      const provider = expense.place || 'Unknown Provider';
      
      if (!groupedByProvider[provider]) {
        groupedByProvider[provider] = {
          providerName: provider,
          expenses: [],
          total: 0
        };
      }

      groupedByProvider[provider].expenses.push(expense);
      groupedByProvider[provider].total += expense.amount;
      totalUnassigned += expense.amount;
    });

    // Convert to array and round totals
    const providers = Object.values(groupedByProvider);
    providers.forEach(provider => {
      provider.total = parseFloat(provider.total.toFixed(2));
    });

    // Sort providers by total amount (descending)
    providers.sort((a, b) => b.total - a.total);

    return {
      providers,
      total: parseFloat(totalUnassigned.toFixed(2)),
      count: unassigned.length
    };
  }
  /**
   * Get distinct place names from expenses
   * @returns {Promise<Array<string>>} Array of unique place names
   */
  async getDistinctPlaces() {
    return await expenseRepository.getDistinctPlaces();
  }

  /**
   * Get suggested category for a place based on historical data
   * @param {string} place - Place name
   * @returns {Promise<Object>} Suggestion object with category and confidence
   */
  async getSuggestedCategory(place) {
    if (!place || typeof place !== 'string') {
      throw new Error('Place name is required');
    }

    return await expenseRepository.getSuggestedCategory(place.trim());
  }

  /**
   * Validate person allocations against total expense amount
   * @param {number} totalAmount - Total expense amount
   * @param {Array} allocations - Array of {personId, amount} objects
   * @throws {Error} If validation fails
   */
  validatePersonAllocations(totalAmount, allocations) {
    if (!allocations || !Array.isArray(allocations)) {
      throw new Error('Person allocations must be an array');
    }

    if (allocations.length === 0) {
      throw new Error('At least one person allocation is required');
    }

    // Validate each allocation
    for (const allocation of allocations) {
      if (!allocation.personId || typeof allocation.personId !== 'number' || allocation.personId <= 0) {
        throw new Error('Each allocation must have a valid personId');
      }

      if (allocation.amount === undefined || allocation.amount === null) {
        throw new Error('Each allocation must have an amount');
      }

      const amount = parseFloat(allocation.amount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Each allocation amount must be a positive number');
      }

      // Check for max 2 decimal places
      if (!/^\d+(\.\d{1,2})?$/.test(allocation.amount.toString())) {
        throw new Error('Allocation amounts must have at most 2 decimal places');
      }
    }

    // Check for duplicate person IDs first (before sum validation)
    const personIds = allocations.map(a => a.personId);
    const uniquePersonIds = [...new Set(personIds)];
    if (personIds.length !== uniquePersonIds.length) {
      throw new Error('Cannot allocate to the same person multiple times');
    }

    // Check that allocations sum to total amount
    const totalAllocated = allocations.reduce((sum, allocation) => {
      return sum + parseFloat(allocation.amount);
    }, 0);

    // Use a small epsilon for floating point comparison
    const epsilon = 0.005; // Smaller epsilon for more precise validation
    if (Math.abs(totalAllocated - totalAmount) > epsilon) {
      throw new Error(`Total allocated amount (${totalAllocated.toFixed(2)}) must equal expense amount (${totalAmount.toFixed(2)})`);
    }
  }

  /**
   * Create a new expense with people associations and optional future months
   * @param {Object} expenseData - Expense data
   * @param {Array} personAllocations - Array of {personId, amount} objects
   * @param {number} futureMonths - Number of future months to create (0-12, default 0)
   * @returns {Promise<Object>} Created expense with people data and futureExpenses array
   */
  async createExpenseWithPeople(expenseData, personAllocations = [], futureMonths = 0) {
    // Validate the expense data first
    this.validateExpense(expenseData);

    // Validate futureMonths parameter
    this._validateFutureMonths(futureMonths);

    // If people allocations are provided, validate them
    if (personAllocations && personAllocations.length > 0) {
      this.validatePersonAllocations(parseFloat(expenseData.amount), personAllocations);
      
      // Validate that all people exist in the database
      await this._validatePeopleExist(personAllocations);
    }

    // Normalize futureMonths to 0 if not provided
    const monthsToCreate = futureMonths || 0;

    // Create the source expense first
    const createdExpense = await this._createSingleExpense(expenseData);
    const createdExpenseIds = [createdExpense.id];

    // If people allocations are provided, create the associations for source expense
    if (personAllocations && personAllocations.length > 0) {
      await expensePeopleRepository.createAssociations(
        createdExpense.id,
        personAllocations
      );
    }

    // If no future months requested, return simple response
    if (monthsToCreate === 0) {
      // Fetch full people data including names for the response
      if (personAllocations && personAllocations.length > 0) {
        const peopleByExpense = await expensePeopleRepository.getPeopleForExpenses([createdExpense.id]);
        const people = peopleByExpense[createdExpense.id] || [];
        return {
          ...createdExpense,
          people
        };
      }
      return createdExpense;
    }

    // Create future expenses with people allocations
    const futureExpenses = [];
    
    try {
      for (let i = 1; i <= monthsToCreate; i++) {
        const futureDate = this._calculateFutureDate(expenseData.date, i);
        
        // Create future expense with same data but different date
        const futureExpenseData = {
          ...expenseData,
          date: futureDate
        };
        
        const futureExpense = await this._createSingleExpense(futureExpenseData);
        createdExpenseIds.push(futureExpense.id);
        
        // Copy people allocations for medical expenses (Requirement 1.8)
        // Note: Invoices are NOT copied (Requirement 1.9)
        if (personAllocations && personAllocations.length > 0) {
          await expensePeopleRepository.createAssociations(
            futureExpense.id,
            personAllocations
          );
        }
        
        futureExpenses.push(futureExpense);
      }
    } catch (error) {
      // Rollback: delete all created expenses on error (atomicity)
      for (const expenseId of createdExpenseIds) {
        try {
          await expenseRepository.delete(expenseId);
        } catch (deleteError) {
          // Log but continue cleanup
          const logger = require('../config/logger');
          logger.error('Error during rollback cleanup:', deleteError);
        }
      }
      throw new Error('Failed to create future expenses. Please try again.');
    }

    // Fetch full people data for all expenses
    const allExpenseIds = [createdExpense.id, ...futureExpenses.map(e => e.id)];
    const peopleByExpense = await expensePeopleRepository.getPeopleForExpenses(allExpenseIds);

    // Attach people data to source expense
    const sourceWithPeople = {
      ...createdExpense,
      people: peopleByExpense[createdExpense.id] || []
    };

    // Attach people data to future expenses
    const futureWithPeople = futureExpenses.map(expense => ({
      ...expense,
      people: peopleByExpense[expense.id] || []
    }));

    // Return response with source expense and futureExpenses array
    return {
      expense: sourceWithPeople,
      futureExpenses: futureWithPeople
    };
  }

  /**
   * Update an expense with people associations and optional future months
   * @param {number} id - Expense ID
   * @param {Object} expenseData - Updated expense data
   * @param {Array} personAllocations - Array of {personId, amount} objects
   * @param {number} futureMonths - Number of future months to create (0-12, default 0)
   * @returns {Promise<Object|null>} Updated expense with people data and futureExpenses array or null
   */
  async updateExpenseWithPeople(id, expenseData, personAllocations = [], futureMonths = 0) {
    // Validate the expense data first
    this.validateExpense(expenseData);

    // Validate futureMonths parameter
    this._validateFutureMonths(futureMonths);

    // If people allocations are provided, validate them
    if (personAllocations && personAllocations.length > 0) {
      this.validatePersonAllocations(parseFloat(expenseData.amount), personAllocations);
      
      // Validate that all people exist in the database
      await this._validatePeopleExist(personAllocations);
    }

    // Normalize futureMonths to 0 if not provided
    const monthsToCreate = futureMonths || 0;

    // Update the expense first (without futureMonths to avoid double creation)
    const updatedExpense = await this.updateExpense(id, expenseData, 0);

    if (!updatedExpense) {
      return null;
    }

    // Update people associations for the updated expense
    await expensePeopleRepository.updateExpenseAllocations(
      id,
      personAllocations || []
    );

    // If no future months requested, return simple response
    if (monthsToCreate === 0) {
      // Fetch full people data including names for the response
      const peopleByExpense = await expensePeopleRepository.getPeopleForExpenses([id]);
      const people = peopleByExpense[id] || [];

      // Return expense with complete people data (including names)
      return {
        ...updatedExpense,
        people
      };
    }

    // Create future expenses with updated values and people allocations (Requirement 2.3, 2.4)
    const futureExpenses = [];
    const createdExpenseIds = [];
    
    try {
      for (let i = 1; i <= monthsToCreate; i++) {
        const futureDate = this._calculateFutureDate(expenseData.date, i);
        
        // Create future expense with updated values
        const futureExpenseData = {
          ...expenseData,
          date: futureDate
        };
        
        const futureExpense = await this._createSingleExpense(futureExpenseData);
        createdExpenseIds.push(futureExpense.id);
        
        // Copy people allocations for medical expenses (Requirement 1.8)
        // Note: Invoices are NOT copied (Requirement 1.9)
        if (personAllocations && personAllocations.length > 0) {
          await expensePeopleRepository.createAssociations(
            futureExpense.id,
            personAllocations
          );
        }
        
        futureExpenses.push(futureExpense);
      }
    } catch (error) {
      // Rollback: delete all created future expenses on error (atomicity)
      for (const expenseId of createdExpenseIds) {
        try {
          await expenseRepository.delete(expenseId);
        } catch (deleteError) {
          // Log but continue cleanup
          const logger = require('../config/logger');
          logger.error('Error during rollback cleanup:', deleteError);
        }
      }
      throw new Error('Failed to create future expenses. Please try again.');
    }

    // Fetch full people data for all expenses
    const allExpenseIds = [id, ...futureExpenses.map(e => e.id)];
    const peopleByExpense = await expensePeopleRepository.getPeopleForExpenses(allExpenseIds);

    // Attach people data to updated expense
    const updatedWithPeople = {
      ...updatedExpense,
      people: peopleByExpense[id] || []
    };

    // Attach people data to future expenses
    const futureWithPeople = futureExpenses.map(expense => ({
      ...expense,
      people: peopleByExpense[expense.id] || []
    }));

    // Return response with updated expense and futureExpenses array
    return {
      expense: updatedWithPeople,
      futureExpenses: futureWithPeople
    };
  }

  /**
   * Get an expense with associated people data
   * @param {number} id - Expense ID
   * @returns {Promise<Object|null>} Expense with people data or null
   */
  async getExpenseWithPeople(id) {
    // Get the expense first
    const expense = await this.getExpenseById(id);

    if (!expense) {
      return null;
    }

    // Get associated people
    const people = await expensePeopleRepository.getPeopleForExpense(id);

    // Return expense with people data
    return {
      ...expense,
      people: people.map(person => ({
        personId: person.personId,
        name: person.name,
        dateOfBirth: person.dateOfBirth,
        amount: person.amount
      }))
    };
  }
}

module.exports = new ExpenseService();
