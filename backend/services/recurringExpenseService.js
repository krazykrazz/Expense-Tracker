const recurringExpenseRepository = require('../repositories/recurringExpenseRepository');
const expenseRepository = require('../repositories/expenseRepository');
const { calculateWeek } = require('../utils/dateUtils');

class RecurringExpenseService {
  /**
   * Validate recurring expense data
   * @param {Object} template - Recurring expense template data to validate
   * @throws {Error} If validation fails
   */
  validateRecurringExpense(template) {
    const errors = [];

    // Required fields validation
    if (!template.place) {
      errors.push('Place is required');
    }

    if (template.amount === undefined || template.amount === null) {
      errors.push('Amount is required');
    }

    if (!template.type) {
      errors.push('Type is required');
    }

    if (!template.method) {
      errors.push('Payment method is required');
    }

    if (template.day_of_month === undefined || template.day_of_month === null) {
      errors.push('Day of month is required');
    }

    if (!template.start_month) {
      errors.push('Start month is required');
    }

    // Data type validation
    if (template.amount !== undefined && template.amount !== null) {
      const amount = parseFloat(template.amount);
      if (isNaN(amount) || amount <= 0) {
        errors.push('Amount must be a positive number');
      }
      // Check for max 2 decimal places
      if (!/^\d+(\.\d{1,2})?$/.test(template.amount.toString())) {
        errors.push('Amount must have at most 2 decimal places');
      }
    }

    // Day of month validation
    if (template.day_of_month !== undefined && template.day_of_month !== null) {
      const day = parseInt(template.day_of_month);
      if (isNaN(day) || day < 1 || day > 31) {
        errors.push('Day of month must be between 1 and 31');
      }
    }

    // Start month validation (YYYY-MM format)
    if (template.start_month && !this.isValidMonthFormat(template.start_month)) {
      errors.push('Start month must be in YYYY-MM format');
    }

    // End month validation (YYYY-MM format, optional)
    if (template.end_month && !this.isValidMonthFormat(template.end_month)) {
      errors.push('End month must be in YYYY-MM format');
    }

    // End month must be >= start month
    if (template.start_month && template.end_month) {
      if (template.end_month < template.start_month) {
        errors.push('End month must be greater than or equal to start month');
      }
    }

    // Type validation
    const validTypes = ['Other', 'Food', 'Gas'];
    if (template.type && !validTypes.includes(template.type)) {
      errors.push(`Type must be one of: ${validTypes.join(', ')}`);
    }

    // Method validation
    const validMethods = ['Cash', 'Debit', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'];
    if (template.method && !validMethods.includes(template.method)) {
      errors.push(`Payment method must be one of: ${validMethods.join(', ')}`);
    }

    // String length validation
    if (template.place && template.place.length > 200) {
      errors.push('Place must not exceed 200 characters');
    }

    if (template.notes && template.notes.length > 200) {
      errors.push('Notes must not exceed 200 characters');
    }

    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }
  }

  /**
   * Check if a month string is valid (YYYY-MM format)
   * @param {string} monthString - Month string to validate
   * @returns {boolean} True if valid
   */
  isValidMonthFormat(monthString) {
    if (!monthString.match(/^\d{4}-\d{2}$/)) {
      return false;
    }
    
    const [year, month] = monthString.split('-').map(Number);
    return year >= 1900 && year <= 2100 && month >= 1 && month <= 12;
  }

  /**
   * Create a new recurring expense template
   * @param {Object} templateData - Recurring expense template data
   * @returns {Promise<Object>} Created template
   */
  async createRecurring(templateData) {
    // Validate the template data
    this.validateRecurringExpense(templateData);

    // Prepare template object
    const template = {
      place: templateData.place,
      amount: parseFloat(templateData.amount),
      notes: templateData.notes || null,
      type: templateData.type,
      method: templateData.method,
      day_of_month: parseInt(templateData.day_of_month),
      start_month: templateData.start_month,
      end_month: templateData.end_month || null,
      paused: templateData.paused ? 1 : 0
    };

    // Create template in repository
    return await recurringExpenseRepository.create(template);
  }

  /**
   * Get all recurring expense templates
   * @returns {Promise<Array>} Array of recurring templates
   */
  async getRecurringExpenses() {
    return await recurringExpenseRepository.findAll();
  }

