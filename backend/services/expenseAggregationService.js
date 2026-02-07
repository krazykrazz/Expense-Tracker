const expenseRepository = require('../repositories/expenseRepository');
const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const loanService = require('./loanService');
const investmentService = require('./investmentService');
const { getDatabase } = require('../database/db');
const { validateYearMonth } = require('../utils/validators');
const logger = require('../config/logger');

class ExpenseAggregationService {
  /**
   * Get summary for a specific month, optionally including previous month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @param {boolean} includePrevious - Whether to include previous month data
   * @returns {Promise<Object>} Month summary or { current, previous }
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
      yearEndLoans,
      transactionCount
    ] = await Promise.all([
      this._getMonthlyVariableExpenses(year),
      this._getMonthlyFixedExpenses(year),
      this._getMonthlyIncome(year),
      this._getCategoryTotals(year),
      this._getMethodTotals(year),
      this._getYearEndInvestmentValues(year),
      this._getYearEndLoanBalances(year),
      this._getTransactionCount(year)
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
      totalLiabilities,
      transactionCount
    };
  }

  /**
   * Get year-end investment values (prefer December, fallback to latest month)
   * @param {number} year - Year
   * @returns {Promise<Array>} Array of investment values
   * @private
   */
  async _getYearEndInvestmentValues(year) {
    const db = await getDatabase();
    
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
    const db = await getDatabase();
    
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
    const db = await getDatabase();
    
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
    const db = await getDatabase();
    
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
    const db = await getDatabase();
    
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
   * Get total transaction count for a year (variable expenses only)
   * @param {number} year - Year
   * @returns {Promise<number>} Transaction count
   * @private
   */
  async _getTransactionCount(year) {
    const db = await getDatabase();
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT COUNT(*) as count
        FROM expenses
        WHERE strftime('%Y', date) = ?
      `;
      
      db.get(query, [year.toString()], (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
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
    const db = await getDatabase();
    
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
    const db = await getDatabase();
    
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
}

module.exports = new ExpenseAggregationService();
