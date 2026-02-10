const expenseRepository = require('../repositories/expenseRepository');
const expensePeopleRepository = require('../repositories/expensePeopleRepository');
const peopleRepository = require('../repositories/peopleRepository');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const { calculateWeek } = require('../utils/dateUtils');
const { BUDGETABLE_CATEGORIES } = require('../utils/categories');
const budgetEvents = require('../events/budgetEvents');
const logger = require('../config/logger');
const expenseValidationService = require('./expenseValidationService');
const expenseInsuranceService = require('./expenseInsuranceService');
const expensePeopleService = require('./expensePeopleService');
const expenseTaxService = require('./expenseTaxService');
const expenseAggregationService = require('./expenseAggregationService');
const expenseCategoryService = require('./expenseCategoryService');
const activityLogService = require('./activityLogService');

/**
 * ExpenseService Facade
 *
 * Retains core CRUD operations and private helpers.
 * All domain-specific concerns are delegated to focused sub-services:
 *   - expenseValidationService: field and data validation
 *   - expenseInsuranceService: insurance status, eligibility, defaults
 *   - expensePeopleService: people allocation, grouping, totals
 *   - expenseTaxService: tax-deductible summaries and reports
 *   - expenseAggregationService: monthly/annual summaries
 *   - expenseCategoryService: category suggestions and place lookups
 */
class ExpenseService {
  constructor() {
    // Initialize people service with facade methods to avoid circular dependency
    expensePeopleService.init({
      createExpense: this.createExpense.bind(this),
      updateExpense: this.updateExpense.bind(this),
      deleteExpense: this.deleteExpense.bind(this),
      getExpenseById: this.getExpenseById.bind(this),
      validateExpense: this.validateExpense.bind(this),
      _validateFutureMonths: this._validateFutureMonths.bind(this),
      _validatePeopleExist: this._validatePeopleExist.bind(this),
      _createSingleExpense: this._createSingleExpense.bind(this),
      _calculateFutureDate: this._calculateFutureDate.bind(this),
    });
  }

  // ─── Validation Delegation ───────────────────────────────────────────

  validateExpense(expense) {
    return expenseValidationService.validateExpense(expense);
  }

  isValidDate(dateString) {
    return expenseValidationService.isValidDate(dateString);
  }

  validatePostedDate(expense) {
    return expenseValidationService.validatePostedDate(expense);
  }

  validateInsuranceData(insuranceData, expenseAmount) {
    return expenseValidationService.validateInsuranceData(insuranceData, expenseAmount);
  }

  validateReimbursement(reimbursement, originalAmount) {
    return expenseValidationService.validateReimbursement(reimbursement, originalAmount);
  }

  validateInsurancePersonAllocations(personAllocations) {
    return expenseValidationService.validateInsurancePersonAllocations(personAllocations);
  }

  validatePersonAllocations(totalAmount, allocations) {
    return expenseValidationService.validatePersonAllocations(totalAmount, allocations);
  }

  // ─── Insurance Delegation ────────────────────────────────────────────

  async updateInsuranceStatus(id, status) {
    return expenseInsuranceService.updateInsuranceStatus(id, status);
  }

  async updateInsuranceEligibility(id, eligible, originalCost = null) {
    return expenseInsuranceService.updateInsuranceEligibility(id, eligible, originalCost);
  }

  _applyInsuranceDefaults(expenseData) {
    return expenseInsuranceService.applyInsuranceDefaults(expenseData);
  }

  // ─── Core CRUD Private Helpers ───────────────────────────────────────

  /**
   * Trigger budget recalculation for affected budgets.
   * Uses event emitter to avoid circular dependency with budgetService.
   * @private
   */
  _triggerBudgetRecalculation(date, category) {
    if (BUDGETABLE_CATEGORIES.includes(category)) {
      budgetEvents.emitBudgetRecalculation(date, category);
    }
  }

  /**
   * Calculate a future date by adding months to a source date.
   * Preserves the day of month when possible, otherwise uses the last day of the target month.
   * @private
   */
  _calculateFutureDate(sourceDate, monthsAhead) {
    const [year, month, day] = sourceDate.split('-').map(Number);
    const sourceDay = day;

    let targetMonth = month + monthsAhead;
    let targetYear = year;

    while (targetMonth > 12) {
      targetMonth -= 12;
      targetYear += 1;
    }

    const daysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
    const targetDay = sourceDay > daysInTargetMonth ? daysInTargetMonth : sourceDay;

    const yearStr = targetYear.toString();
    const monthStr = targetMonth.toString().padStart(2, '0');
    const dayStr = targetDay.toString().padStart(2, '0');

    return `${yearStr}-${monthStr}-${dayStr}`;
  }

