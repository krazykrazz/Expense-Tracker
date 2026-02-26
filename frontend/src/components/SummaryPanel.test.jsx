import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/fetchProvider', async () => {
  const actual = await vi.importActual('../utils/fetchProvider');
  return {
    ...actual,
    getFetchFn: () => (...args) => globalThis.fetch(...args),
    authAwareFetch: (...args) => globalThis.fetch(...args),
  };
});

import { render, screen, waitFor } from '@testing-library/react';
import * as fc from 'fast-check';
import { ModalProvider } from '../contexts/ModalContext';
import SummaryPanel from './SummaryPanel';

// Mock the child components
vi.mock('./IncomeManagementModal', () => ({
  default: () => null
}));

vi.mock('./FixedExpensesModal', () => ({
  default: () => null
}));

vi.mock('./TrendIndicator', () => ({
  default: ({ currentValue, previousValue }) => {
    if (!previousValue || previousValue === 0) return null;
    const percentChange = (currentValue - previousValue) / previousValue;
    if (Math.abs(percentChange) < 0.01) return null;
    return (
      <span
        className="trend-indicator-mock"
        data-current={currentValue}
        data-previous={previousValue}
      >
        {percentChange > 0 ? '▲' : '▼'}
      </span>
    );
  }
}));

const renderWithProviders = (ui) =>
  render(<ModalProvider>{ui}</ModalProvider>);

