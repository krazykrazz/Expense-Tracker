/**
 * Migration Service
 * 
 * Handles migration of existing balance entries to payment entries.
 * Converts balance differences to payments for loans and mortgages.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

const loanPaymentRepository = require('../repositories/loanPaymentRepository');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');
const loanRepository = require('../repositories/loanRepository');

class MigrationService {
  /**
   * Verify loan exists and is eligible for migration
   * Migration is only available for loans and mortgages, not lines of credit
   * @param {number} loanId - Loan ID
   * @returns {Promise<Object>} The loan object
   * @throws {Error} If loan not found or is a line of credit
   */
  async verifyLoanEligibility(loanId) {
    const loan = await loanRepository.findById(loanId);
    
    if (!loan) {
      throw new Error('Loan not found');
    }
    
    if (loan.loan_type === 'line_of_credit') {
      throw new Error('Migration is only available for loans and mortgages');
    }
    
    return loan;
  }

  /**
   * Calculate payment amounts from consecutive balance differences
   * @param {Array} balanceEntries - Balance entries sorted chronologically (oldest first)
   * @returns {Object} { payments: Array, skipped: Array }
   */
  calculatePaymentsFromBalances(balanceEntries) {
    const payments = [];
    const skipped = [];
    
    if (balanceEntries.length < 2) {
      // Need at least 2 entries to calculate differences
      return { payments, skipped };
    }
    
    for (let i = 1; i < balanceEntries.length; i++) {
      const previousEntry = balanceEntries[i - 1];
      const currentEntry = balanceEntries[i];
      
      const balanceDifference = previousEntry.remaining_balance - currentEntry.remaining_balance;
      
      if (balanceDifference > 0) {
        // Balance decreased - this represents a payment (Requirement 4.1)
        // Create payment date as the first day of the current entry's month (Requirement 4.2)
        const paymentDate = `${currentEntry.year}-${String(currentEntry.month).padStart(2, '0')}-01`;
        
        payments.push({
          balanceEntryId: currentEntry.id,
          previousBalanceEntryId: previousEntry.id,
          paymentAmount: balanceDifference,
          paymentDate: paymentDate,
          previousBalance: previousEntry.remaining_balance,
          currentBalance: currentEntry.remaining_balance
        });
      } else if (balanceDifference < 0) {
        // Balance increased - skip this entry (Requirement 4.4)
        skipped.push({
          balanceEntryId: currentEntry.id,
          reason: 'Balance increased (additional borrowing)',
          previousBalance: previousEntry.remaining_balance,
          currentBalance: currentEntry.remaining_balance,
          increase: Math.abs(balanceDifference)
        });
      }
      // If balanceDifference === 0, no payment was made, skip silently
    }
    
    return { payments, skipped };
  }

  /**
   * Preview migration without executing (dry-run)
   * @param {number} loanId - Loan ID
   * @returns {Promise<Object>} Preview of what would be migrated
   */
  async previewMigration(loanId) {
    // Verify loan exists and is eligible
    const loan = await this.verifyLoanEligibility(loanId);
    
    // Get balance entries in chronological order (oldest first)
    const balanceEntries = await loanBalanceRepository.getBalanceHistory(loanId);
    
    if (balanceEntries.length === 0) {
      return {
        loanId,
        loanName: loan.name,
        canMigrate: false,
        message: 'No balance entries to migrate',
        converted: [],
        skipped: [],
        summary: {
          totalConverted: 0,
          totalSkipped: 0,
          totalPaymentAmount: 0
        }
      };
    }
    
    if (balanceEntries.length === 1) {
      return {
        loanId,
        loanName: loan.name,
        canMigrate: false,
        message: 'Need at least 2 balance entries to calculate payments',
        converted: [],
        skipped: [],
        summary: {
          totalConverted: 0,
          totalSkipped: 0,
          totalPaymentAmount: 0
        }
      };
    }
    
    // Calculate what would be migrated
    const { payments, skipped } = this.calculatePaymentsFromBalances(balanceEntries);
    
    const totalPaymentAmount = payments.reduce((sum, p) => sum + p.paymentAmount, 0);
    
    // Build a more helpful message when no payments can be created
    let message;
    if (payments.length > 0) {
      message = `Ready to convert ${payments.length} balance difference(s) to payment(s)`;
    } else if (skipped.length > 0) {
      message = `No payments to create. ${skipped.length} balance change(s) were skipped because the balance increased (additional borrowing).`;
    } else {
      message = 'No payments to create. The balance remained the same between all entries.';
    }
    
    return {
      loanId,
      loanName: loan.name,
      canMigrate: payments.length > 0,
      message,
      converted: payments.map(p => ({
        balanceEntryId: p.balanceEntryId,
        paymentAmount: p.paymentAmount,
        paymentDate: p.paymentDate,
        previousBalance: p.previousBalance,
        currentBalance: p.currentBalance
      })),
      skipped: skipped.map(s => ({
        balanceEntryId: s.balanceEntryId,
        reason: s.reason,
        previousBalance: s.previousBalance,
        currentBalance: s.currentBalance,
        increase: s.increase
      })),
      summary: {
        totalConverted: payments.length,
        totalSkipped: skipped.length,
        totalPaymentAmount
      }
    };
  }

  /**
   * Migrate balance entries to payment entries (Requirement 4.1, 4.2, 4.3, 4.4, 4.5)
   * @param {number} loanId - Loan ID
   * @returns {Promise<Object>} { converted, skipped, errors, summary }
   */
  async migrateBalanceEntries(loanId) {
    // Verify loan exists and is eligible
    const loan = await this.verifyLoanEligibility(loanId);
    
    // Get balance entries in chronological order (oldest first)
    const balanceEntries = await loanBalanceRepository.getBalanceHistory(loanId);
    
    if (balanceEntries.length < 2) {
      return {
        loanId,
        loanName: loan.name,
        converted: [],
        skipped: [],
        errors: [],
        summary: {
          totalConverted: 0,
          totalSkipped: 0,
          totalPaymentAmount: 0,
          totalErrors: 0
        },
        message: balanceEntries.length === 0 
          ? 'No balance entries to migrate'
          : 'Need at least 2 balance entries to calculate payments'
      };
    }
    
    // Calculate payments from balance differences
    const { payments, skipped } = this.calculatePaymentsFromBalances(balanceEntries);
    
    const converted = [];
    const errors = [];
    
    // Create payment entries (Requirement 4.1, 4.2)
    // Note: Original balance entries are preserved (Requirement 4.3)
    for (const payment of payments) {
      try {
        const createdPayment = await loanPaymentRepository.create({
          loan_id: loanId,
          amount: payment.paymentAmount,
          payment_date: payment.paymentDate,
          notes: `Migrated from balance entry (${payment.previousBalance} → ${payment.currentBalance})`
        });
        
        converted.push({
          balanceEntryId: payment.balanceEntryId,
          paymentId: createdPayment.id,
          paymentAmount: payment.paymentAmount,
          paymentDate: payment.paymentDate
        });
      } catch (error) {
        errors.push({
          balanceEntryId: payment.balanceEntryId,
          error: error.message
        });
      }
    }
    
    const totalPaymentAmount = converted.reduce((sum, c) => sum + c.paymentAmount, 0);
    
    // Return migration result (Requirement 4.5)
    return {
      loanId,
      loanName: loan.name,
      converted,
      skipped: skipped.map(s => ({
        balanceEntryId: s.balanceEntryId,
        reason: s.reason
      })),
      errors,
      summary: {
        totalConverted: converted.length,
        totalSkipped: skipped.length,
        totalPaymentAmount,
        totalErrors: errors.length
      },
      message: `Migration complete: ${converted.length} payment(s) created, ${skipped.length} skipped`
    };
  }
}

module.exports = new MigrationService();
