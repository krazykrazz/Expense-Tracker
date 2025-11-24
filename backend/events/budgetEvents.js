const EventEmitter = require('events');

/**
 * Event emitter for budget-related events
 * This breaks the circular dependency between expenseService and budgetService
 */
class BudgetEventEmitter extends EventEmitter {
  /**
   * Emit an event to trigger budget recalculation
   * @param {string} date - Expense date (YYYY-MM-DD)
   * @param {string} category - Expense category
   */
  emitBudgetRecalculation(date, category) {
    this.emit('budgetRecalculation', { date, category });
  }
}

// Export singleton instance
module.exports = new BudgetEventEmitter();
