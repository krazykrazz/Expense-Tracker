/**
 * @invariant Net Worth Calculation: For any combination of total assets and total liabilities, net worth equals assets minus liabilities; the display correctly reflects positive, negative, and zero net worth. Randomization covers diverse financial value combinations.
 */

import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import fc from 'fast-check';
import AnnualSummary from './AnnualSummary';

// Helper to create mock fetch function
const createMockFetch = (netWorth, totalAssets, totalLiabilities) => {
  return async (url) => {
    if (url.includes('/api/expenses/annual-summary')) {
      return {
        ok: true,
        json: async () => ({
          totalExpenses: 5000,
          totalFixedExpenses: 3000,
          totalVariableExpenses: 2000,
          totalIncome: 5000,
          netIncome: 0,
          netWorth: netWorth,
          totalAssets: totalAssets,
          totalLiabilities: totalLiabilities,
          averageMonthly: 416.67,
          highestMonth: { month: 1, total: 500 },
          lowestMonth: { month: 2, total: 300 },
          monthlyTotals: Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            total: 400,
            fixedExpenses: 250,
            variableExpenses: 150,
            income: 400
          })),
          byCategory: { Groceries: 2000, Gas: 1500, Other: 1500 },
          byMethod: { Cash: 1000, Debit: 2000, 'CIBC MC': 2000 }
        })
      };
    }
    if (url.includes('/api/income/annual-by-category')) {
      return {
        ok: true,
        json: async () => ({})
      };
    }
    return { ok: false };
  };
};

describe('AnnualSummary - Net Worth Color Coding', () => {
  // Feature: net-worth-card, Property 3: Color coding correctness
  // Validates: Requirements 1.4, 1.5
  it('Property 3: Net worth color coding should be correct for all values', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random net worth values including positive, negative, and zero
        fc.float({ min: -1000000, max: 1000000, noNaN: true }),
        // Generate random assets (must be non-negative)
        fc.float({ min: 0, max: 1000000, noNaN: true }),
        async (netWorth, assets) => {
          // Round to 2 decimal places to match real-world currency values
          const roundedNetWorth = Math.round(netWorth * 100) / 100;
          const roundedAssets = Math.round(assets * 100) / 100;
          
          // Calculate liabilities based on net worth formula: netWorth = assets - liabilities
          // Therefore: liabilities = assets - netWorth
          const liabilities = Math.max(0, roundedAssets - roundedNetWorth);
          const roundedLiabilities = Math.round(liabilities * 100) / 100;
          
          // Recalculate net worth to ensure consistency
          const actualNetWorth = roundedAssets - roundedLiabilities;
          
          // Mock fetch to return our test data
          global.fetch = createMockFetch(actualNetWorth, roundedAssets, roundedLiabilities);

          // Render the component
          const { container, unmount } = render(<AnnualSummary year={2024} />);

          // Wait for the component to load and find the net worth card
          await waitFor(() => {
            const netWorthCard = container.querySelector('.net-worth-card');
            expect(netWorthCard).toBeTruthy();
          }, { timeout: 1000 });

          // Find the net worth card
          const netWorthCard = container.querySelector('.net-worth-card');
          const bigNumber = netWorthCard.querySelector('.big-number');

          // Property: Color class should match the net worth value
          // Positive or zero -> green (positive class)
          // Negative -> red (negative class)
          if (actualNetWorth >= 0) {
            expect(bigNumber.classList.contains('positive')).toBe(true);
            expect(bigNumber.classList.contains('negative')).toBe(false);
          } else {
            expect(bigNumber.classList.contains('negative')).toBe(true);
            expect(bigNumber.classList.contains('positive')).toBe(false);
          }

          // Property: Display value should be absolute value
          const displayedValue = bigNumber.textContent;
          const absoluteValue = Math.abs(actualNetWorth);
          // Remove formatting to compare numeric values
          const numericDisplayValue = parseFloat(displayedValue.replace(/[$,]/g, ''));
          expect(Math.abs(numericDisplayValue - absoluteValue)).toBeLessThan(0.01);
          
          // Clean up
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  }, 60000); // Increase timeout to 60 seconds for property-based test
});
