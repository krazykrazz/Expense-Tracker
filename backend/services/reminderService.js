const reminderRepository = require('../repositories/reminderRepository');
const statementBalanceService = require('./statementBalanceService');
const billingCycleRepository = require('../repositories/billingCycleRepository');
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
   * Uses actual statement balance from billing cycle history as authoritative source
   * Falls back to calculated statement balance, then current_balance for backward compatibility
   * @param {Date} referenceDate - Reference date (defaults to today)
   * @returns {Promise<Object>} Credit card reminder status
   * _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 7.4, 7.5, 7.6_
   */
  async getCreditCardReminders(referenceDate = new Date()) {
    try {
      // Get all active credit cards with due dates
      const creditCards = await reminderRepository.getCreditCardsWithDueDates();
      
      // Calculate statement balance and days until due for each card
      const cardsWithDueDates = await Promise.all(creditCards.map(async (card) => {
        const daysUntilDue = this.calculateDaysUntilDue(card.payment_due_day, referenceDate);
        
        // Calculate statement balance if billing cycle is configured
        // _Requirements: 5.1, 5.6_
        let statementInfo = null;
        let billingCycleRecord = null;
        
        if (card.billing_cycle_day) {
          try {
            statementInfo = await statementBalanceService.calculateStatementBalance(
              card.id,
              referenceDate
            );
            
            // Check for actual statement balance from billing cycle history
            // _Requirements: 7.4, 7.5, 7.6_
            if (statementInfo?.cycleEndDate) {
              billingCycleRecord = await billingCycleRepository.findByPaymentMethodAndCycleEnd(
                card.id,
                statementInfo.cycleEndDate
              );
            }
          } catch (error) {
            logger.warn('Failed to calculate statement balance for card:', {
              cardId: card.id,
              error: error.message
            });
            // Fall back to current_balance behavior
          }
        }
        
        // Determine the balance to use for alert logic
        // Priority: actual_statement_balance > calculated statement balance > current_balance
        // _Requirements: 7.4, 7.5, 7.6_
        let balanceForAlerts;
        let statementBalance;
        let hasActualBalance = false;
        
        if (billingCycleRecord) {
          // Use actual statement balance as authoritative source
          balanceForAlerts = billingCycleRecord.actual_statement_balance;
          statementBalance = billingCycleRecord.actual_statement_balance;
          hasActualBalance = true;
        } else if (statementInfo?.statementBalance !== undefined && statementInfo?.statementBalance !== null) {
          // Fall back to calculated statement balance
          balanceForAlerts = statementInfo.statementBalance;
          statementBalance = statementInfo.statementBalance;
        } else {
          // Fall back to current_balance for backward compatibility
          balanceForAlerts = card.current_balance || 0;
          statementBalance = null;
        }
        
        // Suppress payment alerts when actual_statement_balance is 0
        // _Requirements: 7.5_
        const shouldSuppressAlert = hasActualBalance && balanceForAlerts === 0;
        
        // Determine if reminder should show based on balance
        // Show reminder if: balance > 0 AND due within 7 days AND not suppressed
        // _Requirements: 5.2, 5.3, 7.5_
        const isOverdue = !shouldSuppressAlert && 
          daysUntilDue !== null && 
          daysUntilDue < 0 && 
          balanceForAlerts > 0;
        const isDueSoon = !shouldSuppressAlert && 
          daysUntilDue !== null && 
          daysUntilDue >= 0 && 
          daysUntilDue <= REMINDER_DAYS_THRESHOLD && 
          balanceForAlerts > 0;
        
        return {
          id: card.id,
          display_name: card.display_name,
          full_name: card.full_name,
          // Always include current_balance for utilization tracking
          // _Requirements: 5.5_
          current_balance: card.current_balance || 0,
          // Statement balance (actual if available, otherwise calculated)
          statement_balance: statementBalance,
          // Required payment amount (authoritative balance for alerts)
          // _Requirements: 5.4, 7.4_
          required_payment: balanceForAlerts,
          credit_limit: card.credit_limit,
          payment_due_day: card.payment_due_day,
          billing_cycle_day: card.billing_cycle_day,
          days_until_due: daysUntilDue,
          // Statement paid status (true if actual balance is 0 or calculated shows paid)
          is_statement_paid: shouldSuppressAlert || (statementInfo?.isPaid ?? false),
          // Billing cycle dates (if available)
          cycle_start_date: statementInfo?.cycleStartDate ?? null,
          cycle_end_date: statementInfo?.cycleEndDate ?? null,
          is_overdue: isOverdue,
          is_due_soon: isDueSoon,
          // New fields for billing cycle history integration
          has_actual_balance: hasActualBalance,
          calculated_statement_balance: statementInfo?.statementBalance ?? null
        };
      }));
      
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
   * Get billing cycle entry reminders
   * Returns credit cards that need actual statement balance entry for the most recently completed billing cycle
   * Only generates reminders for the most recently completed cycle (not historical cycles)
   * @param {Date} referenceDate - Reference date (defaults to today)
   * @returns {Promise<Object>} Billing cycle reminder status
   * _Requirements: 4.1, 4.2, 4.4_
   */
  async getBillingCycleReminders(referenceDate = new Date()) {
    try {
      // Get all credit cards with billing_cycle_day configured
      const creditCards = await billingCycleRepository.getCreditCardsNeedingBillingCycleEntry(referenceDate);
      
      // Check each card for missing billing cycle entry
      const reminders = await Promise.all(creditCards.map(async (card) => {
        try {
          // Calculate the most recently completed billing cycle dates
          const cycleDates = statementBalanceService.calculatePreviousCycleDates(
            card.billing_cycle_day,
            referenceDate
          );
          
          // Check if entry exists for this cycle
          const existingEntry = await billingCycleRepository.findByPaymentMethodAndCycleEnd(
            card.id,
            cycleDates.endDate
          );
          
          return {
            paymentMethodId: card.id,
            displayName: card.display_name || card.full_name,
            cycleStartDate: cycleDates.startDate,
            cycleEndDate: cycleDates.endDate,
            needsEntry: !existingEntry,
            hasEntry: !!existingEntry
          };
        } catch (error) {
          logger.warn('Failed to check billing cycle status for card:', {
            cardId: card.id,
            error: error.message
          });
          // Skip this card if we can't determine its status
          return null;
        }
      }));
      
      // Filter out null entries and cards that don't need entry
      const validReminders = reminders.filter(r => r !== null);
      const cardsNeedingEntry = validReminders.filter(r => r.needsEntry);
      
      return {
        needsEntryCount: cardsNeedingEntry.length,
        hasCardsWithBillingCycle: validReminders.length > 0,
        cardsNeedingEntry,
        allCards: validReminders
      };
    } catch (error) {
      logger.error('Error getting billing cycle reminders:', error);
      throw error;
    }
  }

  /**
   * Get reminder status for a specific month
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @param {Date} [referenceDate] - Reference date for billing cycle reminders (defaults to today)
   * @returns {Promise<Object>} Reminder status with counts and details
   */
  async getReminderStatus(year, month, referenceDate = new Date()) {
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
      const creditCardReminders = await this.getCreditCardReminders(referenceDate);
      
      // Get billing cycle entry reminders
      // _Requirements: 4.1, 4.2, 4.4_
      const billingCycleReminders = await this.getBillingCycleReminders(referenceDate);

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
        },
        // Billing cycle entry reminders
        // _Requirements: 4.1, 4.2, 4.4_
        billingCycleReminders: {
          needsEntryCount: billingCycleReminders.needsEntryCount,
          hasCardsWithBillingCycle: billingCycleReminders.hasCardsWithBillingCycle,
          cardsNeedingEntry: billingCycleReminders.cardsNeedingEntry
        }
      };
    } catch (error) {
      logger.error('Error getting reminder status:', error);
      throw error;
    }
  }
}

module.exports = new ReminderService();