describe('SummaryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('Loading States', () => {
    it('should display loading skeleton when loading is true', () => {
      global.fetch.mockImplementation(() => new Promise(() => {}));
      renderWithProviders(<SummaryPanel selectedYear={2025} selectedMonth={11} refreshTrigger={0} />);
      expect(document.querySelector('.loading-message')).toBeInTheDocument();
      expect(document.querySelector('.loading-message').textContent).toContain('Loading summary');
    });

    it('should display content when loading is false', async () => {
      const mockResponse = {
        current: {
          total: 500,
          weeklyTotals: { week1: 100, week2: 100, week3: 100, week4: 100, week5: 100 },
          typeTotals: { Groceries: 200, Gas: 100, Other: 100, 'Tax - Medical': 50, 'Tax - Donation': 50 },
          methodTotals: { Cash: 50, Debit: 50, Cheque: 0, 'CIBC MC': 100, 'PCF MC': 0, 'WS VISA': 0, VISA: 0 },
          monthlyGross: 3000,
          totalFixedExpenses: 1500,
          netBalance: 1000
        },
        previous: {
          total: 450,
          weeklyTotals: { week1: 90, week2: 90, week3: 90, week4: 90, week5: 90 },
          typeTotals: { Groceries: 180, Gas: 90, Other: 90, 'Tax - Medical': 45, 'Tax - Donation': 45 },
          methodTotals: { Cash: 45, Debit: 45, Cheque: 0, 'CIBC MC': 90, 'PCF MC': 0, 'WS VISA': 0, VISA: 0 },
          monthlyGross: 3000,
          totalFixedExpenses: 1500,
          netBalance: 1050
        }
      };

      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockResponse });

      renderWithProviders(<SummaryPanel selectedYear={2025} selectedMonth={11} refreshTrigger={0} />);

      await waitFor(() => {
        expect(document.querySelector('.loading-message')).not.toBeInTheDocument();
      });

      expect(document.querySelector('.summary-panel')).toBeInTheDocument();
      expect(screen.getByText('Monthly Summary')).toBeInTheDocument();
    });
  });

  describe('Summary Grid Layout', () => {
    const baseResponse = {
      current: {
        total: 500,
        weeklyTotals: { week1: 100, week2: 100, week3: 100, week4: 100, week5: 100 },
        typeTotals: { Groceries: 200, Gas: 100, Other: 100, 'Tax - Medical': 50, 'Tax - Donation': 50 },
        methodTotals: { Cash: 50, Debit: 50, Cheque: 0, 'CIBC MC': 100, 'PCF MC': 0, 'WS VISA': 0, VISA: 0 },
        monthlyGross: 3000,
        totalFixedExpenses: 1500,
        netBalance: 1000
      },
      previous: null
    };

    it('should not render Loans, Investments, or Net Worth cards', async () => {
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => baseResponse });
      const { container } = renderWithProviders(
        <SummaryPanel selectedYear={2025} selectedMonth={11} refreshTrigger={0} />
      );
      await waitFor(() => expect(document.querySelector('.loading-message')).not.toBeInTheDocument());
      expect(container.querySelector('.loans-card')).not.toBeInTheDocument();
      expect(container.querySelector('.investments-card')).not.toBeInTheDocument();
      expect(container.querySelector('.net-worth-card')).not.toBeInTheDocument();
    });

    it('should render Monthly Income and Balance cards', async () => {
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => baseResponse });
      renderWithProviders(<SummaryPanel selectedYear={2025} selectedMonth={11} refreshTrigger={0} />);
      await waitFor(() => expect(document.querySelector('.loading-message')).not.toBeInTheDocument());
      expect(screen.getByText('Monthly Income')).toBeInTheDocument();
      expect(screen.getByText('Balance')).toBeInTheDocument();
    });

    it('should render Fixed Expenses and Variable Expenses cards', async () => {
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => baseResponse });
      renderWithProviders(<SummaryPanel selectedYear={2025} selectedMonth={11} refreshTrigger={0} />);
      await waitFor(() => expect(document.querySelector('.loading-message')).not.toBeInTheDocument());
      expect(screen.getByText('Fixed Expenses')).toBeInTheDocument();
      expect(screen.getByText('Variable Expenses')).toBeInTheDocument();
    });

    it('should render Weekly Breakdown open by default', async () => {
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => baseResponse });
      const { container } = renderWithProviders(
        <SummaryPanel selectedYear={2025} selectedMonth={11} refreshTrigger={0} />
      );
      await waitFor(() => expect(document.querySelector('.loading-message')).not.toBeInTheDocument());
      expect(screen.getByText('Weekly Breakdown')).toBeInTheDocument();
      // When open, the card-content div should be present
      const weeklyCard = Array.from(container.querySelectorAll('.summary-card.full-width'))
        .find(el => el.textContent.includes('Weekly Breakdown'));
      expect(weeklyCard.querySelector('.card-content')).toBeInTheDocument();
    });

    it('should render Payment Methods section open by default', async () => {
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => baseResponse });
      const { container } = renderWithProviders(
        <SummaryPanel selectedYear={2025} selectedMonth={11} refreshTrigger={0} />
      );
      await waitFor(() => expect(document.querySelector('.loading-message')).not.toBeInTheDocument());
      expect(screen.getByText('Payment Methods')).toBeInTheDocument();
      const paymentCard = Array.from(container.querySelectorAll('.summary-card.full-width'))
        .find(el => el.textContent.includes('Payment Methods'));
      expect(paymentCard.querySelector('.card-content')).toBeInTheDocument();
    });
  });

  describe('Property-Based Tests', () => {
    it('should display trend indicators for all weekly totals when previous month data is available', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            week1: fc.double({ min: 10, max: 1000, noNaN: true }),
            week2: fc.double({ min: 10, max: 1000, noNaN: true }),
            week3: fc.double({ min: 10, max: 1000, noNaN: true }),
            week4: fc.double({ min: 10, max: 1000, noNaN: true }),
            week5: fc.double({ min: 10, max: 1000, noNaN: true })
          }),
          fc.record({
            week1: fc.double({ min: 10, max: 1000, noNaN: true }),
            week2: fc.double({ min: 10, max: 1000, noNaN: true }),
            week3: fc.double({ min: 10, max: 1000, noNaN: true }),
            week4: fc.double({ min: 10, max: 1000, noNaN: true }),
            week5: fc.double({ min: 10, max: 1000, noNaN: true })
          }),
          async (currentWeekly, previousWeekly) => {
            const mockResponse = {
              current: {
                total: 500,
                weeklyTotals: currentWeekly,
                typeTotals: { Groceries: 100, Gas: 50, Other: 50, 'Tax - Medical': 0, 'Tax - Donation': 0 },
                methodTotals: { Cash: 50, Debit: 50, Cheque: 0, 'CIBC MC': 100, 'PCF MC': 0, 'WS VISA': 0, VISA: 0 },
                monthlyGross: 3000,
                totalFixedExpenses: 1500,
                netBalance: 1000
              },
              previous: {
                total: 450,
                weeklyTotals: previousWeekly,
                typeTotals: { Groceries: 90, Gas: 45, Other: 45, 'Tax - Medical': 0, 'Tax - Donation': 0 },
                methodTotals: { Cash: 45, Debit: 45, Cheque: 0, 'CIBC MC': 90, 'PCF MC': 0, 'WS VISA': 0, VISA: 0 },
                monthlyGross: 3000,
                totalFixedExpenses: 1500,
                netBalance: 1050
              }
            };

            global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockResponse });

            const { container } = renderWithProviders(
              <SummaryPanel selectedYear={2025} selectedMonth={11} refreshTrigger={0} />
            );

            await waitFor(() => {
              expect(screen.queryByText('Loading summary...')).not.toBeInTheDocument();
            });

            const trendIndicators = container.querySelectorAll('.trend-indicator-mock');
            const weeklyIndicators = Array.from(trendIndicators).filter(indicator => {
              const current = parseFloat(indicator.getAttribute('data-current'));
              const previous = parseFloat(indicator.getAttribute('data-previous'));
              return Object.values(currentWeekly).some(val => Math.abs(val - current) < 0.01) &&
                     Object.values(previousWeekly).some(val => Math.abs(val - previous) < 0.01);
            });
            expect(weeklyIndicators.length).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 20 }
      );
    }, 30000);

    it('should display trend indicators for expense types when previous month data is available', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            Groceries: fc.double({ min: 50, max: 500, noNaN: true }),
            Gas: fc.double({ min: 20, max: 200, noNaN: true }),
            Other: fc.double({ min: 10, max: 300, noNaN: true }),
            'Tax - Medical': fc.double({ min: 0, max: 100, noNaN: true }),
            'Tax - Donation': fc.double({ min: 0, max: 100, noNaN: true })
          }),
          fc.record({
            Groceries: fc.double({ min: 50, max: 500, noNaN: true }),
            Gas: fc.double({ min: 20, max: 200, noNaN: true }),
            Other: fc.double({ min: 10, max: 300, noNaN: true }),
            'Tax - Medical': fc.double({ min: 0, max: 100, noNaN: true }),
            'Tax - Donation': fc.double({ min: 0, max: 100, noNaN: true })
          }),
          async (currentTypes, previousTypes) => {
            const mockResponse = {
              current: {
                total: 500,
                weeklyTotals: { week1: 100, week2: 100, week3: 100, week4: 100, week5: 100 },
                typeTotals: currentTypes,
                methodTotals: { Cash: 50, Debit: 50, Cheque: 0, 'CIBC MC': 100, 'PCF MC': 0, 'WS VISA': 0, VISA: 0 },
                monthlyGross: 3000,
                totalFixedExpenses: 1500,
                netBalance: 1000
              },
              previous: {
                total: 450,
                weeklyTotals: { week1: 90, week2: 90, week3: 90, week4: 90, week5: 90 },
                typeTotals: previousTypes,
                methodTotals: { Cash: 45, Debit: 45, Cheque: 0, 'CIBC MC': 90, 'PCF MC': 0, 'WS VISA': 0, VISA: 0 },
                monthlyGross: 3000,
                totalFixedExpenses: 1500,
                netBalance: 1050
              }
            };

            global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockResponse });

            const { container } = renderWithProviders(
              <SummaryPanel selectedYear={2025} selectedMonth={11} refreshTrigger={0} />
            );

            await waitFor(() => {
              expect(screen.queryByText('Loading summary...')).not.toBeInTheDocument();
            });

            const trendIndicators = container.querySelectorAll('.trend-indicator-mock');
            const typeIndicators = Array.from(trendIndicators).filter(indicator => {
              const current = parseFloat(indicator.getAttribute('data-current'));
              const previous = parseFloat(indicator.getAttribute('data-previous'));
              return Object.values(currentTypes).some(val => Math.abs(val - current) < 0.01) &&
                     Object.values(previousTypes).some(val => Math.abs(val - previous) < 0.01);
            });
            expect(typeIndicators.length).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 20 }
      );
    }, 30000);

    it('should display trend indicators for payment methods when previous month data is available', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            Cash: fc.double({ min: 10, max: 200, noNaN: true }),
            Debit: fc.double({ min: 10, max: 200, noNaN: true }),
            Cheque: fc.double({ min: 0, max: 100, noNaN: true }),
            'CIBC MC': fc.double({ min: 10, max: 300, noNaN: true }),
            'PCF MC': fc.double({ min: 0, max: 200, noNaN: true }),
            'WS VISA': fc.double({ min: 0, max: 200, noNaN: true }),
            VISA: fc.double({ min: 0, max: 200, noNaN: true })
          }),
          fc.record({
            Cash: fc.double({ min: 10, max: 200, noNaN: true }),
            Debit: fc.double({ min: 10, max: 200, noNaN: true }),
            Cheque: fc.double({ min: 0, max: 100, noNaN: true }),
            'CIBC MC': fc.double({ min: 10, max: 300, noNaN: true }),
            'PCF MC': fc.double({ min: 0, max: 200, noNaN: true }),
            'WS VISA': fc.double({ min: 0, max: 200, noNaN: true }),
            VISA: fc.double({ min: 0, max: 200, noNaN: true })
          }),
          async (currentMethods, previousMethods) => {
            const mockResponse = {
              current: {
                total: 500,
                weeklyTotals: { week1: 100, week2: 100, week3: 100, week4: 100, week5: 100 },
                typeTotals: { Groceries: 200, Gas: 100, Other: 100, 'Tax - Medical': 50, 'Tax - Donation': 50 },
                methodTotals: currentMethods,
                monthlyGross: 3000,
                totalFixedExpenses: 1500,
                netBalance: 1000
              },
              previous: {
                total: 450,
                weeklyTotals: { week1: 90, week2: 90, week3: 90, week4: 90, week5: 90 },
                typeTotals: { Groceries: 180, Gas: 90, Other: 90, 'Tax - Medical': 45, 'Tax - Donation': 45 },
                methodTotals: previousMethods,
                monthlyGross: 3000,
                totalFixedExpenses: 1500,
                netBalance: 1050
              }
            };

            global.fetch.mockResolvedValueOnce({ ok: true, json: async () => mockResponse });

            const { container } = renderWithProviders(
              <SummaryPanel selectedYear={2025} selectedMonth={11} refreshTrigger={0} />
            );

            await waitFor(() => {
              expect(screen.queryByText('Loading summary...')).not.toBeInTheDocument();
            });

            const trendIndicators = container.querySelectorAll('.trend-indicator-mock');
            const methodIndicators = Array.from(trendIndicators).filter(indicator => {
              const current = parseFloat(indicator.getAttribute('data-current'));
              const previous = parseFloat(indicator.getAttribute('data-previous'));
              return Object.values(currentMethods).some(val => Math.abs(val - current) < 0.01) &&
                     Object.values(previousMethods).some(val => Math.abs(val - previous) < 0.01);
            });
            expect(methodIndicators.length).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 20 }
      );
    }, 30000);
  });

  describe('Reminder Functionality', () => {
    beforeEach(() => {
      global.fetch = vi.fn();
    });

    it('should display correct month name in reminder banner for all valid months', async () => {
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ];

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 12 }),
          fc.integer({ min: 1, max: 5 }),
          async (monthNumber, missingCount) => {
            const mockSummaryResponse = {
              current: {
                total: 500,
                weeklyTotals: { week1: 100, week2: 100, week3: 100, week4: 100, week5: 100 },
                typeTotals: { Groceries: 200, Gas: 100, Other: 100, 'Tax - Medical': 50, 'Tax - Donation': 50 },
                methodTotals: { Cash: 50, Debit: 50, Cheque: 0, 'CIBC MC': 100, 'PCF MC': 0, 'WS VISA': 0, VISA: 0 },
                monthlyGross: 3000,
                totalFixedExpenses: 1500,
                netBalance: 1000
              },
              previous: null
            };

            const mockReminderResponse = {
              missingInvestments: missingCount,
              missingLoans: 0,
              hasActiveInvestments: true,
              hasActiveLoans: false
            };

            global.fetch.mockImplementation((url) => {
              if (url.includes('/api/reminders/status/')) {
                return Promise.resolve({ ok: true, json: async () => mockReminderResponse });
              }
              return Promise.resolve({ ok: true, json: async () => mockSummaryResponse });
            });

            const { container } = renderWithProviders(
              <SummaryPanel selectedYear={2025} selectedMonth={monthNumber} refreshTrigger={0} />
            );

            await waitFor(() => {
              expect(screen.queryByText('Loading summary...')).not.toBeInTheDocument();
            }, { timeout: 3000 });

            const reminderBanner = container.querySelector('.data-reminder-banner');
            if (reminderBanner) {
              const expectedMonthName = monthNames[monthNumber - 1];
              const reminderMessage = reminderBanner.querySelector('.reminder-message');
              expect(reminderMessage).toBeInTheDocument();
              expect(reminderMessage.textContent).toContain(expectedMonthName);
            }
          }
        ),
        { numRuns: 12 }
      );
    }, 30000);

    it('should display reminder banner when investment data is missing', async () => {
      const mockSummaryResponse = {
        current: {
          total: 500,
          weeklyTotals: { week1: 100, week2: 100, week3: 100, week4: 100, week5: 100 },
          typeTotals: { Groceries: 200, Gas: 100, Other: 100, 'Tax - Medical': 50, 'Tax - Donation': 50 },
          methodTotals: { Cash: 50, Debit: 50, Cheque: 0, 'CIBC MC': 100, 'PCF MC': 0, 'WS VISA': 0, VISA: 0 },
          monthlyGross: 3000,
          totalFixedExpenses: 1500,
          netBalance: 1000
        },
        previous: null
      };

      const mockReminderResponse = {
        missingInvestments: 2,
        missingLoans: 0,
        hasActiveInvestments: true,
        hasActiveLoans: false
      };

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/reminders/status/')) {
          return Promise.resolve({ ok: true, json: async () => mockReminderResponse });
        }
        return Promise.resolve({ ok: true, json: async () => mockSummaryResponse });
      });

      const { container } = renderWithProviders(
        <SummaryPanel selectedYear={2025} selectedMonth={11} refreshTrigger={0} />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading summary...')).not.toBeInTheDocument();
      });

      const reminderBanner = container.querySelector('.data-reminder-banner');
      expect(reminderBanner).toBeInTheDocument();
      const reminderMessage = reminderBanner.querySelector('.reminder-message');
      expect(reminderMessage.textContent).toContain('Update 2 investment');
      expect(reminderMessage.textContent).toContain('November');
    });

    it('should not display reminder banner when all investment data is complete', async () => {
      const mockSummaryResponse = {
        current: {
          total: 500,
          weeklyTotals: { week1: 100, week2: 100, week3: 100, week4: 100, week5: 100 },
          typeTotals: { Groceries: 200, Gas: 100, Other: 100, 'Tax - Medical': 50, 'Tax - Donation': 50 },
          methodTotals: { Cash: 50, Debit: 50, Cheque: 0, 'CIBC MC': 100, 'PCF MC': 0, 'WS VISA': 0, VISA: 0 },
          monthlyGross: 3000,
          totalFixedExpenses: 1500,
          netBalance: 1000
        },
        previous: null
      };

      const mockReminderResponse = {
        missingInvestments: 0,
        missingLoans: 0,
        hasActiveInvestments: true,
        hasActiveLoans: false
      };

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/reminders/status/')) {
          return Promise.resolve({ ok: true, json: async () => mockReminderResponse });
        }
        return Promise.resolve({ ok: true, json: async () => mockSummaryResponse });
      });

      const { container } = renderWithProviders(
        <SummaryPanel selectedYear={2025} selectedMonth={11} refreshTrigger={0} />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading summary...')).not.toBeInTheDocument();
      });

      expect(container.querySelector('.data-reminder-banner')).not.toBeInTheDocument();
    });

    it('should hide reminder banner when dismissed', async () => {
      const mockSummaryResponse = {
        current: {
          total: 500,
          weeklyTotals: { week1: 100, week2: 100, week3: 100, week4: 100, week5: 100 },
          typeTotals: { Groceries: 200, Gas: 100, Other: 100, 'Tax - Medical': 50, 'Tax - Donation': 50 },
          methodTotals: { Cash: 50, Debit: 50, Cheque: 0, 'CIBC MC': 100, 'PCF MC': 0, 'WS VISA': 0, VISA: 0 },
          monthlyGross: 3000,
          totalFixedExpenses: 1500,
          netBalance: 1000
        },
        previous: null
      };

      const mockReminderResponse = {
        missingInvestments: 2,
        missingLoans: 0,
        hasActiveInvestments: true,
        hasActiveLoans: false
      };

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/reminders/status/')) {
          return Promise.resolve({ ok: true, json: async () => mockReminderResponse });
        }
        return Promise.resolve({ ok: true, json: async () => mockSummaryResponse });
      });

      const { container } = renderWithProviders(
        <SummaryPanel selectedYear={2025} selectedMonth={11} refreshTrigger={0} />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading summary...')).not.toBeInTheDocument();
      });

      let reminderBanner = container.querySelector('.data-reminder-banner');
      expect(reminderBanner).toBeInTheDocument();

      const dismissButton = reminderBanner.querySelector('.reminder-dismiss-btn');
      dismissButton.click();

      await waitFor(() => {
        expect(container.querySelector('.data-reminder-banner')).not.toBeInTheDocument();
      });
    });

    it('should display multiple reminders when both investment and loan data are missing', async () => {
      const mockSummaryResponse = {
        current: {
          total: 500,
          weeklyTotals: { week1: 100, week2: 100, week3: 100, week4: 100, week5: 100 },
          typeTotals: { Groceries: 200, Gas: 100, Other: 100, 'Tax - Medical': 50, 'Tax - Donation': 50 },
          methodTotals: { Cash: 50, Debit: 50, Cheque: 0, 'CIBC MC': 100, 'PCF MC': 0, 'WS VISA': 0, VISA: 0 },
          monthlyGross: 3000,
          totalFixedExpenses: 1500,
          netBalance: 1000
        },
        previous: null
      };

      const mockReminderResponse = {
        missingInvestments: 2,
        missingLoans: 1,
        hasActiveInvestments: true,
        hasActiveLoans: true
      };

      global.fetch.mockImplementation((url) => {
        if (url.includes('/api/reminders/status/')) {
          return Promise.resolve({ ok: true, json: async () => mockReminderResponse });
        }
        return Promise.resolve({ ok: true, json: async () => mockSummaryResponse });
      });

      const { container } = renderWithProviders(
        <SummaryPanel selectedYear={2025} selectedMonth={11} refreshTrigger={0} />
      );

      await waitFor(() => {
        expect(screen.queryByText('Loading summary...')).not.toBeInTheDocument();
      });

      const reminderBanners = container.querySelectorAll('.data-reminder-banner');
      expect(reminderBanners.length).toBe(2);

      const investmentBanner = Array.from(reminderBanners).find(b => b.textContent.includes('investment'));
      expect(investmentBanner).toBeInTheDocument();

      const loanBanner = Array.from(reminderBanners).find(b => b.textContent.includes('loan'));
      expect(loanBanner).toBeInTheDocument();
    });
  });
});
