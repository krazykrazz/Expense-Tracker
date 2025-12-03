import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import * as fc from 'fast-check';
import KeyMetricsRow from './KeyMetricsRow';

describe('KeyMetricsRow Property-Based Tests', () => {
  /**
   * **Feature: summary-panel-redesign, Property 1: Net Balance Color Coding**
   * 
   * For any net balance value, the Summary_Panel SHALL apply the "positive" CSS class 
   * when the value is greater than or equal to zero, and the "negative" CSS class 
   * when the value is less than zero.
   * **Validates: Requirements 1.3, 1.4**
   */
  it('Property 1: net balance applies correct color class based on sign', async () => {
    // Generator for financial values (reasonable range for personal finance)
    const incomeArb = fc.float({ min: 0, max: 100000, noNaN: true });
    const fixedExpensesArb = fc.float({ min: 0, max: 50000, noNaN: true });
    const variableExpensesArb = fc.float({ min: 0, max: 50000, noNaN: true });

    await fc.assert(
      fc.asyncProperty(
        incomeArb,
        fixedExpensesArb,
        variableExpensesArb,
        async (income, fixedExpenses, variableExpenses) => {
          const { container, unmount } = render(
            <KeyMetricsRow
              income={income}
              fixedExpenses={fixedExpenses}
              variableExpenses={variableExpenses}
            />
          );

          // Calculate expected net balance
          const totalExpenses = fixedExpenses + variableExpenses;
          const netBalance = income - totalExpenses;

          // Find the net balance metric card
          const balanceCard = container.querySelector('.balance-metric');
          expect(balanceCard).toBeTruthy();

          // Find the metric value element within the balance card
          const metricValue = balanceCard.querySelector('.metric-value');
          expect(metricValue).toBeTruthy();

          // Verify the correct color class is applied
          if (netBalance >= 0) {
            expect(metricValue.classList.contains('positive')).toBe(true);
            expect(metricValue.classList.contains('negative')).toBe(false);
          } else {
            expect(metricValue.classList.contains('negative')).toBe(true);
            expect(metricValue.classList.contains('positive')).toBe(false);
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: summary-panel-redesign, Property 2: Total Expenses Calculation**
   * 
   * For any fixed expenses value and variable expenses value, the displayed 
   * Total Expenses SHALL equal the sum of fixed expenses plus variable expenses.
   * **Validates: Requirements 1.5**
   */
  it('Property 2: total expenses equals sum of fixed and variable expenses', async () => {
    // Generator for financial values
    const fixedExpensesArb = fc.float({ min: 0, max: 50000, noNaN: true });
    const variableExpensesArb = fc.float({ min: 0, max: 50000, noNaN: true });

    await fc.assert(
      fc.asyncProperty(
        fixedExpensesArb,
        variableExpensesArb,
        async (fixedExpenses, variableExpenses) => {
          const { container, unmount } = render(
            <KeyMetricsRow
              income={5000}
              fixedExpenses={fixedExpenses}
              variableExpenses={variableExpenses}
            />
          );

          // Calculate expected total
          const expectedTotal = fixedExpenses + variableExpenses;

          // Find the expenses metric card
          const expensesCard = container.querySelector('.expenses-metric');
          expect(expensesCard).toBeTruthy();

          // Find the metric value element
          const metricValue = expensesCard.querySelector('.metric-value');
          expect(metricValue).toBeTruthy();

          // Extract the displayed value (remove $ and commas)
          const displayedText = metricValue.textContent;
          const displayedValue = parseFloat(displayedText.replace(/[$,]/g, ''));

          // Verify the displayed value matches the expected total
          // Using a small tolerance for floating point comparison
          expect(Math.abs(displayedValue - expectedTotal)).toBeLessThan(0.01);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property test: All three metrics are always displayed
   * **Validates: Requirements 1.1**
   */
  it('Property: all three key metrics are always displayed', async () => {
    const incomeArb = fc.float({ min: 0, max: 100000, noNaN: true });
    const fixedExpensesArb = fc.float({ min: 0, max: 50000, noNaN: true });
    const variableExpensesArb = fc.float({ min: 0, max: 50000, noNaN: true });

    await fc.assert(
      fc.asyncProperty(
        incomeArb,
        fixedExpensesArb,
        variableExpensesArb,
        async (income, fixedExpenses, variableExpenses) => {
          const { container, unmount } = render(
            <KeyMetricsRow
              income={income}
              fixedExpenses={fixedExpenses}
              variableExpenses={variableExpenses}
            />
          );

          // Verify all three metric cards are present
          const incomeCard = container.querySelector('.income-metric');
          const expensesCard = container.querySelector('.expenses-metric');
          const balanceCard = container.querySelector('.balance-metric');

          expect(incomeCard).toBeTruthy();
          expect(expensesCard).toBeTruthy();
          expect(balanceCard).toBeTruthy();

          // Verify each card has a label and value
          const labels = container.querySelectorAll('.metric-label');
          const values = container.querySelectorAll('.metric-value');

          expect(labels.length).toBe(3);
          expect(values.length).toBe(3);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
