const expenseRepository = require('../repositories/expenseRepository');
const expensePeopleRepository = require('../repositories/expensePeopleRepository');
const peopleRepository = require('../repositories/peopleRepository');
const paymentMethodRepository = require('../repositories/paymentMethodRepository');
const plaidRepository = require('../repositories/plaidRepository');
const plaidInsuranceRepository = require('../repositories/plaidInsuranceRepository');
const { calculateWeek, getTodayString } = require('../utils/dateUtils');
const { dayNumber, LIKELY_PENDING_DAYS } = require('../utils/plaidCardBalanceMath');
const logger = require('../config/logger');
const expenseValidationService = require('./expenseValidationService');
const expenseInsuranceService = require('./expenseInsuranceService');
const expensePeopleService = require('./expensePeopleService');
const expenseTaxService = require('./expenseTaxService');
const expenseAggregationService = require('./expenseAggregationService');
const expenseCategoryService = require('./expenseCategoryService');
const activityLogService = require('./activityLogService');
const { getDatabase, withTransaction } = require('../database/db');

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
    await Promise.all(personAllocations.map(async (allocation) => {
      const person = await peopleRepository.findById(allocation.personId);
      if (!person) {
        throw new Error(`Person with ID ${allocation.personId} does not exist. Please add people in the People Management section first.`);
      }
    }));
  }

  /**
   * Resolve payment method from either payment_method_id or method string.
   * Returns both the payment_method_id and display_name (method string).
   * @private
   */
  async _resolvePaymentMethod(expenseData, dbConnection = null) {
    if (expenseData.payment_method_id) {
      const paymentMethod = dbConnection
        ? await paymentMethodRepository.findById(expenseData.payment_method_id, dbConnection)
        : await paymentMethodRepository.findById(expenseData.payment_method_id);
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
      const paymentMethod = dbConnection
        ? await paymentMethodRepository.findByDisplayName(expenseData.method, dbConnection)
        : await paymentMethodRepository.findByDisplayName(expenseData.method);
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
  async _createSingleExpense(expenseData, tabId = null, options = {}) {
    const {
      dbConnection = null,
      skipSideEffects = false
    } = options;

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

    const { payment_method_id, method } = await this._resolvePaymentMethod(reimbursementProcessedData, dbConnection);
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

    const createdExpense = dbConnection
      ? await expenseRepository.create(expense, dbConnection)
      : await expenseRepository.create(expense);

    if (skipSideEffects) {
      return createdExpense;
    }

    await this._logExpenseAdded(createdExpense, method, tabId);
    return createdExpense;
  }

  /** Activity log (and so cross-tab refresh) for a created expense. */
  async _logExpenseAdded(expense, method, tabId = null) {
    await activityLogService.logEvent(
      'expense_added',
      'expense',
      expense.id,
      `Added expense: ${expense.place || 'Unknown'} - ${expense.amount.toFixed(2)} (${expense.date}, ${method})`,
      {
        amount: expense.amount,
        category: expense.type,
        date: expense.date,
        place: expense.place,
        method,
        tabId
      }
    );
  }

  /**
   * Create one expense inside a transaction the caller holds (dbHelper.runInTransaction), so it commits or rolls
   * back together with the caller's other writes; e.g. Bank Import adds an expense and links its bank
   * transaction as one step. Validation applies as usual. The activity log must wait
   * for the commit, so it is returned instead of written: call `logCreated()` after the transaction.
   * @param {object} expenseData
   * @param {object} dbConnection the shared connection the transaction is open on
   * @returns {Promise<{expense: object, logCreated: () => Promise<void>}>}
   */
  async createExpenseInTransaction(expenseData, dbConnection, tabId = null) {
    this.validateExpense(expenseData);
    const expense = await this._createSingleExpense(expenseData, tabId, { dbConnection, skipSideEffects: true });
    return { expense, logCreated: () => this._logExpenseAdded(expense, expense.method, tabId) };
  }

  /**
   * Create a new expense with optional future months.
   */
  async createExpense(expenseData, futureMonths = 0, tabId = null) {
    this.validateExpense(expenseData);
    this._validateFutureMonths(futureMonths);

    const monthsToCreate = futureMonths || 0;

    if (monthsToCreate === 0) {
      return this._createSingleExpense(expenseData, tabId);
    }

    const db = await getDatabase();
    const sideEffects = [];

    try {
      const result = await withTransaction(db, async (txDb) => {
        const sourceExpense = await this._createSingleExpense(expenseData, tabId, {
          dbConnection: txDb,
          skipSideEffects: true
        });

        sideEffects.push({
          expense: sourceExpense,
          method: sourceExpense.method,
          tabId
        });

        const futureExpenses = [];
        for (let i = 1; i <= monthsToCreate; i++) {
          const futureDate = this._calculateFutureDate(expenseData.date, i);
          const futureExpenseData = { ...expenseData, date: futureDate };
          const futureExpense = await this._createSingleExpense(futureExpenseData, tabId, {
            dbConnection: txDb,
            skipSideEffects: true
          });
          futureExpenses.push(futureExpense);
          sideEffects.push({
            expense: futureExpense,
            method: futureExpense.method,
            tabId
          });
        }

        return {
          expense: sourceExpense,
          futureExpenses
        };
      });

      for (const sideEffect of sideEffects) {
        await this._logExpenseAdded(sideEffect.expense, sideEffect.method, tabId);
      }

      return result;
    } catch (error) {
      throw Object.assign(new Error('Failed to create future expenses. Please try again.'), { statusCode: 500 });
    }
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

    const bankLinks = expenses.length > 0
      ? await plaidRepository.findLinksForExpenses(expenses.map(e => e.id))
      : new Map();
    await this._markProbablyPending(bankLinks);

    const insuranceIds = expenses.filter(e => e.insurance_eligible).map(e => e.id);
    const reimbursements = await plaidInsuranceRepository.findReimbursementsForExpenses(insuranceIds);

    return expenses.map(expense => {
      const bankLink = bankLinks.get(expense.id) ?? null;
      // Insurer deposits applied to this claim (spec 3.7); only on insurance-eligible expenses
      const insurance = expense.insurance_eligible ? { insuranceReimbursements: reimbursements.get(expense.id) || [] } : {};
      if (expense.type === 'Tax - Medical') {
        return { ...expense, people: peopleByExpense[expense.id] || [], bankLink, ...insurance };
      }
      return { ...expense, bankLink, ...insurance };
    });
  }

  /**
   * Charges sent to Plaid as posted by a bank that never flags pending ones (Wealthsimple) but that its card
   * balance doesn't include yet get `probablyPending` on their bank link, so the list shows them as pending
   * until a later balance includes them (plaidCardBalanceService.probablyPendingIds). Only recent settled links
   * can be; never fails the list.
   * @param {Map<number, object>} bankLinks from plaidRepository.findLinksForExpenses (changed in place)
   */
  async _markProbablyPending(bankLinks) {
    const fromDate = new Date((dayNumber(getTodayString()) - LIKELY_PENDING_DAYS) * 86400000).toISOString().slice(0, 10);
    const candidates = [...bankLinks.values()].filter(link => !link.pending && !link.removed && link.date >= fromDate);
    if (candidates.length === 0) return;
    try {
      // Required here: plaidCardBalanceService depends on payment method services that depend on this one
      const ids = await require('./plaidCardBalanceService').probablyPendingIds();
      for (const link of candidates) {
        if (ids.has(link.bankTransactionId)) link.probablyPending = true;
      }
    } catch (err) {
      logger.warn('Could not check which bank charges are probably still pending', { error: err.message });
    }
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
  async updateExpense(id, expenseData, futureMonths = 0, tabId = null) {
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
    const applyPrimaryUpdate = async (dbConnection = null) => {
      const { payment_method_id, method } = await this._resolvePaymentMethod(reimbursementProcessedData, dbConnection);

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

      const updatedExpense = dbConnection
        ? await expenseRepository.update(id, expense, dbConnection)
        : await expenseRepository.update(id, expense);

      return { updatedExpense, expense, payment_method_id, method };
    };

    let updatedExpense;
    let expense;
    let method;
    let payment_method_id;
    let futureExpenses = [];

    if (monthsToCreate === 0) {
      const result = await applyPrimaryUpdate();
      updatedExpense = result.updatedExpense;
      expense = result.expense;
      method = result.method;
      payment_method_id = result.payment_method_id;
    } else {
      const db = await getDatabase();
      const futureSideEffects = [];

      try {
        const txResult = await withTransaction(db, async (txDb) => {
          const result = await applyPrimaryUpdate(txDb);
          const createdFutureExpenses = [];

          for (let i = 1; i <= monthsToCreate; i++) {
            const futureDate = this._calculateFutureDate(reimbursementProcessedData.date, i);
            const futureExpenseData = {
              ...reimbursementProcessedData,
              date: futureDate,
              payment_method_id: result.payment_method_id,
              method: result.method
            };

            const futureExpense = await this._createSingleExpense(futureExpenseData, tabId, {
              dbConnection: txDb,
              skipSideEffects: true
            });

            createdFutureExpenses.push(futureExpense);
            futureSideEffects.push({
              expense: futureExpense,
              method: futureExpense.method
            });
          }

          return {
            ...result,
            futureExpenses: createdFutureExpenses
          };
        });

        updatedExpense = txResult.updatedExpense;
        expense = txResult.expense;
        method = txResult.method;
        payment_method_id = txResult.payment_method_id;
        futureExpenses = txResult.futureExpenses;

        for (const sideEffect of futureSideEffects) {
          await this._logExpenseAdded(sideEffect.expense, sideEffect.method, tabId);
        }
      } catch (error) {
        throw Object.assign(new Error('Failed to create future expenses. Please try again.'), { statusCode: 500 });
      }
    }

    // Build change description
    const changes = [];
    if ((oldExpense.place || '') !== (expense.place || '')) {
      changes.push(`place: ${oldExpense.place || 'none'} → ${expense.place || 'none'}`);
    }
    if (oldExpense.amount !== expense.amount) {
      changes.push(`amount: $${oldExpense.amount.toFixed(2)} → $${expense.amount.toFixed(2)}`);
    }
    if (oldExpense.type !== expense.type) {
      changes.push(`category: ${oldExpense.type} → ${expense.type}`);
    }
    if (oldExpense.date !== expense.date) {
      changes.push(`date: ${oldExpense.date} → ${expense.date}`);
    }
    if (oldExpense.method !== expense.method) {
      changes.push(`method: ${oldExpense.method} → ${expense.method}`);
    }
    if ((oldExpense.posted_date || null) !== (expense.posted_date || null)) {
      changes.push(`posted date: ${oldExpense.posted_date || 'none'} → ${expense.posted_date || 'none'}`);
    }
    const changeSummary = changes.length > 0 ? ` (${changes.join(', ')})` : '';

    // Log activity event
    await activityLogService.logEvent(
      'expense_updated',
      'expense',
      id,
      `Updated expense: ${expense.place || 'Unknown'} - ${expense.amount.toFixed(2)} on ${expense.date}${changeSummary}`,
      {
        amount: expense.amount,
        category: expense.type,
        date: expense.date,
        place: expense.place,
        method: expense.method,
        changes: changes,
        tabId
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
        `Insurance status changed: ${oldClaimStatus || 'None'} → ${newClaimStatus || 'None'} (${expense.place || 'Unknown'} - $${expense.amount.toFixed(2)})`,
        {
          previousStatus: oldClaimStatus || null,
          newStatus: newClaimStatus || null,
          place: expense.place,
          amount: expense.amount,
          tabId
        }
      );
    }

    if (monthsToCreate === 0) {
      return updatedExpense;
    }

    return {
      expense: updatedExpense,
      futureExpenses
    };
  }

  /**
   * Delete an expense.
   */
  async deleteExpense(id, tabId = null) {
    const expense = await expenseRepository.findById(id);
    if (!expense) {
      return false;
    }

    const deleted = await expenseRepository.delete(id);

    if (deleted && expense) {
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
          place: expense.place,
          tabId
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

  async createExpenseWithPeople(expenseData, personAllocations = [], futureMonths = 0, tabId = null) {
    return expensePeopleService.createExpenseWithPeople(expenseData, personAllocations, futureMonths, tabId);
  }

  async updateExpenseWithPeople(id, expenseData, personAllocations = [], futureMonths = 0, tabId = null) {
    return expensePeopleService.updateExpenseWithPeople(id, expenseData, personAllocations, futureMonths, tabId);
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