  /**
   * Validate futureMonths parameter.
   * @private
   */
  _validateFutureMonths(futureMonths) {
    if (futureMonths === undefined || futureMonths === null) {
      return;
    }

    if (!Number.isInteger(futureMonths)) {
      throw new Error('Future months must be a whole number');
    }

    if (futureMonths < 0 || futureMonths > 12) {
      throw new Error('Future months must be between 0 and 12');
    }
  }

  /**
   * Validate that all people in the allocations exist in the database.
   * @private
   */
  async _validatePeopleExist(personAllocations) {
    for (const allocation of personAllocations) {
      const person = await peopleRepository.findById(allocation.personId);
      if (!person) {
        throw new Error(`Person with ID ${allocation.personId} does not exist. Please add people in the People Management section first.`);
      }
    }
  }

  /**
   * Resolve payment method from either payment_method_id or method string.
   * Returns both the payment_method_id and display_name (method string).
   * @private
   */
  async _resolvePaymentMethod(expenseData) {
    if (expenseData.payment_method_id) {
      const paymentMethod = await paymentMethodRepository.findById(expenseData.payment_method_id);
      if (!paymentMethod) {
        throw new Error(`Payment method with ID ${expenseData.payment_method_id} not found`);
      }
      return {
        payment_method_id: paymentMethod.id,
        method: paymentMethod.display_name,
        paymentMethod
      };
    }

    if (expenseData.method) {
      const paymentMethod = await paymentMethodRepository.findByDisplayName(expenseData.method);
      if (paymentMethod) {
        return {
          payment_method_id: paymentMethod.id,
          method: paymentMethod.display_name,
          paymentMethod
        };
      }
      return {
        payment_method_id: null,
        method: expenseData.method,
        paymentMethod: null
      };
    }

    throw new Error('Payment method is required');
  }

  /**
   * Check if a date is in the future (after today).
   * @private
   */
  _isFutureDate(dateString) {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return dateString > todayStr;
  }

  /**
   * Get the effective posting date for an expense (for credit card balance calculations).
   * Uses COALESCE logic: posted_date if set, otherwise transaction date.
   * @private
   */
  _getEffectivePostingDate(expense) {
    return expense.posted_date || expense.date;
  }

  /**
   * Update credit card balance after expense creation.
   * @private
   */
  async _updateCreditCardBalanceOnCreate(paymentMethod, amount, expenseDate) {
    if (paymentMethod && paymentMethod.type === 'credit_card') {
      await paymentMethodRepository.updateBalance(paymentMethod.id, amount);
      logger.debug('Updated credit card balance after expense creation:', {
        paymentMethodId: paymentMethod.id,
        displayName: paymentMethod.display_name,
        amountAdded: amount
      });
    }
  }

  /**
   * Update credit card balance after expense deletion.
   * @private
   */
  async _updateCreditCardBalanceOnDelete(paymentMethod, amount, expenseDate) {
    if (paymentMethod && paymentMethod.type === 'credit_card') {
      await paymentMethodRepository.updateBalance(paymentMethod.id, -amount);
      logger.debug('Updated credit card balance after expense deletion:', {
        paymentMethodId: paymentMethod.id,
        displayName: paymentMethod.display_name,
        amountSubtracted: amount
      });
    }
  }

  /**
   * Process reimbursement data for an expense.
   * Amount = net (out-of-pocket), original_cost = charged amount.
   * @private
   */
  _processReimbursement(expenseData) {
    const result = { ...expenseData };

    // Skip processing for medical expenses with insurance tracking
    if (result.type === 'Tax - Medical' && result.insurance_eligible) {
      return result;
    }

    // Handle legacy reimbursement field (backward compatibility)
    const reimbursement = result.reimbursement;
    if (reimbursement !== undefined && reimbursement !== null && reimbursement !== '' && parseFloat(reimbursement) > 0) {
      const reimbursementNum = parseFloat(reimbursement);
      const originalAmount = parseFloat(result.amount);

      this.validateReimbursement(reimbursementNum, originalAmount);

      result.original_cost = originalAmount;
      result.amount = parseFloat((originalAmount - reimbursementNum).toFixed(2));
      delete result.reimbursement;
      return result;
    }

    // New pattern: original_cost is sent directly from frontend
    if (result.original_cost !== undefined && result.original_cost !== null) {
      this.validateInsuranceData(
        { original_cost: result.original_cost },
        result.amount
      );
    }

    return result;
  }

