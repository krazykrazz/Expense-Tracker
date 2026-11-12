/**
 * End-to-End Integration Tests for Mortgage Insights
 * 
 * These tests verify the complete mortgage insights flow including:
 * - Insights display for mortgages with balance data
 * - Current payment taken from the linked fixed expense
 * - Scenario calculations with various extra payment amounts
 * - Default (calculated minimum) payment fallback when no fixed expense is linked
 * - Edge cases and error handling
 * 
 * Requirements: 1.5, 2.1, 2.4, 3.1, 3.5, 4.1, 4.6, 5.2, 6.5, 8.5
 */

const { getDatabase } = require('../database/db');
const mortgageInsightsService = require('./mortgageInsightsService');
const mortgageService = require('./mortgageService');
const loanService = require('./loanService');
const loanRepository = require('../repositories/loanRepository');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');

describe('Mortgage Insights - End-to-End Integration Tests', () => {
  let db;
  const createdMortgageIds = [];

  // Snapshots are taken in the current month so the calculated balance equals the snapshot
  const now = new Date();
  const CURRENT_YEAR = now.getFullYear();
  const CURRENT_MONTH = now.getMonth() + 1;

  const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

  beforeAll(async () => {
    db = await getDatabase();
  });

  afterEach(async () => {
    // Clean up created mortgages (cascade deletes balances and payments; linked expenses removed explicitly)
    for (const id of createdMortgageIds) {
      try {
        await run('DELETE FROM fixed_expenses WHERE linked_loan_id = ?', [id]);
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
   * Helper function to add a current-month balance entry for a mortgage
   */
  async function addCurrentBalanceEntry(mortgageId, balance, rate) {
    return await loanBalanceRepository.create({
      loan_id: mortgageId,
      year: CURRENT_YEAR,
      month: CURRENT_MONTH,
      remaining_balance: balance,
      rate
    });
  }

  /**
   * Helper function to link a fixed expense (the mortgage's monthly payment) for a month
   */
  async function linkFixedExpense(mortgageId, amount, year = CURRENT_YEAR, month = CURRENT_MONTH) {
    await run(
      'INSERT INTO fixed_expenses (year, month, name, amount, category, payment_type, linked_loan_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [year, month, 'Mortgage Payment', amount, 'Housing', 'Debit', mortgageId]
    );
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
      await addCurrentBalanceEntry(mortgage.id, 395000, 5.5);

      // Get insights
      const insights = await mortgageInsightsService.getMortgageInsights(mortgage.id);

      // Verify current status
      expect(insights.mortgageId).toBe(mortgage.id);
      expect(insights.currentStatus.balance).toBe(395000);
      expect(insights.currentStatus.rate).toBe(5.5);
      expect(insights.currentStatus.rateType).toBe('fixed');

      // Remaining amortization counts down from the start date (25 years = 300 months)
      const expectedRemaining = mortgageService.getRemainingAmortizationMonths(mortgage);
      expect(insights.currentStatus.remainingAmortizationMonths).toBe(expectedRemaining);
      expect(expectedRemaining).toBeLessThan(300);

      // Verify interest breakdown is calculated
      expect(insights.currentStatus.interestBreakdown).toBeDefined();
      expect(insights.currentStatus.interestBreakdown.daily).toBeGreaterThan(0);
      expect(insights.currentStatus.interestBreakdown.weekly).toBeGreaterThan(0);
      expect(insights.currentStatus.interestBreakdown.monthly).toBeGreaterThan(0);
      expect(insights.currentStatus.interestBreakdown.annual).toBeGreaterThan(0);

      // Minimum payment amortizes the balance over the remaining months at the fixed (semi-annual) rate
      const expectedMinimum = mortgageService.calculatePaymentAmount({
        balance: 395000,
        rate: 5.5,
        remainingMonths: expectedRemaining,
        paymentFrequency: 'monthly',
        rateType: 'fixed'
      });
      expect(insights.currentStatus.minimumPayment).toBeCloseTo(expectedMinimum, 2);

      // Verify projections are available
      expect(insights.projections).toBeDefined();
      expect(insights.projections.currentScenario).toBeDefined();
      expect(insights.projections.minimumScenario).toBeDefined();

      // Verify data status
      expect(insights.dataStatus.hasBalanceData).toBe(true);
    });

    test('should use the latest linked fixed expense up to the current month as the current payment', async () => {
      const mortgage = await createTestMortgage({
        name: 'Linked Payment Mortgage'
      });
      await addCurrentBalanceEntry(mortgage.id, 290000, 5.0);

      // Older month, current month, and a planned future month
      const prev = new Date(CURRENT_YEAR, CURRENT_MONTH - 2, 1);
      const next = new Date(CURRENT_YEAR, CURRENT_MONTH, 1);
      await linkFixedExpense(mortgage.id, 2000, prev.getFullYear(), prev.getMonth() + 1);
      await linkFixedExpense(mortgage.id, 2200);
      await linkFixedExpense(mortgage.id, 9999, next.getFullYear(), next.getMonth() + 1);

      const linked = await mortgageInsightsService.getCurrentLinkedPayment(mortgage.id);
      expect(linked.amount).toBe(2200);

      const insights = await mortgageInsightsService.getMortgageInsights(mortgage.id);
      expect(insights.currentStatus.currentPayment).toBe(2200);
      expect(insights.currentStatus.paymentSource).toBe('linked_fixed_expense');
      expect(insights.dataStatus.paymentSource).toBe('linked_fixed_expense');
      expect(insights.dataStatus.hasPaymentData).toBe(true);
    });

    test('should calculate scenario with various extra payment amounts', async () => {
      // Create mortgage with balance
      const mortgage = await createTestMortgage({
        name: 'Scenario Test Mortgage',
        initial_balance: 350000
      });
      await addCurrentBalanceEntry(mortgage.id, 340000, 5.25);

      // Set current payment
      await linkFixedExpense(mortgage.id, 2000);

      // Get base insights
      const baseInsights = await mortgageInsightsService.getMortgageInsights(mortgage.id);
      expect(baseInsights.projections.currentScenario.totalMonths).toBeGreaterThan(0);

      // Test various extra payment amounts
      const extraAmounts = [100, 250, 500, 1000];

      for (const extraAmount of extraAmounts) {
        const scenario = mortgageInsightsService.calculateExtraPaymentScenario({
          balance: 340000,
          rate: 5.25,
          currentPayment: 2000,
          extraPayment: extraAmount,
          rateType: 'fixed'
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
            extraPayment: extraAmount - 100,
            rateType: 'fixed'
          });
          expect(scenario.monthsSaved).toBeGreaterThan(smallerScenario.monthsSaved);
          expect(scenario.interestSaved).toBeGreaterThan(smallerScenario.interestSaved);
        }
      }
    });

    test('should use minimum payment as default when no fixed expense is linked', async () => {
      // Create mortgage with balance but no linked fixed expense
      const mortgage = await createTestMortgage({
        name: 'Default Payment Mortgage',
        initial_balance: 280000,
        amortization_period: 25
      });
      await addCurrentBalanceEntry(mortgage.id, 275000, 4.75);

      // Verify no linked payment exists
      const currentPayment = await mortgageInsightsService.getCurrentLinkedPayment(mortgage.id);
      expect(currentPayment).toBeNull();

      // Get insights - should use minimum payment as default
      const insights = await mortgageInsightsService.getMortgageInsights(mortgage.id);

      // Current payment should equal minimum payment (default fallback)
      // Use toBeCloseTo for floating point comparison
      expect(insights.currentStatus.currentPayment).toBeCloseTo(insights.currentStatus.minimumPayment, 2);
      expect(insights.currentStatus.paymentSource).toBe('calculated');
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
      await addCurrentBalanceEntry(mortgage.id, 315000, 5.0);

      // Get insights to find minimum payment
      const initialInsights = await mortgageInsightsService.getMortgageInsights(mortgage.id);
      const minimumPayment = initialInsights.currentStatus.minimumPayment;

      // Link a payment higher than minimum
      const higherPayment = minimumPayment + 500;
      await linkFixedExpense(mortgage.id, higherPayment);

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
      await addCurrentBalanceEntry(mortgage.id, 0, 5.0);

      const insights = await mortgageInsightsService.getMortgageInsights(mortgage.id);
      expect(insights.currentStatus.balance).toBe(0);
      expect(insights.projections).toBeNull();

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
      await addCurrentBalanceEntry(mortgage.id, 395000, 6.0);

      // Get minimum payment
      const initialInsights = await mortgageInsightsService.getMortgageInsights(mortgage.id);
      const minimumPayment = initialInsights.currentStatus.minimumPayment;

      // Link a payment lower than minimum
      const underpayment = minimumPayment - 500;
      await linkFixedExpense(mortgage.id, underpayment);

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

    test('should handle variable rate mortgage display', async () => {
      // Create variable rate mortgage
      const mortgage = await createTestMortgage({
        name: 'Variable Rate Mortgage',
        rate_type: 'variable'
      });
      await addCurrentBalanceEntry(mortgage.id, 290000, 5.5);

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
  });
});
