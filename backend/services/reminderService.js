const reminderRepository = require('../repositories/reminderRepository');
const statementBalanceService = require('./statementBalanceService');
const billingCycleRepository = require('../repositories/billingCycleRepository');
const fixedExpenseRepository = require('../repositories/fixedExpenseRepository');
const loanPaymentRepository = require('../repositories/loanPaymentRepository');
const { calculateDaysUntilDue } = require('../utils/dateUtils');
const logger = require('../config/logger');

/**
 * Number of days before due date to show a reminder
 */
const REMINDER_DAYS_THRESHOLD = 7;

/**
 * Threshold for current month insurance claim reminders (days)
 * When viewing current month: current month expenses only show if older than this threshold
 * Previous month expenses always show (they're overdue)
 */
const CURRENT_MONTH_INSURANCE_CLAIM_THRESHOLD = 7;

class ReminderService {
  /**
   * Calculate days until next payment due date
   * Delegates to shared utility function in dateUtils
   * @param {number} paymentDueDay - Day of month payment is due (1-31)
   * @param {Date} referenceDate - Reference date (defaults to today)
   * @returns {number|null} Days until due or null if no due day set
   */
  calculateDaysUntilDue(paymentDueDay, referenceDate = new Date()) {
    return calculateDaysUntilDue(paymentDueDay, referenceDate);
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
   * Get loan payment reminders
   * Returns linked fixed expenses with due dates that are due soon or overdue
   * Suppresses reminders when a loan payment already exists for the current month
   * @param {Date} referenceDate - Reference date (defaults to today)
   * @returns {Promise<Object>} Loan payment reminder status
   * _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
   */
  async getLoanPaymentReminders(referenceDate = new Date()) {
    try {
      const today = new Date(referenceDate);
      today.setHours(0, 0, 0, 0);
      
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1; // 1-12
      
      // Get linked fixed expenses with due dates for the current month
      const linkedExpenses = await fixedExpenseRepository.getLinkedFixedExpensesForMonth(
        currentYear,
        currentMonth
      );
      
      if (linkedExpenses.length === 0) {
        return {
          overdueCount: 0,
          dueSoonCount: 0,
          hasLinkedExpenses: false,
          overduePayments: [],
          dueSoonPayments: []
        };
      }
      
      // Get loan IDs to check for existing payments
      const loanIds = [...new Set(linkedExpenses.map(e => e.loan_id))];
      
      // Check which loans have payments this month
      // _Requirements: 3.4_
      const paymentStatusMap = await loanPaymentRepository.getPaymentStatusForMonth(
        loanIds,
        currentYear,
        currentMonth
      );
      
      // Calculate days until due and build reminder objects
      // _Requirements: 3.1, 3.2, 3.3, 3.5_
      const reminders = linkedExpenses.map(expense => {
        const daysUntilDue = this.calculateDaysUntilDue(expense.payment_due_day, referenceDate);
        const hasPaymentThisMonth = paymentStatusMap.get(expense.loan_id) || false;
        
        // Determine overdue/due soon status
        // _Requirements: 3.1, 3.2_
        const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
        const isDueSoon = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= REMINDER_DAYS_THRESHOLD;
        
        return {
          fixedExpenseId: expense.fixed_expense_id,
          fixedExpenseName: expense.fixed_expense_name,
          amount: expense.amount,
          paymentDueDay: expense.payment_due_day,
          daysUntilDue: daysUntilDue,
          loanId: expense.loan_id,
          loanName: expense.loan_name,
          loanType: expense.loan_type,
          isLoanPaidOff: expense.is_paid_off === 1,
          isOverdue: isOverdue,
          isDueSoon: isDueSoon,
          hasPaymentThisMonth: hasPaymentThisMonth
        };
      });
      
      // Filter to only reminders that need attention (overdue or due soon)
      // and don't have a payment this month
      // _Requirements: 3.4_
      const overduePayments = reminders.filter(r => 
        r.isOverdue && !r.hasPaymentThisMonth && !r.isLoanPaidOff
      );
      const dueSoonPayments = reminders.filter(r => 
        r.isDueSoon && !r.hasPaymentThisMonth && !r.isLoanPaidOff
      );
      
      return {
        overdueCount: overduePayments.length,
        dueSoonCount: dueSoonPayments.length,
        hasLinkedExpenses: linkedExpenses.length > 0,
        overduePayments,
        dueSoonPayments,
        allReminders: reminders
      };
    } catch (error) {
      logger.error('Error getting loan payment reminders:', error);
      throw error;
    }
  }

  /**
   * Get notifications for auto-generated billing cycles that haven't been reviewed
   * Returns cycles where is_user_entered = 0 AND actual_statement_balance = 0
   * @param {Date} referenceDate - Reference date (defaults to today)
   * @returns {Promise<Object>} Auto-generated cycle notifications with count and cycles array
   * _Requirements: 2.1, 2.2_
   */
  async getAutoGeneratedCycleNotifications(referenceDate = new Date()) {
    try {
      const rows = await billingCycleRepository.findUnreviewedAutoGenerated();

      const cycles = rows.map(row => ({
        paymentMethodId: row.payment_method_id,
        displayName: row.display_name || row.full_name,
        cycleEndDate: row.cycle_end_date,
        calculatedBalance: row.calculated_statement_balance || 0
      }));

      return {
        count: cycles.length,
        cycles
      };
    } catch (error) {
      logger.error('Error getting auto-generated cycle notifications:', error);
      return {
        count: 0,
        cycles: []
      };
    }
  }

  /**
   * Get insurance claim reminders
   * Returns medical expenses with claim_status = 'in_progress' that should be shown
   * 
   * Threshold logic (when viewing current month):
   * - Previous month expenses: Show ALL pending claims (they're overdue)
   * - Current month expenses: Show only if older than 7 days
   * 
   * When viewing past months: Show ALL pending claims (no threshold)
   * 
   * @param {number} year - Selected year
   * @param {number} month - Selected month (1-12)
   * @param {Date} referenceDate - Reference date for calculations (default: today)
   * @returns {Promise<Object>} Insurance claim reminder status
   * _Requirements: 1.3, 1.4, 4.1, 4.2, 4.3_
   */
  async getInsuranceClaimReminders(year, month, referenceDate = new Date()) {
    try {
      // Determine the current month for comparison
      const today = new Date(referenceDate);
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1; // 1-12
      
      const isViewingCurrentMonth = year === currentYear && month === currentMonth;
      
      // Get all medical expenses with in-progress claims
      const pendingExpenses = await reminderRepository.getMedicalExpensesWithPendingClaims(referenceDate);
      
      // Filter claims based on the correct logic
      // _Requirements: 1.3, 4.2, 4.3_
      const claimsToShow = pendingExpenses.filter(expense => {
        // If viewing a past month, show ALL pending claims
        if (!isViewingCurrentMonth) {
          return true;
        }
        
        // When viewing current month, apply per-expense logic:
        // Parse the expense date to determine which month it belongs to
        const expenseDate = new Date(expense.date);
        const expenseYear = expenseDate.getFullYear();
        const expenseMonth = expenseDate.getMonth() + 1; // 1-12
        
        const isExpenseFromCurrentMonth = expenseYear === currentYear && expenseMonth === currentMonth;
        
        if (isExpenseFromCurrentMonth) {
          // Current month expenses: only show if older than 7 days
          return expense.days_pending > CURRENT_MONTH_INSURANCE_CLAIM_THRESHOLD;
        } else {
          // Previous month expenses: always show (they're overdue)
          return true;
        }
      });
      
      // Transform to structured response
      // _Requirements: 1.4_
      const pendingClaims = claimsToShow.map(expense => ({
        expenseId: expense.id,
        place: expense.place,
        amount: expense.amount,
        originalCost: expense.original_cost,
        date: expense.date,
        daysPending: expense.days_pending,
        personNames: expense.person_names ? expense.person_names.split(', ') : null
      }));
      
      return {
        pendingCount: pendingClaims.length,
        hasPendingClaims: pendingClaims.length > 0,
        pendingClaims,
        isViewingCurrentMonth
      };
    } catch (error) {
      logger.error('Error getting insurance claim reminders:', error);
      // Return safe defaults on error
      return {
        pendingCount: 0,
        hasPendingClaims: false,
        pendingClaims: [],
        error: error.message
      };
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
      
      // Get loan payment reminders
      // _Requirements: 5.1, 5.4_
      const loanPaymentReminders = await this.getLoanPaymentReminders(referenceDate);

      // Get auto-generated cycle notifications
      // _Requirements: 2.1, 4.2_
      const autoGeneratedCycleNotifications = await this.getAutoGeneratedCycleNotifications(referenceDate);

      // Get insurance claim reminders
      // _Requirements: 5.2, 5.3_
      const insuranceClaimReminders = await this.getInsuranceClaimReminders(
        year,
        month,
        referenceDate
      );

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
        },
        // Loan payment reminders
        // _Requirements: 5.1, 5.4_
        loanPaymentReminders: {
          overdueCount: loanPaymentReminders.overdueCount,
          dueSoonCount: loanPaymentReminders.dueSoonCount,
          hasLinkedExpenses: loanPaymentReminders.hasLinkedExpenses,
          overduePayments: loanPaymentReminders.overduePayments,
          dueSoonPayments: loanPaymentReminders.dueSoonPayments
        },
        // Insurance claim reminders
        // _Requirements: 5.2, 5.3_
        insuranceClaimReminders: {
          pendingCount: insuranceClaimReminders.pendingCount,
          hasPendingClaims: insuranceClaimReminders.hasPendingClaims,
          pendingClaims: insuranceClaimReminders.pendingClaims
        },
        // Auto-generated billing cycle notifications
        // _Requirements: 2.1, 4.2_
        autoGeneratedCycleNotifications
      };
    } catch (error) {
      logger.error('Error getting reminder status:', error);
      throw error;
    }
  }
}

module.exports = new ReminderService();
