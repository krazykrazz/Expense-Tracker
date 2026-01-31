const reminderRepository = require('../repositories/reminderRepository');
const logger = require('../config/logger');

/**
 * Number of days before due date to show a reminder
 */
const REMINDER_DAYS_THRESHOLD = 7;

class ReminderService {
  /**
   * Calculate days until next payment due date
   * @param {number} paymentDueDay - Day of month payment is due (1-31)
   * @param {Date} referenceDate - Reference date (defaults to today)
   * @returns {number|null} Days until due or null if no due day set
   */
  calculateDaysUntilDue(paymentDueDay, referenceDate = new Date()) {
    if (!paymentDueDay || paymentDueDay < 1 || paymentDueDay > 31) {
      return null;
    }

    const today = new Date(referenceDate);
    today.setHours(0, 0, 0, 0);
    
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    let dueDate;
    
    if (currentDay <= paymentDueDay) {
      // Due date is this month
      dueDate = new Date(currentYear, currentMonth, paymentDueDay);
    } else {
      // Due date is next month
      dueDate = new Date(currentYear, currentMonth + 1, paymentDueDay);
    }
    
    // Handle months with fewer days
    // If the due day doesn't exist in the target month, use the last day
    const lastDayOfMonth = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0).getDate();
    if (paymentDueDay > lastDayOfMonth) {
      dueDate.setDate(lastDayOfMonth);
    }
    
    const diffTime = dueDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  }

  /**
   * Get credit card payment reminders
   * Returns credit cards with payments due within the reminder threshold
   * @param {Date} referenceDate - Reference date (defaults to today)
   * @returns {Promise<Object>} Credit card reminder status
   */
  async getCreditCardReminders(referenceDate = new Date()) {
    try {
      // Get all active credit cards with due dates
      const creditCards = await reminderRepository.getCreditCardsWithDueDates();
      
      // Calculate days until due for each card and filter those due soon
      const cardsWithDueDates = creditCards.map(card => {
        const daysUntilDue = this.calculateDaysUntilDue(card.payment_due_day, referenceDate);
        const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
        const isDueSoon = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= REMINDER_DAYS_THRESHOLD;
        
        return {
          id: card.id,
          display_name: card.display_name,
          full_name: card.full_name,
          current_balance: card.current_balance || 0,
          credit_limit: card.credit_limit,
          payment_due_day: card.payment_due_day,
          days_until_due: daysUntilDue,
          is_overdue: isOverdue,
          is_due_soon: isDueSoon
        };
      });
      
      // Filter to only cards that need attention (overdue or due soon)
      const overdueCards = cardsWithDueDates.filter(card => card.is_overdue);
      const dueSoonCards = cardsWithDueDates.filter(card => card.is_due_soon);
      
      return {
        overdueCount: overdueCards.length,
        dueSoonCount: dueSoonCards.length,
        hasActiveCreditCards: creditCards.length > 0,
        overdueCards,
        dueSoonCards,
        allCreditCards: cardsWithDueDates
      };
    } catch (error) {
      logger.error('Error getting credit card reminders:', error);
      throw error;
    }
  }

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

      // Get credit card payment reminders
      const creditCardReminders = await this.getCreditCardReminders();

      // Count missing data
      const missingInvestments = investments.filter(inv => !inv.hasValue).length;
      const missingLoans = loans.filter(loan => !loan.hasBalance).length;

      // Check if there are any active investments/loans
      const hasActiveInvestments = investments.length > 0;
      const hasActiveLoans = loans.length > 0;

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
        })),
        // Credit card payment reminders
        creditCardReminders: {
          overdueCount: creditCardReminders.overdueCount,
          dueSoonCount: creditCardReminders.dueSoonCount,
          hasActiveCreditCards: creditCardReminders.hasActiveCreditCards,
          overdueCards: creditCardReminders.overdueCards,
          dueSoonCards: creditCardReminders.dueSoonCards
        }
      };
    } catch (error) {
      logger.error('Error getting reminder status:', error);
      throw error;
    }
  }
}

module.exports = new ReminderService();
