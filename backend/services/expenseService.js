const expenseRepository = require('../repositories/expenseRepository');
const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const loanService = require('./loanService');
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
   * Create a new expense
   * @param {Object} expenseData - Expense data
   * @returns {Promise<Object>} Created expense
   */
  async createExpense(expenseData) {
    // Validate the expense data
    this.validateExpense(expenseData);

    // Calculate week from date
    const week = calculateWeek(expenseData.date);

    // Prepare expense object with calculated week
    const expense = {
      date: expenseData.date,
      place: expenseData.place || null,
      notes: expenseData.notes || null,
      amount: parseFloat(expenseData.amount),
      type: expenseData.type,
      week: week,
      method: expenseData.method,
      recurring_id: expenseData.recurring_id !== undefined ? expenseData.recurring_id : null,
      is_generated: expenseData.is_generated !== undefined ? expenseData.is_generated : 0
    };

    // Create expense in repository
    const createdExpense = await expenseRepository.create(expense);

    // Trigger budget recalculation for affected budget
    this._triggerBudgetRecalculation(expense.date, expense.type);

    return createdExpense;
  }

  /**
   * Get all expenses with optional filters
   * @param {Object} filters - Optional filters { year, month }
   * @returns {Promise<Array>} Array of expenses
   */
  async getExpenses(filters = {}) {
    return await expenseRepository.findAll(filters);
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
   * Update an expense
   * @param {number} id - Expense ID
   * @param {Object} expenseData - Updated expense data
   * @returns {Promise<Object|null>} Updated expense or null
   */
  async updateExpense(id, expenseData) {
    // Get the old expense data before updating
    const oldExpense = await expenseRepository.findById(id);

    // Validate the expense data
    this.validateExpense(expenseData);

    // Calculate week from date
    const week = calculateWeek(expenseData.date);

    // Prepare expense object with calculated week
    const expense = {
      date: expenseData.date,
      place: expenseData.place || null,
      notes: expenseData.notes || null,
      amount: parseFloat(expenseData.amount),
      type: expenseData.type,
      week: week,
      method: expenseData.method
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

    return updatedExpense;
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
    const [summary, monthlyGross, totalFixedExpenses, loans, fixedCategoryTotals, fixedPaymentTotals] = await Promise.all([
      expenseRepository.getSummary(year, month),
      expenseRepository.getMonthlyGross(year, month),
      fixedExpenseRepository.getTotalFixedExpenses(year, month),
      loanService.getLoansForMonth(year, month),
      fixedExpenseRepository.getCategoryTotals(year, month),
      fixedExpenseRepository.getPaymentTypeTotals(year, month)
    ]);
    
    // Calculate total outstanding debt from active loans
    const totalOutstandingDebt = loanService.calculateTotalOutstandingDebt(loans);
    
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
      totalOutstandingDebt
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
      methodTotals
    ] = await Promise.all([
      this._getMonthlyVariableExpenses(year),
      this._getMonthlyFixedExpenses(year),
      this._getMonthlyIncome(year),
      this._getCategoryTotals(year),
      this._getMethodTotals(year)
    ]);

    // Build summary from fetched data
    return this._buildAnnualSummary(
      year,
      monthlyVariableExpenses,
      monthlyFixedExpenses,
      monthlyIncome,
      categoryTotals,
      methodTotals
    );
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
      }
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
}

module.exports = new ExpenseService();