  /**
   * Update a recurring expense template
   * @param {number} id - Template ID
   * @param {Object} templateData - Updated template data
   * @returns {Promise<Object|null>} Updated template or null
   */
  async updateRecurring(id, templateData) {
    // Validate the template data
    this.validateRecurringExpense(templateData);

    // Prepare template object
    const template = {
      place: templateData.place,
      amount: parseFloat(templateData.amount),
      notes: templateData.notes || null,
      type: templateData.type,
      method: templateData.method,
      day_of_month: parseInt(templateData.day_of_month),
      start_month: templateData.start_month,
      end_month: templateData.end_month || null,
      paused: templateData.paused ? 1 : 0
    };

    // Update template in repository
    return await recurringExpenseRepository.update(id, template);
  }

  /**
   * Delete a recurring expense template
   * @param {number} id - Template ID
   * @returns {Promise<boolean>} True if deleted
   */
  async deleteRecurring(id) {
    return await recurringExpenseRepository.delete(id);
  }

  /**
   * Pause or resume a recurring expense template
   * @param {number} id - Template ID
   * @param {boolean} paused - Pause status
   * @returns {Promise<Object|null>} Updated template or null
   */
  async pauseRecurring(id, paused) {
    return await recurringExpenseRepository.togglePause(id, paused);
  }

  /**
   * Get active recurring templates for a specific month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Array>} Array of active templates
   */
  async getActiveTemplates(year, month) {
    return await recurringExpenseRepository.findActive(year, month);
  }

  /**
   * Get the number of days in a specific month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {number} Number of days in the month
   */
  getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  /**
   * Check if an expense already exists for a recurring template in a specific month
   * @param {number} recurringId - Recurring template ID
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<boolean>} True if expense exists
   */
  async expenseExistsForMonth(recurringId, year, month) {
    const db = await require('../database/db').getDatabase();
    
    return new Promise((resolve, reject) => {
      const yearStr = year.toString();
      const monthStr = month.toString().padStart(2, '0');
      
      const sql = `
        SELECT COUNT(*) as count
        FROM expenses
        WHERE recurring_id = ?
        AND strftime("%Y", date) = ?
        AND strftime("%m", date) = ?
      `;
      
      db.get(sql, [recurringId, yearStr, monthStr], (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row.count > 0);
      });
    });
  }

  /**
   * Generate expenses for a specific month from active recurring templates
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Array>} Array of generated expenses
   */
  async generateExpensesForMonth(year, month) {
    // Get all active templates for this month
    const templates = await this.getActiveTemplates(year, month);
    
    const generatedExpenses = [];
    
    // For each template, generate an expense if it doesn't already exist
    for (const template of templates) {
      // Check if expense already exists for this month
      const exists = await this.expenseExistsForMonth(template.id, year, month);
      
      if (!exists && !template.paused) {
        // Calculate the date - handle day-of-month edge cases
        const daysInMonth = this.getDaysInMonth(year, month);
        const day = Math.min(template.day_of_month, daysInMonth);
        
        const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        
        // Calculate week from date
        const week = calculateWeek(dateStr);
        
        // Create the expense
        const expense = {
          date: dateStr,
          place: template.place,
          amount: template.amount,
          notes: template.notes,
          type: template.type,
          week: week,
          method: template.method,
          recurring_id: template.id,
          is_generated: 1
        };
        
        // Insert the expense using the repository
        const db = await require('../database/db').getDatabase();
        
        await new Promise((resolve, reject) => {
          const sql = `
            INSERT INTO expenses (date, place, notes, amount, type, week, method, recurring_id, is_generated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          
          const params = [
            expense.date,
            expense.place,
            expense.notes || null,
            expense.amount,
            expense.type,
            expense.week,
            expense.method,
            expense.recurring_id,
            expense.is_generated
          ];
          
          db.run(sql, params, function(err) {
            if (err) {
              reject(err);
              return;
            }
            
            expense.id = this.lastID;
            resolve(expense);
          });
        });
        
        generatedExpenses.push(expense);
      }
    }
    
    return generatedExpenses;
  }
}

module.exports = new RecurringExpenseService();
