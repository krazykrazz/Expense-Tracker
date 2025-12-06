import { describe, it, expect, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import AnnualSummary from './AnnualSummary';

// Integration Tests for Net Worth Card
// Requirements: 4.3
describe('AnnualSummary - Net Worth Card Integration Tests', () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    global.fetch = undefined;
  });

  describe('Complete Data Flow from API to UI', () => {
    it('should fetch net worth data from API and display in card', async () => {
      const mockData = {
        totalExpenses: 12000,
        totalFixedExpenses: 7000,
        totalVariableExpenses: 5000,
        totalIncome: 15000,
        netIncome: 3000,
        averageMonthly: 1000,
        highestMonth: { month: 3, total: 1500 },
        lowestMonth: { month: 7, total: 500 },
        monthlyTotals: [],
        byCategory: {},
        byMethod: {},
        netWorth: 50000,
        totalAssets: 75000,
        totalLiabilities: 25000
      };

      global.fetch = async (url) => {
        if (url.includes('/api/expenses/annual-summary')) {
          return {
            ok: true,
            json: async () => mockData
          };
        }
        if (url.includes('/api/expenses/tax-deductible')) {
          return {
            ok: true,
            json: async () => ({
              totalDeductible: 0,
              medicalTotal: 0,
              donationTotal: 0,
              expenses: { medical: [], donations: [] },
              monthlyBreakdown: []
            })
          };
        }
        return { ok: false };
      };

      const { container } = render(<AnnualSummary year={2024} />);

      await waitFor(() => {
        const netWorthCard = container.querySelector('.net-worth-card');
        expect(netWorthCard).toBeTruthy();
      });

      // Verify Net Worth card is rendered
      const netWorthCard = container.querySelector('.net-worth-card');
      expect(netWorthCard.textContent).toContain('Net Worth');
      expect(netWorthCard.textContent).toContain('50,000.00');
      
      // Verify breakdown is displayed
      expect(netWorthCard.textContent).toContain('Assets: $75,000.00');
      expect(netWorthCard.textContent).toContain('Liabilities: $25,000.00');
      
      // Verify subtitle
      expect(netWorthCard.textContent).toContain('Year-end position');
      
      // Verify positive styling
      const bigNumber = netWorthCard.querySelector('.big-number');
      expect(bigNumber.classList.contains('positive')).toBe(true);
    });

    it('should handle negative net worth correctly', async () => {
      const mockData = {
        totalExpenses: 12000,
        totalFixedExpenses: 7000,
        totalVariableExpenses: 5000,
        totalIncome: 15000,
        netIncome: 3000,
        averageMonthly: 1000,
        highestMonth: { month: 3, total: 1500 },
        lowestMonth: { month: 7, total: 500 },
        monthlyTotals: [],
        byCategory: {},
        byMethod: {},
        netWorth: -15000,
        totalAssets: 10000,
        totalLiabilities: 25000
      };

      global.fetch = async (url) => {
        if (url.includes('/api/expenses/annual-summary')) {
          return {
            ok: true,
            json: async () => mockData
          };
        }
        if (url.includes('/api/expenses/tax-deductible')) {
          return {
            ok: true,
            json: async () => ({
              totalDeductible: 0,
              medicalTotal: 0,
              donationTotal: 0,
              expenses: { medical: [], donations: [] },
              monthlyBreakdown: []
            })
          };
        }
        return { ok: false };
      };

      const { container } = render(<AnnualSummary year={2024} />);

      await waitFor(() => {
        const netWorthCard = container.querySelector('.net-worth-card');
        expect(netWorthCard).toBeTruthy();
      });

      const netWorthCard = container.querySelector('.net-worth-card');
      
      // Verify negative value is displayed as absolute value
      expect(netWorthCard.textContent).toContain('15,000.00');
      
      // Verify negative styling
      const bigNumber = netWorthCard.querySelector('.big-number');
      expect(bigNumber.classList.contains('negative')).toBe(true);
      
      // Verify breakdown shows correct values
      expect(netWorthCard.textContent).toContain('Assets: $10,000.00');
      expect(netWorthCard.textContent).toContain('Liabilities: $25,000.00');
    });

    it('should handle zero net worth correctly', async () => {
      const mockData = {
        totalExpenses: 12000,
        totalFixedExpenses: 7000,
        totalVariableExpenses: 5000,
        totalIncome: 15000,
        netIncome: 3000,
        averageMonthly: 1000,
        highestMonth: { month: 3, total: 1500 },
        lowestMonth: { month: 7, total: 500 },
        monthlyTotals: [],
        byCategory: {},
        byMethod: {},
        netWorth: 0,
        totalAssets: 25000,
        totalLiabilities: 25000
      };

      global.fetch = async (url) => {
        if (url.includes('/api/expenses/annual-summary')) {
          return {
            ok: true,
            json: async () => mockData
          };
        }
        if (url.includes('/api/expenses/tax-deductible')) {
          return {
            ok: true,
            json: async () => ({
              totalDeductible: 0,
              medicalTotal: 0,
              donationTotal: 0,
              expenses: { medical: [], donations: [] },
              monthlyBreakdown: []
            })
          };
        }
        return { ok: false };
      };

      const { container } = render(<AnnualSummary year={2024} />);

      await waitFor(() => {
        const netWorthCard = container.querySelector('.net-worth-card');
        expect(netWorthCard).toBeTruthy();
      });

      const netWorthCard = container.querySelector('.net-worth-card');
      
      // Verify zero value
      expect(netWorthCard.textContent).toContain('0.00');
      
      // Verify positive styling for zero (as per requirements)
      const bigNumber = netWorthCard.querySelector('.big-number');
      expect(bigNumber.classList.contains('positive')).toBe(true);
      
      // Verify equal assets and liabilities
      expect(netWorthCard.textContent).toContain('Assets: $25,000.00');
      expect(netWorthCard.textContent).toContain('Liabilities: $25,000.00');
    });

    it('should handle missing net worth data gracefully', async () => {
      const mockData = {
        totalExpenses: 12000,
        totalFixedExpenses: 7000,
        totalVariableExpenses: 5000,
        totalIncome: 15000,
        netIncome: 3000,
        averageMonthly: 1000,
        highestMonth: { month: 3, total: 1500 },
        lowestMonth: { month: 7, total: 500 },
        monthlyTotals: [],
        byCategory: {},
        byMethod: {}
        // No netWorth, totalAssets, or totalLiabilities
      };

      global.fetch = async (url) => {
        if (url.includes('/api/expenses/annual-summary')) {
          return {
            ok: true,
            json: async () => mockData
          };
        }
        if (url.includes('/api/expenses/tax-deductible')) {
          return {
            ok: true,
            json: async () => ({
              totalDeductible: 0,
              medicalTotal: 0,
              donationTotal: 0,
              expenses: { medical: [], donations: [] },
              monthlyBreakdown: []
            })
          };
        }
        return { ok: false };
      };

      const { container } = render(<AnnualSummary year={2024} />);

      await waitFor(() => {
        const netWorthCard = container.querySelector('.net-worth-card');
        expect(netWorthCard).toBeTruthy();
      });

      const netWorthCard = container.querySelector('.net-worth-card');
      
      // Verify defaults to $0
      expect(netWorthCard.textContent).toContain('0.00');
      expect(netWorthCard.textContent).toContain('Assets: $0.00');
      expect(netWorthCard.textContent).toContain('Liabilities: $0.00');
    });
  });

  describe('Card Rendering with Various Data Scenarios', () => {
    it('should render net worth card with large positive values', async () => {
      const mockData = {
        totalExpenses: 50000,
        totalFixedExpenses: 30000,
        totalVariableExpenses: 20000,
        totalIncome: 75000,
        netIncome: 25000,
        averageMonthly: 4166.67,
        highestMonth: { month: 12, total: 5000 },
        lowestMonth: { month: 6, total: 3000 },
        monthlyTotals: [],
        byCategory: {},
        byMethod: {},
        netWorth: 250000.50,
        totalAssets: 350000.75,
        totalLiabilities: 100000.25
      };

      global.fetch = async (url) => {
        if (url.includes('/api/expenses/annual-summary')) {
          return {
            ok: true,
            json: async () => mockData
          };
        }
        if (url.includes('/api/expenses/tax-deductible')) {
          return {
            ok: true,
            json: async () => ({
              totalDeductible: 0,
              medicalTotal: 0,
              donationTotal: 0,
              expenses: { medical: [], donations: [] },
              monthlyBreakdown: []
            })
          };
        }
        return { ok: false };
      };

      const { container } = render(<AnnualSummary year={2024} />);

      await waitFor(() => {
        const netWorthCard = container.querySelector('.net-worth-card');
        expect(netWorthCard).toBeTruthy();
      });

      const netWorthCard = container.querySelector('.net-worth-card');
      
      // Verify large values are formatted with commas
      expect(netWorthCard.textContent).toContain('250,000.50');
      expect(netWorthCard.textContent).toContain('Assets: $350,000.75');
      expect(netWorthCard.textContent).toContain('Liabilities: $100,000.25');
    });

    it('should render net worth card with only assets (no liabilities)', async () => {
      const mockData = {
        totalExpenses: 12000,
        totalFixedExpenses: 7000,
        totalVariableExpenses: 5000,
        totalIncome: 15000,
        netIncome: 3000,
        averageMonthly: 1000,
        highestMonth: { month: 3, total: 1500 },
        lowestMonth: { month: 7, total: 500 },
        monthlyTotals: [],
        byCategory: {},
        byMethod: {},
        netWorth: 50000,
        totalAssets: 50000,
        totalLiabilities: 0
      };

      global.fetch = async (url) => {
        if (url.includes('/api/expenses/annual-summary')) {
          return {
            ok: true,
            json: async () => mockData
          };
        }
        if (url.includes('/api/expenses/tax-deductible')) {
          return {
            ok: true,
            json: async () => ({
              totalDeductible: 0,
              medicalTotal: 0,
              donationTotal: 0,
              expenses: { medical: [], donations: [] },
              monthlyBreakdown: []
            })
          };
        }
        return { ok: false };
      };

      const { container } = render(<AnnualSummary year={2024} />);

      await waitFor(() => {
        const netWorthCard = container.querySelector('.net-worth-card');
        expect(netWorthCard).toBeTruthy();
      });

      const netWorthCard = container.querySelector('.net-worth-card');
      
      // Verify net worth equals assets when no liabilities
      expect(netWorthCard.textContent).toContain('50,000.00');
      expect(netWorthCard.textContent).toContain('Assets: $50,000.00');
      expect(netWorthCard.textContent).toContain('Liabilities: $0.00');
      
      // Verify positive styling
      const bigNumber = netWorthCard.querySelector('.big-number');
      expect(bigNumber.classList.contains('positive')).toBe(true);
    });

    it('should render net worth card with only liabilities (no assets)', async () => {
      const mockData = {
        totalExpenses: 12000,
        totalFixedExpenses: 7000,
        totalVariableExpenses: 5000,
        totalIncome: 15000,
        netIncome: 3000,
        averageMonthly: 1000,
        highestMonth: { month: 3, total: 1500 },
        lowestMonth: { month: 7, total: 500 },
        monthlyTotals: [],
        byCategory: {},
        byMethod: {},
        netWorth: -30000,
        totalAssets: 0,
        totalLiabilities: 30000
      };

      global.fetch = async (url) => {
        if (url.includes('/api/expenses/annual-summary')) {
          return {
            ok: true,
            json: async () => mockData
          };
        }
        if (url.includes('/api/expenses/tax-deductible')) {
          return {
            ok: true,
            json: async () => ({
              totalDeductible: 0,
              medicalTotal: 0,
              donationTotal: 0,
              expenses: { medical: [], donations: [] },
              monthlyBreakdown: []
            })
          };
        }
        return { ok: false };
      };

      const { container } = render(<AnnualSummary year={2024} />);

      await waitFor(() => {
        const netWorthCard = container.querySelector('.net-worth-card');
        expect(netWorthCard).toBeTruthy();
      });

      const netWorthCard = container.querySelector('.net-worth-card');
      
      // Verify negative net worth when only liabilities exist
      expect(netWorthCard.textContent).toContain('30,000.00');
      expect(netWorthCard.textContent).toContain('Assets: $0.00');
      expect(netWorthCard.textContent).toContain('Liabilities: $30,000.00');
      
      // Verify negative styling
      const bigNumber = netWorthCard.querySelector('.big-number');
      expect(bigNumber.classList.contains('negative')).toBe(true);
    });

    it('should render net worth card with decimal values', async () => {
      const mockData = {
        totalExpenses: 12000,
        totalFixedExpenses: 7000,
        totalVariableExpenses: 5000,
        totalIncome: 15000,
        netIncome: 3000,
        averageMonthly: 1000,
        highestMonth: { month: 3, total: 1500 },
        lowestMonth: { month: 7, total: 500 },
        monthlyTotals: [],
        byCategory: {},
        byMethod: {},
        netWorth: 12345.67,
        totalAssets: 23456.78,
        totalLiabilities: 11111.11
      };

      global.fetch = async (url) => {
        if (url.includes('/api/expenses/annual-summary')) {
          return {
            ok: true,
            json: async () => mockData
          };
        }
        if (url.includes('/api/expenses/tax-deductible')) {
          return {
            ok: true,
            json: async () => ({
              totalDeductible: 0,
              medicalTotal: 0,
              donationTotal: 0,
              expenses: { medical: [], donations: [] },
              monthlyBreakdown: []
            })
          };
        }
        return { ok: false };
      };

      const { container } = render(<AnnualSummary year={2024} />);

      await waitFor(() => {
        const netWorthCard = container.querySelector('.net-worth-card');
        expect(netWorthCard).toBeTruthy();
      });

      const netWorthCard = container.querySelector('.net-worth-card');
      
      // Verify decimal values are formatted correctly
      expect(netWorthCard.textContent).toContain('12,345.67');
      expect(netWorthCard.textContent).toContain('Assets: $23,456.78');
      expect(netWorthCard.textContent).toContain('Liabilities: $11,111.11');
    });
  });

  describe('Responsive Layout', () => {
    it('should render net worth card in summary grid', async () => {
      const mockData = {
        totalExpenses: 12000,
        totalFixedExpenses: 7000,
        totalVariableExpenses: 5000,
        totalIncome: 15000,
        netIncome: 3000,
        averageMonthly: 1000,
        highestMonth: { month: 3, total: 1500 },
        lowestMonth: { month: 7, total: 500 },
        monthlyTotals: [],
        byCategory: {},
        byMethod: {},
        netWorth: 50000,
        totalAssets: 75000,
        totalLiabilities: 25000
      };

      global.fetch = async (url) => {
        if (url.includes('/api/expenses/annual-summary')) {
          return {
            ok: true,
            json: async () => mockData
          };
        }
        if (url.includes('/api/expenses/tax-deductible')) {
          return {
            ok: true,
            json: async () => ({
              totalDeductible: 0,
              medicalTotal: 0,
              donationTotal: 0,
              expenses: { medical: [], donations: [] },
              monthlyBreakdown: []
            })
          };
        }
        return { ok: false };
      };

      const { container } = render(<AnnualSummary year={2024} />);

      await waitFor(() => {
        const summaryGrid = container.querySelector('.summary-grid');
        expect(summaryGrid).toBeTruthy();
      });

      // Verify net worth card is in the summary grid
      const summaryGrid = container.querySelector('.summary-grid');
      const netWorthCard = summaryGrid.querySelector('.net-worth-card');
      expect(netWorthCard).toBeTruthy();
      
      // Verify it's a summary card
      expect(netWorthCard.classList.contains('summary-card')).toBe(true);
    });

    it('should render net worth card with proper structure', async () => {
      const mockData = {
        totalExpenses: 12000,
        totalFixedExpenses: 7000,
        totalVariableExpenses: 5000,
        totalIncome: 15000,
        netIncome: 3000,
        averageMonthly: 1000,
        highestMonth: { month: 3, total: 1500 },
        lowestMonth: { month: 7, total: 500 },
        monthlyTotals: [],
        byCategory: {},
        byMethod: {},
        netWorth: 50000,
        totalAssets: 75000,
        totalLiabilities: 25000
      };

      global.fetch = async (url) => {
        if (url.includes('/api/expenses/annual-summary')) {
          return {
            ok: true,
            json: async () => mockData
          };
        }
        if (url.includes('/api/expenses/tax-deductible')) {
          return {
            ok: true,
            json: async () => ({
              totalDeductible: 0,
              medicalTotal: 0,
              donationTotal: 0,
              expenses: { medical: [], donations: [] },
              monthlyBreakdown: []
            })
          };
        }
        return { ok: false };
      };

      const { container } = render(<AnnualSummary year={2024} />);

      await waitFor(() => {
        const netWorthCard = container.querySelector('.net-worth-card');
        expect(netWorthCard).toBeTruthy();
      });

      const netWorthCard = container.querySelector('.net-worth-card');
      
      // Verify card structure
      const heading = netWorthCard.querySelector('h3');
      expect(heading).toBeTruthy();
      expect(heading.textContent).toBe('Net Worth');
      
      const bigNumber = netWorthCard.querySelector('.big-number');
      expect(bigNumber).toBeTruthy();
      
      const breakdown = netWorthCard.querySelector('.net-worth-breakdown');
      expect(breakdown).toBeTruthy();
      
      const assetsLabel = breakdown.querySelector('.assets-label');
      expect(assetsLabel).toBeTruthy();
      
      const separator = breakdown.querySelector('.separator');
      expect(separator).toBeTruthy();
      expect(separator.textContent).toBe('-');
      
      const liabilitiesLabel = breakdown.querySelector('.liabilities-label');
      expect(liabilitiesLabel).toBeTruthy();
      
      const subText = netWorthCard.querySelector('.sub-text');
      expect(subText).toBeTruthy();
      expect(subText.textContent).toBe('Year-end position');
    });

    it('should render all summary cards including net worth', async () => {
      const mockData = {
        totalExpenses: 12000,
        totalFixedExpenses: 7000,
        totalVariableExpenses: 5000,
        totalIncome: 15000,
        netIncome: 3000,
        averageMonthly: 1000,
        highestMonth: { month: 3, total: 1500 },
        lowestMonth: { month: 7, total: 500 },
        monthlyTotals: [],
        byCategory: {},
        byMethod: {},
        netWorth: 50000,
        totalAssets: 75000,
        totalLiabilities: 25000
      };

      global.fetch = async (url) => {
        if (url.includes('/api/expenses/annual-summary')) {
          return {
            ok: true,
            json: async () => mockData
          };
        }
        if (url.includes('/api/expenses/tax-deductible')) {
          return {
            ok: true,
            json: async () => ({
              totalDeductible: 0,
              medicalTotal: 0,
              donationTotal: 0,
              expenses: { medical: [], donations: [] },
              monthlyBreakdown: []
            })
          };
        }
        return { ok: false };
      };

      const { container } = render(<AnnualSummary year={2024} />);

      await waitFor(() => {
        const summaryGrid = container.querySelector('.summary-grid');
        expect(summaryGrid).toBeTruthy();
      });

      // Verify all expected cards are present
      const summaryCards = container.querySelectorAll('.summary-card');
      expect(summaryCards.length).toBeGreaterThanOrEqual(8); // Including Net Worth card
      
      // Verify specific cards exist
      expect(container.querySelector('.income-card')).toBeTruthy();
      expect(container.querySelector('.net-income-card')).toBeTruthy();
      expect(container.querySelector('.net-worth-card')).toBeTruthy();
    });
  });

  describe('API Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      global.fetch = async (url) => {
        if (url.includes('/api/expenses/annual-summary')) {
          return {
            ok: false,
            status: 500
          };
        }
        return { ok: false };
      };

      const { container } = render(<AnnualSummary year={2024} />);

      await waitFor(() => {
        const errorMessage = container.querySelector('.error-message');
        expect(errorMessage).toBeTruthy();
      });

      // Verify error message is displayed
      const errorMessage = container.querySelector('.error-message');
      expect(errorMessage.textContent).toContain('Failed to fetch annual summary');
      
      // Verify net worth card is not rendered
      const netWorthCard = container.querySelector('.net-worth-card');
      expect(netWorthCard).toBeFalsy();
    });

    it('should handle network errors gracefully', async () => {
      global.fetch = async () => {
        throw new Error('Network error');
      };

      const { container } = render(<AnnualSummary year={2024} />);

      await waitFor(() => {
        const errorMessage = container.querySelector('.error-message');
        expect(errorMessage).toBeTruthy();
      });

      // Verify error is displayed
      const errorMessage = container.querySelector('.error-message');
      expect(errorMessage).toBeTruthy();
    });
  });

  describe('Year Changes', () => {
    it('should refetch data when year changes', async () => {
      let fetchCount = 0;
      const mockData2023 = {
        totalExpenses: 10000,
        totalFixedExpenses: 6000,
        totalVariableExpenses: 4000,
        totalIncome: 12000,
        netIncome: 2000,
        averageMonthly: 833.33,
        highestMonth: { month: 12, total: 1200 },
        lowestMonth: { month: 6, total: 600 },
        monthlyTotals: [],
        byCategory: {},
        byMethod: {},
        netWorth: 40000,
        totalAssets: 60000,
        totalLiabilities: 20000
      };

      const mockData2024 = {
        totalExpenses: 12000,
        totalFixedExpenses: 7000,
        totalVariableExpenses: 5000,
        totalIncome: 15000,
        netIncome: 3000,
        averageMonthly: 1000,
        highestMonth: { month: 3, total: 1500 },
        lowestMonth: { month: 7, total: 500 },
        monthlyTotals: [],
        byCategory: {},
        byMethod: {},
        netWorth: 50000,
        totalAssets: 75000,
        totalLiabilities: 25000
      };

      global.fetch = async (url) => {
        fetchCount++;
        if (url.includes('/api/expenses/annual-summary')) {
          if (url.includes('year=2023')) {
            return {
              ok: true,
              json: async () => mockData2023
            };
          } else {
            return {
              ok: true,
              json: async () => mockData2024
            };
          }
        }
        if (url.includes('/api/expenses/tax-deductible')) {
          return {
            ok: true,
            json: async () => ({
              totalDeductible: 0,
              medicalTotal: 0,
              donationTotal: 0,
              expenses: { medical: [], donations: [] },
              monthlyBreakdown: []
            })
          };
        }
        return { ok: false };
      };

      const { container, rerender } = render(<AnnualSummary year={2023} />);

      await waitFor(() => {
        const netWorthCard = container.querySelector('.net-worth-card');
        expect(netWorthCard).toBeTruthy();
        expect(netWorthCard.textContent).toContain('40,000.00');
      });

      // Change year
      rerender(<AnnualSummary year={2024} />);

      await waitFor(() => {
        const netWorthCard = container.querySelector('.net-worth-card');
        expect(netWorthCard.textContent).toContain('50,000.00');
      });

      // Verify data was refetched
      expect(fetchCount).toBeGreaterThan(2); // Initial fetch + refetch on year change
    });
  });
});