  // ─── Core CRUD Methods ───────────────────────────────────────────────

  /**
   * Create a single expense (internal helper).
   * @private
   */
  async _createSingleExpense(expenseData) {
    const processedData = this._applyInsuranceDefaults(expenseData);
    const reimbursementProcessedData = this._processReimbursement(processedData);

    this.validatePostedDate(reimbursementProcessedData);

    if (reimbursementProcessedData.insurance_eligible) {
      this.validateInsuranceData(
        {
          insurance_eligible: reimbursementProcessedData.insurance_eligible,
          claim_status: reimbursementProcessedData.claim_status,
          original_cost: reimbursementProcessedData.original_cost
        },
        reimbursementProcessedData.amount
      );
    }

    const { payment_method_id, method, paymentMethod } = await this._resolvePaymentMethod(reimbursementProcessedData);
    const week = calculateWeek(reimbursementProcessedData.date);

    const expense = {
      date: reimbursementProcessedData.date,
      posted_date: reimbursementProcessedData.posted_date || null,
      place: reimbursementProcessedData.place || null,
      notes: reimbursementProcessedData.notes || null,
      amount: parseFloat(reimbursementProcessedData.amount),
      type: reimbursementProcessedData.type,
      week: week,
      method: method,
      payment_method_id: payment_method_id,
      recurring_id: reimbursementProcessedData.recurring_id !== undefined ? reimbursementProcessedData.recurring_id : null,
      is_generated: reimbursementProcessedData.is_generated !== undefined ? reimbursementProcessedData.is_generated : 0,
      insurance_eligible: reimbursementProcessedData.insurance_eligible ? 1 : 0,
      claim_status: reimbursementProcessedData.claim_status || null,
      original_cost: reimbursementProcessedData.original_cost !== undefined ? reimbursementProcessedData.original_cost : null
    };

    const createdExpense = await expenseRepository.create(expense);

    const chargedAmount = expense.original_cost !== null ? expense.original_cost : expense.amount;
    await this._updateCreditCardBalanceOnCreate(paymentMethod, chargedAmount, expense.date);
    this._triggerBudgetRecalculation(expense.date, expense.type);

    // Log activity event
    await activityLogService.logEvent(
      'expense_added',
      'expense',
      createdExpense.id,
      `Added expense: ${expense.place || 'Unknown'} - $${expense.amount.toFixed(2)}`,
      {
        amount: expense.amount,
        category: expense.type,
        date: expense.date,
        place: expense.place
      }
    );

    return createdExpense;
  }

  /**
   * Create a new expense with optional future months.
   */
  async createExpense(expenseData, futureMonths = 0) {
    this.validateExpense(expenseData);
    this._validateFutureMonths(futureMonths);

    const monthsToCreate = futureMonths || 0;
    const sourceExpense = await this._createSingleExpense(expenseData);

    if (monthsToCreate === 0) {
      return sourceExpense;
    }

    const futureExpenses = [];
    const createdExpenseIds = [sourceExpense.id];

    try {
      for (let i = 1; i <= monthsToCreate; i++) {
        const futureDate = this._calculateFutureDate(expenseData.date, i);
        const futureExpenseData = { ...expenseData, date: futureDate };
        const futureExpense = await this._createSingleExpense(futureExpenseData);
        futureExpenses.push(futureExpense);
        createdExpenseIds.push(futureExpense.id);
      }
    } catch (error) {
      for (const expenseId of createdExpenseIds) {
        try {
          await expenseRepository.delete(expenseId);
        } catch (deleteError) {
          logger.error('Error during rollback cleanup:', deleteError);
        }
      }
      throw new Error('Failed to create future expenses. Please try again.');
    }

    return {
      expense: sourceExpense,
      futureExpenses: futureExpenses
    };
  }

