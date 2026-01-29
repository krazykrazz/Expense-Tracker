/**
 * End-to-End Integration Tests for Mortgage Insights
 * 
 * These tests verify the complete mortgage insights flow including:
 * - Insights display for mortgages with balance data
 * - Payment tracking (create, update, view history)
 * - Scenario calculations with various extra payment amounts
 * - Default payment fallback when no payment set
 * - Edge cases and error handling
 * 
 * Requirements: 1.5, 2.1, 2.4, 3.1, 3.5, 4.1, 4.6, 5.2, 6.5, 8.5
 */

const { getDatabase } = require('../database/db');
const mortgageInsightsService = require('./mortgageInsightsService');
const mortgagePaymentService = require('./mortgagePaymentService');
const loanService = require('./loanService');
const loanRepository = require('../repositories/loanRepository');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');
const mortgagePaymentRepository = require('../repositories/mortgagePaymentRepository');

describe('Mortgage Insights - End-to-End Integration Tests', () => {
  let db;
  const createdMortgageIds = [];

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up created mortgages (cascade will delete payments and balances)
    for (const id of createdMortgageIds) {
      try {
        await loanRepository.delete(id);
      } catch (e) {
        // Ignore errors
      }
    }
    createdMortgageIds.length = 0;
  });

  /**
   * Helper function to create a test mortgage with balance data
   */
  async function createTestMortgage(options = {}) {
    // Calculate a future renewal date (5 years from now)
    const renewalDate = new Date();
    renewalDate.setFullYear(renewalDate.getFullYear() + 5);
    const renewalDateStr = renewalDate.toISOString().split('T')[0];

    const defaults = {
      name: 'Test Mortgage',
      initial_balance: 300000,
      start_date: '2024-01-01',
      loan_type: 'mortgage',
      amortization_period: 25,
      term_length: 5,
      renewal_date: renewalDateStr,
      payment_frequency: 'monthly',
      rate_type: 'fixed',
      estimated_property_value: 450000
    };

    const mortgageData = { ...defaults, ...options };
    const mortgage = await loanService.createMortgage(mortgageData);
    createdMortgageIds.push(mortgage.id);
    return mortgage;
  }

  /**
   * Helper function to add balance entry for a mortgage
   */
  async function addBalanceEntry(mortgageId, year, month, balance, rate) {
    return await loanBalanceRepository.create({
      loan_id: mortgageId,
      year,
      month,
      remaining_balance: balance,
      rate
    });
  }

  /**
   * Task 14.1: Test end-to-end insights flow
   * Requirements: 1.5, 2.1, 3.1, 4.1, 5.2
   */
  describe('14.1 End-to-End Insights Flow', () => {
    
    test('should display insights for mortgage with balance data', async () => {
      // Create mortgage
      const mortgage = await createTestMortgage({
        name: 'Insights Test Mortgage',
        initial_balance: 400000
      });

      // Add balance entry with rate
      await addBalanceEntry(mortgage.id, 2025, 1, 395000, 5.5);

      // Get insights
      const insights = await mortgageInsightsService.getMortgageInsights(mortgage.id);

      // Verify current status
      expect(insights.mortgageId).toBe(mortgage.id);
      expect(insights.currentStatus.balance).toBe(395000);
      expect(insights.currentStatus.rate).toBe(5.5);
      expect(insights.currentStatus.rateType).toBe('fixed');

      // Verify interest breakdown is calculated
      expect(insights.currentStatus.interestBreakdown).toBeDefined();
      expect(insights.currentStatus.interestBreakdown.daily).toBeGreaterThan(0);
      expect(insights.currentStatus.interestBreakdown.weekly).toBeGreaterThan(0);
      expect(insights.currentStatus.interestBreakdown.monthly).toBeGreaterThan(0);
      expect(insights.currentStatus.interestBreakdown.annual).toBeGreaterThan(0);

      // Verify minimum payment is calculated
      expect(insights.currentStatus.minimumPayment).toBeGreaterThan(0);

      // Verify projections are available
      expect(insights.projections).toBeDefined();
      expect(insights.projections.currentScenario).toBeDefined();
      expect(insights.projections.minimumScenario).toBeDefined();

      // Verify data status
      expect(insights.dataStatus.hasBalanceData).toBe(true);
    });

    test('should track payment creation, update, and history', async () => {
      // Create mortgage with balance
      const mortgage = await createTestMortgage({
        name: 'Payment Tracking Mortgage'
      });
      await addBalanceEntry(mortgage.id, 2025, 1, 290000, 5.0);

      // Create first payment entry
      const payment1 = await mortgagePaymentService.setPaymentAmount(
        mortgage.id,
        2000,
        '2025-01-01',
        'Initial payment amount'
      );

      expect(payment1.id).toBeDefined();
      expect(payment1.payment_amount).toBe(2000);
      expect(payment1.effective_date).toBe('2025-01-01');
      expect(payment1.notes).toBe('Initial payment amount');

      // Create second payment entry (payment increase)
      const payment2 = await mortgagePaymentService.setPaymentAmount(
        mortgage.id,
        2200,
        '2025-02-01',
        'Increased payment'
      );

      expect(payment2.payment_amount).toBe(2200);
      expect(payment2.effective_date).toBe('2025-02-01');

      // View payment history
      const history = await mortgagePaymentService.getPaymentHistory(mortgage.id);

      expect(history.length).toBe(2);
      // History should be in chronological order (oldest first)
      expect(history[0].effective_date).toBe('2025-01-01');
      expect(history[1].effective_date).toBe('2025-02-01');

      // Get current payment (most recent)
      const currentPayment = await mortgagePaymentService.getCurrentPayment(mortgage.id);

      expect(currentPayment.payment_amount).toBe(2200);
      expect(currentPayment.effective_date).toBe('2025-02-01');

      // Update existing payment
      const updated = await mortgagePaymentService.updatePayment(
        payment1.id,
        2100,
        '2025-01-15',
        'Updated initial payment'
      );

      expect(updated.payment_amount).toBe(2100);
      expect(updated.effective_date).toBe('2025-01-15');
      expect(updated.notes).toBe('Updated initial payment');

      // Verify history reflects update
      const updatedHistory = await mortgagePaymentService.getPaymentHistory(mortgage.id);
      const updatedPayment = updatedHistory.find(p => p.id === payment1.id);
      expect(updatedPayment.payment_amount).toBe(2100);
    });

    test('should calculate scenario with various extra payment amounts', async () => {
      // Create mortgage with balance
      const mortgage = await createTestMortgage({
        name: 'Scenario Test Mortgage',
        initial_balance: 350000
      });
      await addBalanceEntry(mortgage.id, 2025, 1, 340000, 5.25);

      // Set current payment
      await mortgagePaymentService.setPaymentAmount(
        mortgage.id,
        2000,
        '2025-01-01'
      );

      // Get base insights
      const baseInsights = await mortgageInsightsService.getMortgageInsights(mortgage.id);
      const basePayoffMonths = baseInsights.projections.currentScenario.totalMonths;

      // Test various extra payment amounts
      const extraAmounts = [100, 250, 500, 1000];

      for (const extraAmount of extraAmounts) {
        const scenario = mortgageInsightsService.calculateExtraPaymentScenario({
          balance: 340000,
          rate: 5.25,
          currentPayment: 2000,
          extraPayment: extraAmount
        });

        // Verify extra payment benefits
        expect(scenario.extraPayment).toBe(extraAmount);
        expect(scenario.newPayment).toBe(2000 + extraAmount);
        expect(scenario.monthsSaved).toBeGreaterThan(0);
        expect(scenario.interestSaved).toBeGreaterThan(0);
        expect(scenario.newTotalInterest).toBeLessThan(scenario.originalTotalInterest);

        // Higher extra payments should save more
        if (extraAmount > 100) {
          const smallerScenario = mortgageInsightsService.calculateExtraPaymentScenario({
            balance: 340000,
            rate: 5.25,
            currentPayment: 2000,
            extraPayment: extraAmount - 100
          });
          expect(scenario.monthsSaved).toBeGreaterThan(smallerScenario.monthsSaved);
          expect(scenario.interestSaved).toBeGreaterThan(smallerScenario.interestSaved);
        }
      }
    });

    test('should use minimum payment as default when no payment set', async () => {
      // Create mortgage with balance but no payment entry
      const mortgage = await createTestMortgage({
        name: 'Default Payment Mortgage',
        initial_balance: 280000,
        amortization_period: 25
      });
      await addBalanceEntry(mortgage.id, 2025, 1, 275000, 4.75);

      // Verify no payment entry exists
      const currentPayment = await mortgagePaymentService.getCurrentPayment(mortgage.id);
      expect(currentPayment).toBeNull();

      // Get insights - should use minimum payment as default
      const insights = await mortgageInsightsService.getMortgageInsights(mortgage.id);

      // Current payment should equal minimum payment (default fallback)
      // Use toBeCloseTo for floating point comparison
      expect(insights.currentStatus.currentPayment).toBeCloseTo(insights.currentStatus.minimumPayment, 2);
      expect(insights.dataStatus.hasPaymentData).toBe(false);

      // Projections should still work with default payment
      expect(insights.projections).toBeDefined();
      expect(insights.projections.currentScenario.totalMonths).toBeGreaterThan(0);
      expect(insights.projections.comparison.monthsSaved).toBe(0); // Same as minimum
      expect(insights.projections.comparison.interestSaved).toBe(0);
    });

    test('should show savings when current payment exceeds minimum', async () => {
      // Create mortgage
      const mortgage = await createTestMortgage({
        name: 'Savings Display Mortgage',
        initial_balance: 320000,
        amortization_period: 25
      });
      await addBalanceEntry(mortgage.id, 2025, 1, 315000, 5.0);

      // Get insights to find minimum payment
      const initialInsights = await mortgageInsightsService.getMortgageInsights(mortgage.id);
      const minimumPayment = initialInsights.currentStatus.minimumPayment;

      // Set payment higher than minimum
      const higherPayment = minimumPayment + 500;
      await mortgagePaymentService.setPaymentAmount(
        mortgage.id,
        higherPayment,
        '2025-01-01'
      );

      // Get updated insights
      const insights = await mortgageInsightsService.getMortgageInsights(mortgage.id);

      // Verify savings are shown
      expect(insights.currentStatus.currentPayment).toBe(higherPayment);
      expect(insights.projections.comparison.monthsSaved).toBeGreaterThan(0);
      expect(insights.projections.comparison.interestSaved).toBeGreaterThan(0);
      expect(insights.projections.isUnderpayment).toBe(false);
    });
  });

  /**
   * Task 14.2: Test edge cases and error handling
   * Requirements: 2.4, 3.5, 4.6, 6.5, 8.5
   */
  describe('14.2 Edge Cases and Error Handling', () => {

    test('should handle missing balance data (no rate available)', async () => {
      // Create mortgage without any balance entries
      const mortgage = await createTestMortgage({
        name: 'No Balance Mortgage'
      });

      // Get insights - should handle gracefully
      const insights = await mortgageInsightsService.getMortgageInsights(mortgage.id);

      // Should use initial balance and zero rate
      expect(insights.currentStatus.balance).toBe(mortgage.initial_balance);
      expect(insights.currentStatus.rate).toBe(0);
      expect(insights.dataStatus.hasBalanceData).toBe(false);

      // Interest breakdown should be zero with no rate
      expect(insights.currentStatus.interestBreakdown.daily).toBe(0);
      expect(insights.currentStatus.interestBreakdown.weekly).toBe(0);
      expect(insights.currentStatus.interestBreakdown.monthly).toBe(0);
      expect(insights.currentStatus.interestBreakdown.annual).toBe(0);

      // Projections should be null without rate data
      expect(insights.projections).toBeNull();
    });

    test('should handle zero balance (paid off mortgage)', async () => {
      // Create mortgage
      const mortgage = await createTestMortgage({
        name: 'Paid Off Mortgage',
        initial_balance: 200000
      });

      // Add balance entry with zero balance
      await addBalanceEntry(mortgage.id, 2025, 1, 0, 5.0);

      // Calculate interest breakdown directly
      const interestBreakdown = mortgageInsightsService.calculateInterestBreakdown(0, 5.0);

      // All interest values should be zero
      expect(interestBreakdown.daily).toBe(0);
      expect(interestBreakdown.weekly).toBe(0);
      expect(interestBreakdown.monthly).toBe(0);
      expect(interestBreakdown.annual).toBe(0);
      expect(interestBreakdown.balance).toBe(0);
      expect(interestBreakdown.rate).toBe(5.0);

      // Payoff projection should show immediate payoff
      const projection = mortgageInsightsService.projectPayoff({
        balance: 0,
        rate: 5.0,
        paymentAmount: 1500
      });

      expect(projection.totalMonths).toBe(0);
      expect(projection.totalInterest).toBe(0);
      expect(projection.isUnderpayment).toBe(false);
    });

    test('should display underpayment warning when current < minimum', async () => {
      // Create mortgage
      const mortgage = await createTestMortgage({
        name: 'Underpayment Mortgage',
        initial_balance: 400000,
        amortization_period: 25
      });
      await addBalanceEntry(mortgage.id, 2025, 1, 395000, 6.0);

      // Get minimum payment
      const initialInsights = await mortgageInsightsService.getMortgageInsights(mortgage.id);
      const minimumPayment = initialInsights.currentStatus.minimumPayment;

      // Set payment lower than minimum
      const underpayment = minimumPayment - 500;
      await mortgagePaymentService.setPaymentAmount(
        mortgage.id,
        underpayment,
        '2025-01-01'
      );

      // Get updated insights
      const insights = await mortgageInsightsService.getMortgageInsights(mortgage.id);

      // Verify underpayment is flagged
      expect(insights.currentStatus.currentPayment).toBe(underpayment);
      expect(insights.projections.isUnderpayment).toBe(true);
    });

    test('should detect underpayment when payment less than interest-only', async () => {
      // Test the underpayment detection directly
      const comparison = mortgageInsightsService.comparePaymentScenarios({
        balance: 300000,
        rate: 6.0,
        currentPayment: 500, // Way below interest-only payment
        minimumPayment: 1900
      });

      expect(comparison.isUnderpayment).toBe(true);
      expect(comparison.currentScenario.isUnderpayment).toBe(true);
    });

    test('should cascade delete payments when mortgage is deleted', async () => {
      // Calculate a future renewal date
      const renewalDate = new Date();
      renewalDate.setFullYear(renewalDate.getFullYear() + 5);
      const renewalDateStr = renewalDate.toISOString().split('T')[0];

      // Create mortgage
      const mortgage = await loanService.createMortgage({
        name: 'Cascade Delete Mortgage',
        initial_balance: 250000,
        start_date: '2024-01-01',
        loan_type: 'mortgage',
        amortization_period: 25,
        term_length: 5,
        renewal_date: renewalDateStr,
        payment_frequency: 'monthly',
        rate_type: 'fixed'
      });
      // Don't add to createdMortgageIds - we'll delete manually

      // Add balance entry
      await addBalanceEntry(mortgage.id, 2025, 1, 245000, 5.0);

      // Create multiple payment entries
      await mortgagePaymentService.setPaymentAmount(mortgage.id, 1800, '2025-01-01');
      await mortgagePaymentService.setPaymentAmount(mortgage.id, 1900, '2025-02-01');
      await mortgagePaymentService.setPaymentAmount(mortgage.id, 2000, '2025-03-01');

      // Verify payments exist
      const paymentsBefore = await mortgagePaymentService.getPaymentHistory(mortgage.id);
      expect(paymentsBefore.length).toBe(3);

      // Delete the mortgage
      await loanRepository.delete(mortgage.id);

      // Verify payments are cascade deleted
      const paymentsAfter = await mortgagePaymentRepository.findByMortgage(mortgage.id);
      expect(paymentsAfter.length).toBe(0);
    });

    test('should reject insights for non-mortgage loan types', async () => {
      // Create a regular loan (not mortgage)
      const loan = await loanService.createLoan({
        name: 'Regular Loan',
        initial_balance: 50000,
        start_date: '2024-01-01',
        loan_type: 'loan'
      });
      createdMortgageIds.push(loan.id);

      // Attempt to get insights should fail
      await expect(
        mortgageInsightsService.getMortgageInsights(loan.id)
      ).rejects.toThrow('Insights are only available for mortgages');
    });

    test('should reject insights for non-existent mortgage', async () => {
      await expect(
        mortgageInsightsService.getMortgageInsights(99999)
      ).rejects.toThrow('Mortgage not found');
    });

    test('should validate payment amount is positive', async () => {
      const mortgage = await createTestMortgage({
        name: 'Validation Test Mortgage'
      });

      // Negative payment should fail
      await expect(
        mortgagePaymentService.setPaymentAmount(mortgage.id, -100, '2025-01-01')
      ).rejects.toThrow('Payment amount must be a positive number');

      // Zero payment should fail
      await expect(
        mortgagePaymentService.setPaymentAmount(mortgage.id, 0, '2025-01-01')
      ).rejects.toThrow('Payment amount must be a positive number');
    });

    test('should validate effective date format', async () => {
      const mortgage = await createTestMortgage({
        name: 'Date Validation Mortgage'
      });

      // Invalid date format should fail
      await expect(
        mortgagePaymentService.setPaymentAmount(mortgage.id, 1500, '01-15-2025')
      ).rejects.toThrow('Effective date must be in YYYY-MM-DD format');

      // Invalid date should fail
      await expect(
        mortgagePaymentService.setPaymentAmount(mortgage.id, 1500, '2025-13-45')
      ).rejects.toThrow();
    });

    test('should reject future effective dates', async () => {
      const mortgage = await createTestMortgage({
        name: 'Future Date Mortgage'
      });

      // Future date should fail
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      await expect(
        mortgagePaymentService.setPaymentAmount(mortgage.id, 1500, futureDateStr)
      ).rejects.toThrow('Effective date cannot be in the future');
    });

    test('should handle variable rate mortgage display', async () => {
      // Create variable rate mortgage
      const mortgage = await createTestMortgage({
        name: 'Variable Rate Mortgage',
        rate_type: 'variable'
      });
      await addBalanceEntry(mortgage.id, 2025, 1, 290000, 5.5);

      const insights = await mortgageInsightsService.getMortgageInsights(mortgage.id);

      // Verify rate type is correctly reported
      expect(insights.currentStatus.rateType).toBe('variable');
    });

    test('should handle zero rate scenario', async () => {
      // Test payoff projection with zero rate
      const projection = mortgageInsightsService.projectPayoff({
        balance: 100000,
        rate: 0,
        paymentAmount: 2000
      });

      // Should calculate simple division
      expect(projection.totalMonths).toBe(50); // 100000 / 2000
      expect(projection.totalInterest).toBe(0);
      expect(projection.totalPaid).toBe(100000);
      expect(projection.isUnderpayment).toBe(false);
    });

    test('should handle extra payment scenario with zero extra', async () => {
      const scenario = mortgageInsightsService.calculateExtraPaymentScenario({
        balance: 200000,
        rate: 5.0,
        currentPayment: 1500,
        extraPayment: 0
      });

      // Should return current scenario unchanged
      expect(scenario.extraPayment).toBe(0);
      expect(scenario.monthsSaved).toBe(0);
      expect(scenario.interestSaved).toBe(0);
    });

    test('should handle payment deletion', async () => {
      const mortgage = await createTestMortgage({
        name: 'Delete Payment Mortgage'
      });

      // Create payment
      const payment = await mortgagePaymentService.setPaymentAmount(
        mortgage.id,
        1800,
        '2025-01-01'
      );

      // Verify payment exists
      const paymentBefore = await mortgagePaymentService.getPaymentById(payment.id);
      expect(paymentBefore).toBeDefined();

      // Delete payment
      const deleted = await mortgagePaymentService.deletePayment(payment.id);
      expect(deleted).toBe(true);

      // Verify payment is gone
      const paymentAfter = await mortgagePaymentService.getPaymentById(payment.id);
      expect(paymentAfter).toBeNull();
    });
  });
});
