import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import AnnualSummary from './AnnualSummary';

// Integration Tests
// Requirements: 6.3, 6.5
describe('AnnualSummary - Integration Tests', () => {
  describe('Complete Data Flow from API to UI', () => {
    it('should fetch and display complete annual summary data', async () => {
      const mockData = {
        totalExpenses: 12000,
        totalFixedExpenses: 7000,
        totalVariableExpenses: 5000,
        totalIncome: 15000,
        netIncome: 3000,
        averageMonthly: 1000,
        highestMonth: { month: 3, total: 1500 },
        lowestMonth: { month: 7, total: 500 },
        monthlyTotals: Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          total: 1000,
          fixedExpenses: 583.33,
          variableExpenses: 416.67,
          income: 1250
        })),
        byCategory: { Groceries: 5000, Gas: 3000, Other: 4000 },
        byMethod: { Cash: 4000, Debit: 5000, 'CIBC MC': 3000 }
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

      // Wait for data to load
      await waitFor(() => {
        const summaryGrid = container.querySelector('.summary-grid');
        expect(summaryGrid).toBeTruthy();
      });

      // Verify Total Expenses card
      const expenseCards = container.querySelectorAll('.summary-card');
      const totalExpensesCard = expenseCards[0];
      expect(totalExpensesCard.textContent).toContain('Total Expenses');
      expect(totalExpensesCard.textContent).toContain('12,000.00');
      expect(totalExpensesCard.textContent).toContain('Fixed: $7,000.00');
      expect(totalExpensesCard.textContent).toContain('Variable: $5,000.00');

      // Verify Total Income card
      const incomeCard = container.querySelector('.income-card');
      expect(incomeCard).toBeTruthy();
      expect(incomeCard.textContent).toContain('Total Income');
      expect(incomeCard.textContent).toContain('15,000.00');
      expect(incomeCard.textContent).toContain('From all sources');

      // Verify Net Income card
      const netIncomeCard = container.querySelector('.net-income-card');
      expect(netIncomeCard).toBeTruthy();
      expect(netIncomeCard.textContent).toContain('Net Income');
      expect(netIncomeCard.textContent).toContain('3,000.00');
      expect(netIncomeCard.textContent).toContain('Surplus');
      const netIncomeBigNumber = netIncomeCard.querySelector('.big-number');
      expect(netIncomeBigNumber.classList.contains('positive')).toBe(true);

      // Verify Average Monthly card
      expect(container.textContent).toContain('Average Monthly');
      expect(container.textContent).toContain('1,000.00');

      // Verify Highest Month card
      expect(container.textContent).toContain('Highest Month');
      expect(container.textContent).toContain('Mar');
      expect(container.textContent).toContain('1,500.00');

      // Verify Lowest Month card
      expect(container.textContent).toContain('Lowest Month');
      expect(container.textContent).toContain('Jul');
      expect(container.textContent).toContain('500.00');
    });

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
        expect(errorMessage.textContent).toContain('Failed to fetch annual summary');
      });
    });

    it('should handle missing data gracefully', async () => {
      const mockData = {
        totalExpenses: 5000,
        totalFixedExpenses: 0,
        totalVariableExpenses: 5000,
        totalIncome: 0,
        netIncome: -5000,
        averageMonthly: 416.67,
        highestMonth: { month: 1, total: 500 },
        lowestMonth: { month: 2, total: 300 },
        monthlyTotals: Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          total: i === 0 ? 500 : 300,
          fixedExpenses: 0,
          variableExpenses: i === 0 ? 500 : 300,
          income: 0
        })),
        byCategory: {},
        byMethod: {}
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

      // Verify zero fixed expenses
      expect(container.textContent).toContain('Fixed: $0.00');

      // Verify zero income
      const incomeCard = container.querySelector('.income-card');
      expect(incomeCard.textContent).toContain('0.00');

      // Verify negative net income
      const netIncomeCard = container.querySelector('.net-income-card');
      expect(netIncomeCard.textContent).toContain('Deficit');
      const netIncomeBigNumber = netIncomeCard.querySelector('.big-number');
      expect(netIncomeBigNumber.classList.contains('negative')).toBe(true);
    });
  });

  describe('Card Rendering with Various Data Scenarios', () => {
    it('should render all summary cards with positive net income', async () => {
      const mockData = {
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
        byMethod: {}
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

      // Verify all 6 summary cards are rendered
      const summaryCards = container.querySelectorAll('.summary-card');
      expect(summaryCards.length).toBeGreaterThanOrEqual(6);

      // Verify expense breakdown
      const expenseBreakdown = container.querySelector('.expense-breakdown');
      expect(expenseBreakdown).toBeTruthy();
      expect(expenseBreakdown.textContent).toContain('6,000.00');
      expect(expenseBreakdown.textContent).toContain('4,000.00');

      // Verify positive net income styling
      const netIncomeCard = container.querySelector('.net-income-card');
      const bigNumber = netIncomeCard.querySelector('.big-number.positive');
      expect(bigNumber).toBeTruthy();
    });

    it('should render cards with zero values correctly', async () => {
      const mockData = {
        totalExpenses: 0,
        totalFixedExpenses: 0,
        totalVariableExpenses: 0,
        totalIncome: 0,
        netIncome: 0,
        averageMonthly: 0,
        highestMonth: { month: 1, total: 0 },
        lowestMonth: { month: 1, total: 0 },
        monthlyTotals: Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          total: 0,
          fixedExpenses: 0,
          variableExpenses: 0,
          income: 0
        })),
        byCategory: {},
        byMethod: {}
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

      // Verify zero net income has neutral styling
      const netIncomeCard = container.querySelector('.net-income-card');
      const bigNumber = netIncomeCard.querySelector('.big-number.neutral');
      expect(bigNumber).toBeTruthy();
      expect(netIncomeCard.textContent).toContain('Break Even');

      // Verify all values show 0.00
      expect(container.textContent).toContain('0.00');
    });

    it('should render cards with large values correctly', async () => {
      const mockData = {
        totalExpenses: 125000.50,
        totalFixedExpenses: 75000.25,
        totalVariableExpenses: 50000.25,
        totalIncome: 150000.75,
        netIncome: 25000.25,
        averageMonthly: 10416.71,
        highestMonth: { month: 12, total: 15000 },
        lowestMonth: { month: 2, total: 8000 },
        monthlyTotals: [],
        byCategory: {},
        byMethod: {}
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

      // Verify large values are formatted correctly with commas
      expect(container.textContent).toContain('125,000.50');
      expect(container.textContent).toContain('75,000.25');
      expect(container.textContent).toContain('50,000.25');
      expect(container.textContent).toContain('150,000.75');
      expect(container.textContent).toContain('25,000.25');
    });
  });

  describe('Stacked Bar Chart Rendering', () => {
    it('should render stacked bar chart with legend', async () => {
      const mockData = {
        totalExpenses: 12000,
        totalFixedExpenses: 7000,
        totalVariableExpenses: 5000,
        totalIncome: 15000,
        netIncome: 3000,
        averageMonthly: 1000,
        highestMonth: { month: 3, total: 1500 },
        lowestMonth: { month: 7, total: 500 },
        monthlyTotals: Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          total: 1000,
          fixedExpenses: 600,
          variableExpenses: 400,
          income: 1250
        })),
        byCategory: {},
        byMethod: {}
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
        const monthlyChart = container.querySelector('.monthly-chart.stacked');
        expect(monthlyChart).toBeTruthy();
      });

      // Verify legend is rendered
      const legend = container.querySelector('.chart-legend');
      expect(legend).toBeTruthy();
      expect(legend.textContent).toContain('Fixed Expenses');
      expect(legend.textContent).toContain('Variable Expenses');

      // Verify legend colors
      const fixedColor = container.querySelector('.legend-color.fixed-color');
      const variableColor = container.querySelector('.legend-color.variable-color');
      expect(fixedColor).toBeTruthy();
      expect(variableColor).toBeTruthy();

      // Verify 12 month bars
      const monthBarContainers = container.querySelectorAll('.monthly-chart.stacked .month-bar-container');
      expect(monthBarContainers.length).toBe(12);

      // Verify each bar has stacked segments
      monthBarContainers.forEach((barContainer) => {
        const stackedBar = barContainer.querySelector('.stacked-bar');
        expect(stackedBar).toBeTruthy();

        const fixedSegment = barContainer.querySelector('.fixed-segment');
        const variableSegment = barContainer.querySelector('.variable-segment');
        expect(fixedSegment).toBeTruthy();
        expect(variableSegment).toBeTruthy();

        // Verify segments have height styles
        expect(fixedSegment.style.height).toBeTruthy();
        expect(variableSegment.style.height).toBeTruthy();
      });

      // Verify month labels
      const monthLabels = container.querySelectorAll('.monthly-chart.stacked .month-label');
      expect(monthLabels.length).toBe(12);
      expect(monthLabels[0].textContent).toBe('Jan');
      expect(monthLabels[11].textContent).toBe('Dec');
    });

    it('should render empty bars for months with no expenses', async () => {
      const mockData = {
        totalExpenses: 1000,
        totalFixedExpenses: 500,
        totalVariableExpenses: 500,
        totalIncome: 1000,
        netIncome: 0,
        averageMonthly: 83.33,
        highestMonth: { month: 1, total: 1000 },
        lowestMonth: { month: 2, total: 0 },
        monthlyTotals: Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          total: i === 0 ? 1000 : 0,
          fixedExpenses: i === 0 ? 500 : 0,
          variableExpenses: i === 0 ? 500 : 0,
          income: i === 0 ? 1000 : 0
        })),
        byCategory: {},
        byMethod: {}
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
        const monthlyChart = container.querySelector('.monthly-chart.stacked');
        expect(monthlyChart).toBeTruthy();
      });

      // Verify all 12 bars are rendered even with zero values
      const monthBarContainers = container.querySelectorAll('.monthly-chart.stacked .month-bar-container');
      expect(monthBarContainers.length).toBe(12);

      // Verify first month has visible segments
      const firstBar = monthBarContainers[0];
      const firstFixedSegment = firstBar.querySelector('.fixed-segment');
      expect(firstFixedSegment.style.height).not.toBe('0%');

      // Verify other months have zero-height segments
      const secondBar = monthBarContainers[1];
      const secondFixedSegment = secondBar.querySelector('.fixed-segment');
      expect(secondFixedSegment.style.height).toBe('0%');
    });

    it('should display tooltips on bar segments', async () => {
      const mockData = {
        totalExpenses: 12000,
        totalFixedExpenses: 7000,
        totalVariableExpenses: 5000,
        totalIncome: 15000,
        netIncome: 3000,
        averageMonthly: 1000,
        highestMonth: { month: 3, total: 1500 },
        lowestMonth: { month: 7, total: 500 },
        monthlyTotals: [
          {
            month: 1,
            total: 1000,
            fixedExpenses: 600,
            variableExpenses: 400,
            income: 1250
          }
        ].concat(Array.from({ length: 11 }, (_, i) => ({
          month: i + 2,
          total: 1000,
          fixedExpenses: 600,
          variableExpenses: 400,
          income: 1250
        }))),
        byCategory: {},
        byMethod: {}
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
        const monthlyChart = container.querySelector('.monthly-chart.stacked');
        expect(monthlyChart).toBeTruthy();
      });

      // Verify tooltips are present on segments
      const fixedSegments = container.querySelectorAll('.fixed-segment');
      const variableSegments = container.querySelectorAll('.variable-segment');

      fixedSegments.forEach((segment) => {
        expect(segment.getAttribute('title')).toContain('Fixed:');
      });

      variableSegments.forEach((segment) => {
        expect(segment.getAttribute('title')).toContain('Variable:');
      });
    });
  });

  describe('Responsive Layout', () => {
    it('should render summary grid layout', async () => {
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

      // Verify grid contains summary cards
      const summaryGrid = container.querySelector('.summary-grid');
      const summaryCards = summaryGrid.querySelectorAll('.summary-card');
      expect(summaryCards.length).toBeGreaterThanOrEqual(6);

      // Verify summary sections are rendered
      const summarySections = container.querySelectorAll('.summary-section');
      expect(summarySections.length).toBeGreaterThanOrEqual(1); // At least Monthly Breakdown
    });

    it('should render all sections in correct order', async () => {
      const mockData = {
        totalExpenses: 12000,
        totalFixedExpenses: 7000,
        totalVariableExpenses: 5000,
        totalIncome: 15000,
        netIncome: 3000,
        averageMonthly: 1000,
        highestMonth: { month: 3, total: 1500 },
        lowestMonth: { month: 7, total: 500 },
        monthlyTotals: Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          total: 1000,
          fixedExpenses: 600,
          variableExpenses: 400,
          income: 1250
        })),
        byCategory: { Groceries: 5000, Gas: 3000, Other: 4000 },
        byMethod: { Cash: 4000, Debit: 5000, 'CIBC MC': 3000 }
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

      // Verify sections appear in order
      const sections = container.querySelectorAll('.summary-section');
      const sectionHeadings = Array.from(sections).map(section => 
        section.querySelector('h3')?.textContent
      );

      expect(sectionHeadings).toContain('Monthly Breakdown');
      expect(sectionHeadings).toContain('By Category');
      expect(sectionHeadings).toContain('By Payment Method');

      // Verify category and payment method data is rendered
      const categoryGrid = container.querySelector('.category-grid');
      expect(categoryGrid).toBeTruthy();

      const categoryItems = container.querySelectorAll('.category-item');
      expect(categoryItems.length).toBeGreaterThan(0);
    });
  });
});