  /**
   * Get all expenses with optional filters.
   */
  async getExpenses(filters = {}) {
    const expenses = await expenseRepository.findAll(filters);

    const medicalExpenseIds = expenses
      .filter(e => e.type === 'Tax - Medical')
      .map(e => e.id);

    let peopleByExpense = {};
    if (medicalExpenseIds.length > 0) {
      peopleByExpense = await expensePeopleRepository.getPeopleForExpenses(medicalExpenseIds);
    }

    return expenses.map(expense => {
      if (expense.type === 'Tax - Medical') {
        return { ...expense, people: peopleByExpense[expense.id] || [] };
      }
      return expense;
    });
  }

  /**
   * Get a single expense by ID.
   */
  async getExpenseById(id) {
    return await expenseRepository.findById(id);
  }

  /**
   * Update an expense with optional future months.
   */
  async updateExpense(id, expenseData, futureMonths = 0) {
    const oldExpense = await expenseRepository.findById(id);
    if (!oldExpense) {
      return null;
    }

    this.validateExpense(expenseData);
    this.validatePostedDate(expenseData);
    this._validateFutureMonths(futureMonths);

    const processedData = this._applyInsuranceDefaults(expenseData);
    const reimbursementProcessedData = this._processReimbursement(processedData);

    if (reimbursementProcessedData.insurance_eligible) {
      this.validateInsuranceData(
        {
          insurance_eligible: reimbursementProcessedData.insurance_eligible,
          claim_status: reimbursementProcessedData.claim_status,
          original_cost: reimbursementProcessedData.original_cost
        },
        reimbursementProcessedData.amount
      );
    }

    const monthsToCreate = futureMonths || 0;
    const { payment_method_id, method, paymentMethod } = await this._resolvePaymentMethod(reimbursementProcessedData);

    let oldPaymentMethod = null;
    if (oldExpense.payment_method_id) {
      oldPaymentMethod = await paymentMethodRepository.findById(oldExpense.payment_method_id);
    }

    const week = calculateWeek(reimbursementProcessedData.date);

    const expense = {
      date: reimbursementProcessedData.date,
      posted_date: reimbursementProcessedData.posted_date || null,
      place: reimbursementProcessedData.place || null,
      notes: reimbursementProcessedData.notes || null,
      amount: parseFloat(reimbursementProcessedData.amount),
      type: reimbursementProcessedData.type,
      week: week,
      method: method,
      payment_method_id: payment_method_id,
      insurance_eligible: reimbursementProcessedData.insurance_eligible ? 1 : 0,
      claim_status: reimbursementProcessedData.claim_status || null,
      original_cost: reimbursementProcessedData.original_cost !== undefined ? reimbursementProcessedData.original_cost : null
    };

    const updatedExpense = await expenseRepository.update(id, expense);

    // Handle credit card balance updates for payment method changes
    const oldChargedAmount = oldExpense.original_cost !== null ? oldExpense.original_cost : oldExpense.amount;
    const newChargedAmount = expense.original_cost !== null ? expense.original_cost : expense.amount;
    const paymentMethodChanged = oldExpense.payment_method_id !== payment_method_id;
    const chargedAmountChanged = oldChargedAmount !== newChargedAmount;
    const oldEffectiveDate = this._getEffectivePostingDate(oldExpense);
    const newEffectiveDate = this._getEffectivePostingDate(expense);
    const effectiveDateChanged = oldEffectiveDate !== newEffectiveDate;
    const oldIsFuture = this._isFutureDate(oldEffectiveDate);
    const newIsFuture = this._isFutureDate(newEffectiveDate);

    if (paymentMethodChanged) {
      if (oldPaymentMethod && oldPaymentMethod.type === 'credit_card') {
        await this._updateCreditCardBalanceOnDelete(oldPaymentMethod, oldChargedAmount, oldEffectiveDate);
      }
      if (paymentMethod && paymentMethod.type === 'credit_card') {
        await this._updateCreditCardBalanceOnCreate(paymentMethod, newChargedAmount, newEffectiveDate);
      }
    } else if (paymentMethod && paymentMethod.type === 'credit_card') {
      if (effectiveDateChanged && oldIsFuture !== newIsFuture) {
        if (oldIsFuture && !newIsFuture) {
          await paymentMethodRepository.updateBalance(paymentMethod.id, newChargedAmount);
          logger.debug('Added expense to credit card balance (moved from future to past):', {
            paymentMethodId: paymentMethod.id,
            displayName: paymentMethod.display_name,
            amount: newChargedAmount
          });
        } else if (!oldIsFuture && newIsFuture) {
          await paymentMethodRepository.updateBalance(paymentMethod.id, -oldChargedAmount);
          logger.debug('Removed expense from credit card balance (moved from past to future):', {
            paymentMethodId: paymentMethod.id,
            displayName: paymentMethod.display_name,
            amount: oldChargedAmount
          });
        }
      } else if (chargedAmountChanged && !oldIsFuture && !newIsFuture) {
        const amountDiff = newChargedAmount - oldChargedAmount;
        await paymentMethodRepository.updateBalance(paymentMethod.id, amountDiff);
        logger.debug('Updated credit card balance after expense amount change:', {
          paymentMethodId: paymentMethod.id,
          displayName: paymentMethod.display_name,
          amountDiff
        });
      }
    }

    // Trigger budget recalculation for affected budgets
    const amountChanged = oldExpense.amount !== expense.amount;
    if (oldExpense) {
      const categoryChanged = oldExpense.type !== expense.type;
      const dateChanged = oldExpense.date !== expense.date;

      if (categoryChanged || amountChanged || dateChanged) {
        this._triggerBudgetRecalculation(oldExpense.date, oldExpense.type);
        if (categoryChanged || dateChanged) {
          this._triggerBudgetRecalculation(expense.date, expense.type);
        }
      }
    }

    // Log activity event
    await activityLogService.logEvent(
      'expense_updated',
      'expense',
      id,
      `Updated expense: ${expense.place || 'Unknown'} - $${expense.amount.toFixed(2)}`,
      {
        amount: expense.amount,
        category: expense.type,
        date: expense.date,
        place: expense.place
      }
    );

    // Log insurance status change if it changed
    const oldClaimStatus = oldExpense.claim_status;
    const newClaimStatus = expense.claim_status;
    if (oldClaimStatus !== newClaimStatus && (oldClaimStatus || newClaimStatus)) {
      await activityLogService.logEvent(
        'insurance_status_changed',
        'expense',
        id,
        `Insurance status changed: ${oldClaimStatus || 'None'} → ${newClaimStatus || 'None'}`,
        {
          previousStatus: oldClaimStatus || null,
          newStatus: newClaimStatus || null,
          place: expense.place,
          amount: expense.amount
        }
      );
    }

    if (monthsToCreate === 0) {
      return updatedExpense;
    }

    // Create future expenses with updated values
    const futureExpenses = [];
    const createdExpenseIds = [];

    try {
      for (let i = 1; i <= monthsToCreate; i++) {
        const futureDate = this._calculateFutureDate(reimbursementProcessedData.date, i);
        const futureExpenseData = {
          ...reimbursementProcessedData,
          date: futureDate,
          payment_method_id: payment_method_id,
          method: method
        };
        const futureExpense = await this._createSingleExpense(futureExpenseData);
        futureExpenses.push(futureExpense);
        createdExpenseIds.push(futureExpense.id);
      }
    } catch (error) {
      for (const expenseId of createdExpenseIds) {
        try {
          await expenseRepository.delete(expenseId);
        } catch (deleteError) {
          logger.error('Error during rollback cleanup:', deleteError);
        }
      }
      throw new Error('Failed to create future expenses. Please try again.');
    }

    return {
      expense: updatedExpense,
      futureExpenses: futureExpenses
    };
  }

