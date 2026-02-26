import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./utils/fetchProvider', () => ({
  getFetchFn: () => (...args) => globalThis.fetch(...args),
  authAwareFetch: (...args) => globalThis.fetch(...args),
  getNativeFetch: () => globalThis.fetch,
  setFetchFn: vi.fn(),
}));

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

/**
 * Integration tests for App.jsx with FilterContext
 * Validates that filter state from FilterProvider flows correctly to child components
 * and that global view mode triggers work through the context.
 * 
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.8**
 */

describe('App.jsx FilterContext Integration', () => {
  let mockFetch;

  const mockExpenses = [
    { id: 1, date: '2024-03-15', place: 'Walmart', notes: 'Groceries', amount: 50, type: 'Groceries', method: 'Debit', week: 3 },
    { id: 2, date: '2024-03-20', place: 'Shell', notes: 'Gas fill', amount: 40, type: 'Gas', method: 'Cash', week: 3 },
    { id: 3, date: '2024-04-10', place: 'Amazon', notes: 'Books', amount: 30, type: 'Entertainment', method: 'Debit', week: 2 },
  ];

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    mockFetch.mockImplementation((url) => {
      if (url.includes('/api/version')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ version: '5.6.0' }) });
      }
      if (url.includes('/api/payment-methods')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            paymentMethods: [
              { id: 1, display_name: 'Debit', type: 'debit', is_active: 1 },
              { id: 2, display_name: 'Cash', type: 'cash', is_active: 1 },
            ]
          })
        });
      }
      if (url.includes('/api/people')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/api/summary')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            totalExpenses: 120, weeklyTotals: {}, monthlyGross: 3000,
            remaining: 2880, typeTotals: {}, methodTotals: {}
          })
        });
      }
      if (url.includes('/api/budgets/summary')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ totalBudget: 0, totalSpent: 0 }) });
      }
      if (url.includes('/api/budgets')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/api/fixed-expenses')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/api/income')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/api/loans')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/api/expenses')) {
        if (url.includes('year=') && url.includes('month=')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockExpenses.slice(0, 2)) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockExpenses) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
  });

  /**
   * Test: Filter state from context flows to SearchBar child component
   * Validates: Requirements 5.1, 5.2
   */
  it('should flow filter state from FilterContext to SearchBar', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /expense tracker/i })).toBeInTheDocument();
    });

    // Type in search - this goes through context's handleSearchChange
    const searchInput = screen.getByPlaceholderText(/search by place or notes/i);
    await user.type(searchInput, 'Walmart');

    // Verify the search value is reflected (state flowed through context)
    await waitFor(() => {
      expect(searchInput.value).toBe('Walmart');
    }, { timeout: 1000 });
  });

  /**
   * Test: Global view triggers correctly through context
   * Validates: Requirements 5.5, 5.6
   */
  it('should trigger global view through context when payment method filter is set', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /expense tracker/i })).toBeInTheDocument();
    });

    // Initially in monthly view
    expect(screen.getByText(/monthly view/i)).toBeInTheDocument();

    // Apply payment method filter through SearchBar (flows through context)
    const paymentFilter = screen.getByLabelText(/filter by payment method/i);
    await user.selectOptions(paymentFilter, 'Debit');

    // Should switch to global view via context's isGlobalView
    await waitFor(() => {
      expect(screen.getByText(/global view/i)).toBeInTheDocument();
      // Verify trigger list shows Payment Method
      expect(screen.getByText('Payment Method', { selector: '.trigger-list' })).toBeInTheDocument();
    });
  });

  /**
   * Test: Return to monthly view clears global-triggering filters via context
   * Validates: Requirements 5.3, 5.8
   */
  it('should return to monthly view when handleReturnToMonthlyView is called from context', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /expense tracker/i })).toBeInTheDocument();
    });

    // Trigger global view with payment method filter
    const paymentFilter = screen.getByLabelText(/filter by payment method/i);
    await user.selectOptions(paymentFilter, 'Debit');

    await waitFor(() => {
      expect(screen.getByText(/global view/i)).toBeInTheDocument();
    });

    // Click return to monthly view (uses context's handleReturnToMonthlyView)
    // The button has aria-label="Return to monthly view" (exact match, not the clear-all button)
    const returnButton = screen.getByRole('button', { name: 'Return to monthly view' });
    await user.click(returnButton);

    // Should be back in monthly view (context's filterMethod was cleared, so isGlobalView is false)
    await waitFor(() => {
      const monthlyBadge = screen.getByText(/monthly view/i);
      expect(monthlyBadge).toBeInTheDocument();
    });

    // Global view banner should be gone (proves context state was cleared)
    expect(screen.queryByText(/global view/i)).not.toBeInTheDocument();
  });

  /**
   * Test: Category filter DOES trigger global view (context logic)
   * Validates: Requirements 5.4
   */
  it('should trigger global view when category filter is active', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /expense tracker/i })).toBeInTheDocument();
    });

    // Apply only category filter
    const categoryFilter = screen.getByLabelText(/filter by expense category/i);
    await user.selectOptions(categoryFilter, 'Groceries');

    // Should trigger global view (category is a global filter)
    await waitFor(() => {
      expect(screen.getByText(/global view/i)).toBeInTheDocument();
      expect(screen.getByText('Category')).toBeInTheDocument();
    });
  });

  /**
   * Test: Insurance filter triggers global view (for notification click-through)
   * Validates: Requirements 5.4
   */
  it('should trigger global view when insurance filter is active', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /expense tracker/i })).toBeInTheDocument();
    });

    // Simulate insurance notification click-through event
    const event = new CustomEvent('filterByInsuranceStatus', {
      detail: { insuranceFilter: 'Not Claimed' }
    });
    window.dispatchEvent(event);

    // Should trigger global view (insurance filter is a global filter)
    await waitFor(() => {
      expect(screen.getByText(/global view/i)).toBeInTheDocument();
      expect(screen.getByText('Insurance Status')).toBeInTheDocument();
    });
  });
});
