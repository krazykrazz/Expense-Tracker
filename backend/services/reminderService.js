const reminderRepository = require('../repositories/reminderRepository');
const logger = require('../config/logger');

class ReminderService {
  /**
   * Get reminder status for a specific month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Object>} Reminder status with counts and details
   */
  async getReminderStatus(year, month) {
    try {
      // Validate inputs
      if (!year || !month || month < 1 || month > 12) {
        throw new Error('Invalid year or month');
      }

      // Get investments with value status
      const investments = await reminderRepository.getInvestmentsWithValueStatus(year, month);
      
      // Get loans with balance status
      const loans = await reminderRepository.getLoansWithBalanceStatus(year, month);

      // Count missing data
      const missingInvestments = investments.filter(inv => !inv.hasValue).length;
      const missingLoans = loans.filter(loan => !loan.hasBalance).length;

      // Check if there are any active investments/loans
      const hasActiveInvestments = investments.length > 0;
      const hasActiveLoans = loans.length > 0;

      logger.debug('Reminder status calculated:', {
        year,
        month,
        missingInvestments,
        missingLoans,
        totalInvestments: investments.length,
        totalLoans: loans.length
      });

      return {
        missingInvestments,
        missingLoans,
        hasActiveInvestments,
        hasActiveLoans,
        investments: investments.map(inv => ({
          id: inv.id,
          name: inv.name,
          type: inv.type,
          hasValue: Boolean(inv.hasValue)
        })),
        loans: loans.map(loan => ({
          id: loan.id,
          name: loan.name,
          loan_type: loan.loan_type,
          hasBalance: Boolean(loan.hasBalance)
        }))
      };
    } catch (error) {
      logger.error('Error getting reminder status:', error);
      throw error;
    }
  }
}

module.exports = new ReminderService();