  /**
   * Delete an expense.
   */
  async deleteExpense(id) {
    const expense = await expenseRepository.findById(id);
    if (!expense) {
      return false;
    }

    let paymentMethod = null;
    if (expense.payment_method_id) {
      paymentMethod = await paymentMethodRepository.findById(expense.payment_method_id);
    }

    const deleted = await expenseRepository.delete(id);

    if (deleted && paymentMethod) {
      const chargedAmount = expense.original_cost !== null ? expense.original_cost : expense.amount;
      await this._updateCreditCardBalanceOnDelete(paymentMethod, chargedAmount, expense.date);
    }

    if (deleted && expense) {
      this._triggerBudgetRecalculation(expense.date, expense.type);
      
      // Log activity event
      await activityLogService.logEvent(
        'expense_deleted',
        'expense',
        id,
        `Deleted expense: ${expense.place || 'Unknown'} - $${expense.amount.toFixed(2)}`,
        {
          amount: expense.amount,
          category: expense.type,
          date: expense.date,
          place: expense.place
        }
      );
    }

    return deleted;
  }

  // ─── Aggregation Delegation ──────────────────────────────────────────

  async getSummary(year, month, includePrevious = false) {
    return expenseAggregationService.getSummary(year, month, includePrevious);
  }

  async _getMonthSummary(year, month) {
    return expenseAggregationService._getMonthSummary(year, month);
  }

