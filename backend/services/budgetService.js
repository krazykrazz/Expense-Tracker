const budgetRepository = require('../repositories/budgetRepository');
const { getDatabase } = require('../database/db');

class BudgetService {
  // Budgetable categories (excludes tax-deductible categories)
  static BUDGETABLE_CATEGORIES = ['Food', 'Gas', 'Other'];

  /**
   * Validate that a category is budgetable
   * @param {string} category - Category to validate
   * @throws {Error} If category is not budgetable
   */
  validateCategory(category) {
    if (!BudgetService.BUDGETABLE_CATEGORIES.includes(category)) {
      throw new Error(`Budget can only be set for ${BudgetService.BUDGETABLE_CATEGORIES.join(', ')} categories`);
    }
  }

  /**
   * Validate budget amount
   * @param {number} limit - Budget limit to validate
   * @throws {Error} If limit is not valid
   */
  validateAmount(limit) {
    const amount = parseFloat(limit);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Budget limit must be a positive number greater than zero');
    }
  }

  /**
   * Validate year and month
   * @param {number} year - Year to validate
   * @param {number} month - Month to validate (1-12)
   * @throws {Error} If year or month is invalid
   */
  validateYearMonth(year, month) {
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      throw new Error('Invalid year specified');
    }

    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      throw new Error('Invalid year or month specified');
    }
  }

  /**
   * Create a new budget
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @param {string} category - Expense category
   * @param {number} limit - Budget limit amount
   * @returns {Promise<Object>} Created budget
   */
  async createBudget(year, month, category, limit) {
    // Validate inputs
    this.validateYearMonth(year, month);
    this.validateCategory(category);
    this.validateAmount(limit);

    const budget = {
      year: parseInt(year),
      month: parseInt(month),
      category,
      limit: parseFloat(limit)
    };

    try {
      return await budgetRepository.create(budget);
    } catch (err) {
      // Handle duplicate budget error
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        throw new Error('A budget already exists for this category and month');
      }
      throw err;
    }
  }

  /**
   * Update a budget limit
   * @param {number} id - Budget ID
   * @param {number} limit - New budget limit amount
   * @returns {Promise<Object|null>} Updated budget or null if not found
   */
  async updateBudget(id, limit) {
    // Validate amount
    this.validateAmount(limit);

    const updated = await budgetRepository.updateLimit(id, parseFloat(limit));
    
    if (!updated) {
      throw new Error('Budget not found');
    }

    return updated;
  }

  /**
   * Delete a budget
   * @param {number} id - Budget ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteBudget(id) {
    const deleted = await budgetRepository.delete(id);
    
    if (!deleted) {
      throw new Error('Budget not found');
    }

    return true;
  }

  /**
   * Get budgets for a specific month with automatic carry-forward
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Array>} Array of budgets
   */
  async getBudgets(year, month) {
    // Validate inputs
    this.validateYearMonth(year, month);

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    // Try to get budgets for the requested month
    let budgets = await budgetRepository.findByYearMonth(yearNum, monthNum);

    // If no budgets exist for this month, automatically carry forward from previous month
    if (budgets.length === 0) {
      // Calculate previous month
      let prevYear = yearNum;
      let prevMonth = monthNum - 1;

      if (prevMonth < 1) {
        prevMonth = 12;
        prevYear = yearNum - 1;
      }

      // Get budgets from previous month
      const prevBudgets = await budgetRepository.findForCopy(prevYear, prevMonth);

      // If previous month has budgets, copy them to current month
      if (prevBudgets.length > 0) {
        const createdBudgets = [];
        
        for (const prevBudget of prevBudgets) {
          try {
            const newBudget = await budgetRepository.create({
              year: yearNum,
              month: monthNum,
              category: prevBudget.category,
              limit: prevBudget.limit
            });
            createdBudgets.push(newBudget);
          } catch (err) {
            // If duplicate error occurs (shouldn't happen but handle it), skip
            if (!err.message || !err.message.includes('UNIQUE constraint failed')) {
              throw err;
            }
          }
        }

        budgets = createdBudgets;
      }
    }

    return budgets;
  }

  /**
   * Calculate progress percentage
   * @param {number} spent - Amount spent
   * @param {number} limit - Budget limit
   * @returns {number} Progress percentage (spent / limit * 100)
   */
  calculateProgress(spent, limit) {
    if (limit <= 0) {
      return 0;
    }
    return (spent / limit) * 100;
  }

  /**
   * Calculate budget status based on progress percentage
   * @param {number} progress - Progress percentage
   * @returns {string} Status: 'safe', 'warning', 'danger', or 'critical'
   */
  calculateBudgetStatus(progress) {
    if (progress >= 100) {
      return 'critical';
    }
    if (progress >= 90) {
      return 'danger';
    }
    if (progress >= 80) {
      return 'warning';
    }
    return 'safe';
  }

  /**
   * Get spent amount for a category in a specific month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @param {string} category - Expense category
   * @returns {Promise<number>} Total spent amount
   */
  async getSpentAmount(year, month, category) {
    const db = await getDatabase();

    return new Promise((resolve, reject) => {
      const sql = `
        SELECT SUM(amount) as total
        FROM expenses
        WHERE strftime('%Y', date) = ? 
          AND strftime('%m', date) = ?
          AND type = ?
      `;

      const yearStr = year.toString();
      const monthStr = month.toString().padStart(2, '0');

      db.get(sql, [yearStr, monthStr, category], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row && row.total !== null ? parseFloat(row.total) : 0);
      });
    });
  }

  /**
   * Get budget progress for a specific budget
   * @param {number} budgetId - Budget ID
   * @returns {Promise<Object>} Budget progress object with spent, progress, remaining, and status
   */
  async getBudgetProgress(budgetId) {
    // Get the budget
    const budget = await budgetRepository.findById(budgetId);
    
    if (!budget) {
      throw new Error('Budget not found');
    }

    // Get spent amount for this category and month
    const spent = await this.getSpentAmount(budget.year, budget.month, budget.category);

    // Calculate progress and remaining
    const progress = this.calculateProgress(spent, budget.limit);
    const remaining = budget.limit - spent;
    const status = this.calculateBudgetStatus(progress);

    return {
      budget,
      spent,
      progress,
      remaining,
      status
    };
  }

  /**
   * Get budget summary for a specific month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Object>} Budget summary with totals and category details
   */
  async getBudgetSummary(year, month) {
    // Validate inputs
    this.validateYearMonth(year, month);

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    // Get all budgets for this month (with automatic carry-forward)
    const budgets = await this.getBudgets(yearNum, monthNum);

    // If no budgets exist, return empty summary
    if (budgets.length === 0) {
      return {
        totalBudgeted: 0,
        totalSpent: 0,
        remaining: 0,
        progress: 0,
        budgetsOnTrack: 0,
        totalBudgets: 0,
        categories: []
      };
    }

    // Calculate spent amount for each budget and build category details
    const categories = [];
    let totalBudgeted = 0;
    let totalSpent = 0;
    let budgetsOnTrack = 0;

    for (const budget of budgets) {
      const spent = await this.getSpentAmount(yearNum, monthNum, budget.category);
      const progress = this.calculateProgress(spent, budget.limit);
      const remaining = budget.limit - spent;
      const status = this.calculateBudgetStatus(progress);

      // Count budgets that are on track (under 100%)
      if (progress < 100) {
        budgetsOnTrack++;
      }

      // Add to totals
      totalBudgeted += budget.limit;
      totalSpent += spent;

      // Add category details
      categories.push({
        budget,
        spent,
        progress,
        remaining,
        status
      });
    }

    // Calculate overall progress and remaining
    const overallProgress = this.calculateProgress(totalSpent, totalBudgeted);
    const overallRemaining = totalBudgeted - totalSpent;

    return {
      totalBudgeted,
      totalSpent,
      remaining: overallRemaining,
      progress: overallProgress,
      budgetsOnTrack,
      totalBudgets: budgets.length,
      categories
    };
  }

  /**
   * Manually copy budgets from one month to another
   * @param {number} sourceYear - Source year
   * @param {number} sourceMonth - Source month (1-12)
   * @param {number} targetYear - Target year
   * @param {number} targetMonth - Target month (1-12)
   * @param {boolean} overwrite - Whether to overwrite existing budgets in target month
   * @returns {Promise<Object>} Copy statistics { copied, skipped, overwritten }
   */
  async copyBudgets(sourceYear, sourceMonth, targetYear, targetMonth, overwrite = false) {
    // Validate all inputs
    this.validateYearMonth(sourceYear, sourceMonth);
    this.validateYearMonth(targetYear, targetMonth);

    const srcYear = parseInt(sourceYear);
    const srcMonth = parseInt(sourceMonth);
    const tgtYear = parseInt(targetYear);
    const tgtMonth = parseInt(targetMonth);

    // Get budgets from source month
    const sourceBudgets = await budgetRepository.findForCopy(srcYear, srcMonth);

    // Validate source month has budgets
    if (sourceBudgets.length === 0) {
      const error = new Error('No budgets found in source month');
      error.code = 'NO_BUDGETS_TO_COPY';
      throw error;
    }

    // Check for existing budgets in target month
    const existingBudgets = await budgetRepository.findByYearMonth(tgtYear, tgtMonth);

    // If target has budgets and overwrite is false, throw conflict error
    if (existingBudgets.length > 0 && !overwrite) {
      const error = new Error('Target month already has budgets. Set overwrite=true to replace.');
      error.code = 'COPY_CONFLICT';
      throw error;
    }

    // Build a map of existing budgets by category for quick lookup
    const existingByCategory = {};
    existingBudgets.forEach(budget => {
      existingByCategory[budget.category] = budget;
    });

    // Perform copy operation
    let copied = 0;
    let skipped = 0;
    let overwritten = 0;

    for (const sourceBudget of sourceBudgets) {
      const existingBudget = existingByCategory[sourceBudget.category];

      if (existingBudget) {
        if (overwrite) {
          // Update existing budget with new limit
          try {
            await budgetRepository.updateLimit(existingBudget.id, sourceBudget.limit);
            overwritten++;
          } catch (err) {
            // If update fails, skip this budget
            skipped++;
          }
        } else {
          // Should not happen due to earlier check, but handle it
          skipped++;
        }
      } else {
        // Create new budget in target month
        try {
          await budgetRepository.create({
            year: tgtYear,
            month: tgtMonth,
            category: sourceBudget.category,
            limit: sourceBudget.limit
          });
          copied++;
        } catch (err) {
          // If creation fails (e.g., duplicate), skip this budget
          skipped++;
        }
      }
    }

    return {
      copied,
      skipped,
      overwritten
    };
  }

  /**
   * Get budget history for a specific time period
   * @param {number} year - End year
   * @param {number} month - End month (1-12)
   * @param {number} periodMonths - Number of months to look back (3, 6, or 12)
   * @returns {Promise<Object>} Historical budget data with success rates and averages
   */
  async getBudgetHistory(year, month, periodMonths = 6) {
    // Validate inputs
    this.validateYearMonth(year, month);

    const endYear = parseInt(year);
    const endMonth = parseInt(month);
    const period = parseInt(periodMonths);

    // Validate period
    if (![3, 6, 12].includes(period)) {
      throw new Error('Period must be 3, 6, or 12 months');
    }

    // Calculate start date
    const startDate = this._calculateStartDate(endYear, endMonth, period);

    // Get all months in the period
    const months = this._generateMonthRange(startDate.year, startDate.month, endYear, endMonth);

    // Collect all budgets and spending for each month
    const monthlyData = [];

    for (const monthInfo of months) {
      // Get budgets for this month (without auto-carry-forward to get actual data)
      const budgets = await budgetRepository.findByYearMonth(monthInfo.year, monthInfo.month);

      // Get spending for each budgetable category
      const spending = {};
      for (const category of BudgetService.BUDGETABLE_CATEGORIES) {
        spending[category] = await this.getSpentAmount(monthInfo.year, monthInfo.month, category);
      }

      monthlyData.push({
        year: monthInfo.year,
        month: monthInfo.month,
        budgets,
        spending
      });
    }

    // Aggregate data by category
    const categories = {};

    for (const category of BudgetService.BUDGETABLE_CATEGORIES) {
      const history = [];
      let totalSpent = 0;
      let monthsWithBudget = 0;
      let monthsBudgetMet = 0;

      for (const monthData of monthlyData) {
        const budget = monthData.budgets.find(b => b.category === category);
        const spent = monthData.spending[category];

        // Add to history
        history.push({
          year: monthData.year,
          month: monthData.month,
          budgeted: budget ? budget.limit : null,
          spent: spent,
          met: budget ? spent <= budget.limit : null
        });

        // Track totals for averages and success rate
        totalSpent += spent;

        if (budget) {
          monthsWithBudget++;
          if (spent <= budget.limit) {
            monthsBudgetMet++;
          }
        }
      }

      // Calculate success rate (percentage of months where budget was met)
      const successRate = monthsWithBudget > 0 
        ? (monthsBudgetMet / monthsWithBudget) * 100 
        : null;

      // Calculate average spending
      const averageSpent = monthlyData.length > 0 
        ? totalSpent / monthlyData.length 
        : 0;

      categories[category] = {
        history,
        successRate,
        averageSpent
      };
    }

    return {
      period: {
        start: `${startDate.year}-${String(startDate.month).padStart(2, '0')}-01`,
        end: `${endYear}-${String(endMonth).padStart(2, '0')}-01`,
        months: period
      },
      categories
    };
  }

  /**
   * Calculate start date for a period
   * @private
   * @param {number} endYear - End year
   * @param {number} endMonth - End month
   * @param {number} periodMonths - Number of months to look back
   * @returns {Object} Start date { year, month }
   */
  _calculateStartDate(endYear, endMonth, periodMonths) {
    let year = endYear;
    let month = endMonth - periodMonths + 1;

    while (month < 1) {
      month += 12;
      year -= 1;
    }

    return { year, month };
  }

  /**
   * Generate array of months in a range
   * @private
   * @param {number} startYear - Start year
   * @param {number} startMonth - Start month
   * @param {number} endYear - End year
   * @param {number} endMonth - End month
   * @returns {Array<Object>} Array of { year, month } objects
   */
  _generateMonthRange(startYear, startMonth, endYear, endMonth) {
    const months = [];
    let currentYear = startYear;
    let currentMonth = startMonth;

    while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
      months.push({ year: currentYear, month: currentMonth });

      currentMonth++;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
      }
    }

    return months;
  }
}

module.exports = new BudgetService();
