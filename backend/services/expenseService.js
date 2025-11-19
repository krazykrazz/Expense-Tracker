const expenseRepository = require('../repositories/expenseRepository');
const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const loanService = require('./loanService');
const { calculateWeek } = require('../utils/dateUtils');

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
    const validTypes = ['Other', 'Food', 'Gas', 'Tax - Medical', 'Tax - Donation'];
    if (expense.type && !validTypes.includes(expense.type)) {
      errors.push(`Type must be one of: ${validTypes.join(', ')}`);
    }

    // Method validation
    const validMethods = ['Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'];
    if (expense.method && !validMethods.includes(expense.method)) {
      errors.push(`Payment method must be one of: ${validMethods.join(', ')}`);
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
    return await expenseRepository.create(expense);
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
    return await expenseRepository.update(id, expense);
  }

  /**
   * Delete an expense
   * @param {number} id - Expense ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteExpense(id) {
    return await expenseRepository.delete(id);
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
    if (!year || !month) {
      throw new Error('Year and month are required for summary');
    }

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (isNaN(yearNum) || isNaN(monthNum)) {
      throw new Error('Year and month must be valid numbers');
    }

    if (monthNum < 1 || monthNum > 12) {
      throw new Error('Month must be between 1 and 12');
    }

    // Get current month summary
    const summary = await expenseRepository.getSummary(yearNum, monthNum);
    const monthlyGross = await expenseRepository.getMonthlyGross(yearNum, monthNum);
    const totalFixedExpenses = await fixedExpenseRepository.getTotalFixedExpenses(yearNum, monthNum);
    
    // Fetch loans for the selected month (filters by start_date and excludes paid off)
    const loans = await loanService.getLoansForMonth(yearNum, monthNum);
    
    // Calculate total outstanding debt from active loans
    const totalOutstandingDebt = loanService.calculateTotalOutstandingDebt(loans);
    
    // Add monthly gross, fixed expenses, loans, and net balance to summary
    summary.monthlyGross = monthlyGross || 0;
    summary.totalFixedExpenses = totalFixedExpenses || 0;
    summary.totalExpenses = summary.total + summary.totalFixedExpenses;
    summary.netBalance = summary.monthlyGross - summary.totalExpenses;
    summary.loans = loans;
    summary.totalOutstandingDebt = totalOutstandingDebt;
    
    // If includePrevious is false, return just the current summary
    if (!includePrevious) {
      return summary;
    }
    
    // Calculate previous month (handle year rollover)
    let prevYear = yearNum;
    let prevMonth = monthNum - 1;
    
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear = yearNum - 1;
    }
    
    // Get previous month summary
    const prevSummary = await expenseRepository.getSummary(prevYear, prevMonth);
    const prevMonthlyGross = await expenseRepository.getMonthlyGross(prevYear, prevMonth);
    const prevTotalFixedExpenses = await fixedExpenseRepository.getTotalFixedExpenses(prevYear, prevMonth);
    
    // Fetch loans for the previous month
    const prevLoans = await loanService.getLoansForMonth(prevYear, prevMonth);
    
    // Calculate total outstanding debt from active loans for previous month
    const prevTotalOutstandingDebt = loanService.calculateTotalOutstandingDebt(prevLoans);
    
    // Add monthly gross, fixed expenses, loans, and net balance to previous summary
    prevSummary.monthlyGross = prevMonthlyGross || 0;
    prevSummary.totalFixedExpenses = prevTotalFixedExpenses || 0;
    prevSummary.totalExpenses = prevSummary.total + prevSummary.totalFixedExpenses;
    prevSummary.netBalance = prevSummary.monthlyGross - prevSummary.totalExpenses;
    prevSummary.loans = prevLoans;
    prevSummary.totalOutstandingDebt = prevTotalOutstandingDebt;
    
    // Return both current and previous month data
    return {
      current: summary,
      previous: prevSummary
    };
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
    const db = await require('../database/db').getDatabase();
    
    return new Promise((resolve, reject) => {
      // Get monthly variable expenses (from expenses table)
      const monthlyQuery = `
        SELECT 
          CAST(strftime('%m', date) AS INTEGER) as month,
          SUM(amount) as total
        FROM expenses
        WHERE strftime('%Y', date) = ?
        GROUP BY strftime('%m', date)
        ORDER BY month
      `;
      
      db.all(monthlyQuery, [year.toString()], (err, monthlyVariableExpenses) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Get monthly fixed expenses (from fixed_expenses table)
        const fixedExpensesQuery = `
          SELECT 
            month,
            SUM(amount) as total
          FROM fixed_expenses
          WHERE year = ?
          GROUP BY month
          ORDER BY month
        `;
        
        db.all(fixedExpensesQuery, [year], (err, monthlyFixedExpenses) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Get monthly income (from income_sources table)
          const incomeQuery = `
            SELECT 
              month,
              SUM(amount) as total
            FROM income_sources
            WHERE year = ?
            GROUP BY month
            ORDER BY month
          `;
          
          db.all(incomeQuery, [year], (err, monthlyIncome) => {
            if (err) {
              reject(err);
              return;
            }
            
            // Get category breakdown
            const categoryQuery = `
              SELECT type, SUM(amount) as total
              FROM expenses
              WHERE strftime('%Y', date) = ?
              GROUP BY type
              ORDER BY total DESC
            `;
            
            db.all(categoryQuery, [year.toString()], (err, categoryTotals) => {
              if (err) {
                reject(err);
                return;
              }
              
              // Get payment method breakdown
              const methodQuery = `
                SELECT method, SUM(amount) as total
                FROM expenses
                WHERE strftime('%Y', date) = ?
                GROUP BY method
                ORDER BY total DESC
              `;
              
              db.all(methodQuery, [year.toString()], (err, methodTotals) => {
                if (err) {
                  reject(err);
                  return;
                }
                
                // Create lookup maps for fixed expenses and income
                const fixedExpensesMap = {};
                monthlyFixedExpenses.forEach(m => {
                  fixedExpensesMap[m.month] = m.total;
                });
                
                const incomeMap = {};
                monthlyIncome.forEach(m => {
                  incomeMap[m.month] = m.total;
                });
                
                const variableExpensesMap = {};
                monthlyVariableExpenses.forEach(m => {
                  variableExpensesMap[m.month] = m.total;
                });
                
                // Build complete monthly breakdown for all 12 months
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
                
                // Calculate annual totals
                const totalVariableExpenses = monthlyVariableExpenses.reduce((sum, m) => sum + m.total, 0);
                const totalFixedExpenses = monthlyFixedExpenses.reduce((sum, m) => sum + m.total, 0);
                const totalExpenses = totalVariableExpenses + totalFixedExpenses;
                const totalIncome = monthlyIncome.reduce((sum, m) => sum + m.total, 0);
                const netIncome = totalIncome - totalExpenses;
                
                // Calculate average monthly (only for months with data)
                const monthsWithData = monthlyTotals.filter(m => m.total > 0).length;
                const averageMonthly = monthsWithData > 0 ? totalExpenses / monthsWithData : 0;
                
                // Find highest and lowest months (based on total expenses)
                const monthsWithExpenses = monthlyTotals.filter(m => m.total > 0);
                const highestMonth = monthsWithExpenses.length > 0 
                  ? monthsWithExpenses.reduce((max, m) => m.total > max.total ? m : max, monthsWithExpenses[0])
                  : null;
                
                const lowestMonth = monthsWithExpenses.length > 0
                  ? monthsWithExpenses.reduce((min, m) => m.total < min.total ? m : min, monthsWithExpenses[0])
                  : null;
                
                // Convert arrays to objects for easier frontend consumption
                const byCategory = {};
                categoryTotals.forEach(c => {
                  byCategory[c.type] = c.total;
                });
                
                const byMethod = {};
                methodTotals.forEach(m => {
                  byMethod[m.method] = m.total;
                });
                
                resolve({
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
                });
              });
            });
          });
        });
      });
    });
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
}

module.exports = new ExpenseService();