  _calculatePreviousMonth(year, month) {
    return expenseAggregationService._calculatePreviousMonth(year, month);
  }

  async getMonthlyGross(year, month) {
    return expenseAggregationService.getMonthlyGross(year, month);
  }

  async setMonthlyGross(year, month, grossAmount) {
    return expenseAggregationService.setMonthlyGross(year, month, grossAmount);
  }

  async getAnnualSummary(year) {
    return expenseAggregationService.getAnnualSummary(year);
  }

  async _getYearEndInvestmentValues(year) {
    return expenseAggregationService._getYearEndInvestmentValues(year);
  }

  async _getYearEndLoanBalances(year) {
    return expenseAggregationService._getYearEndLoanBalances(year);
  }

  async _getMonthlyVariableExpenses(year) {
    return expenseAggregationService._getMonthlyVariableExpenses(year);
  }

  async _getMonthlyFixedExpenses(year) {
    return expenseAggregationService._getMonthlyFixedExpenses(year);
  }

  async _getMonthlyIncome(year) {
    return expenseAggregationService._getMonthlyIncome(year);
  }

  async _getTransactionCount(year) {
    return expenseAggregationService._getTransactionCount(year);
  }

  async getExpensesByCategory(year, month, category) {
    return expenseAggregationService.getExpensesByCategory(year, month, category);
  }

  async _getCategoryTotals(year) {
    return expenseAggregationService._getCategoryTotals(year);
  }

  async getExpensesByPaymentMethod(year, month, method) {
    return expenseAggregationService.getExpensesByPaymentMethod(year, month, method);
  }

  async _getMethodTotals(year) {
    return expenseAggregationService._getMethodTotals(year);
  }

  _buildAnnualSummary(year, monthlyVariableExpenses, monthlyFixedExpenses, monthlyIncome, categoryTotals, methodTotals) {
    return expenseAggregationService._buildAnnualSummary(year, monthlyVariableExpenses, monthlyFixedExpenses, monthlyIncome, categoryTotals, methodTotals);
  }

  _createMonthMap(data) {
    return expenseAggregationService._createMonthMap(data);
  }

  _buildMonthlyTotals(fixedExpensesMap, variableExpensesMap, incomeMap) {
    return expenseAggregationService._buildMonthlyTotals(fixedExpensesMap, variableExpensesMap, incomeMap);
  }

  _arrayToObject(data, keyField) {
    return expenseAggregationService._arrayToObject(data, keyField);
  }

  // ─── Tax Delegation ──────────────────────────────────────────────────

  async getTaxDeductibleSummary(year) {
    return expenseTaxService.getTaxDeductibleSummary(year);
  }

  async getTaxDeductibleYoYSummary(year) {
    return expenseTaxService.getTaxDeductibleYoYSummary(year);
  }

  _calculateInsuranceSummary(medicalExpenses) {
    return expenseTaxService.calculateInsuranceSummary(medicalExpenses);
  }

  async getTaxDeductibleWithPeople(year) {
    return expenseTaxService.getTaxDeductibleWithPeople(year);
  }

  // ─── People Delegation ───────────────────────────────────────────────

  groupExpensesByPerson(expenses) {
    return expensePeopleService.groupExpensesByPerson(expenses);
  }

  calculatePersonTotals(expenses) {
    return expensePeopleService.calculatePersonTotals(expenses);
  }

  handleUnassignedExpenses(expenses) {
    return expensePeopleService.handleUnassignedExpenses(expenses);
  }

  async createExpenseWithPeople(expenseData, personAllocations = [], futureMonths = 0) {
    return expensePeopleService.createExpenseWithPeople(expenseData, personAllocations, futureMonths);
  }

  async updateExpenseWithPeople(id, expenseData, personAllocations = [], futureMonths = 0) {
    return expensePeopleService.updateExpenseWithPeople(id, expenseData, personAllocations, futureMonths);
  }

  async getExpenseWithPeople(id) {
    return expensePeopleService.getExpenseWithPeople(id);
  }

  // ─── Category Delegation ─────────────────────────────────────────────

  async getDistinctPlaces() {
    return expenseCategoryService.getDistinctPlaces();
  }

  async getSuggestedCategory(place) {
    return expenseCategoryService.getSuggestedCategory(place);
  }
}

module.exports = new ExpenseService();
