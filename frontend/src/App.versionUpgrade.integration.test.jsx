import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

/**
 * Integration tests for version upgrade modal in App.jsx.
 * **Validates: Requirements 7.4, 7.6, 7.8**
 */

// Mock logger to suppress output
vi.mock('./utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('App - Version Upgrade Modal Integration', () => {
  let mockFetch;

  const buildFetchMock = (version = '2.0.0') => {
    return vi.fn((url) => {
      if (url.includes('/api/version')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version }),
        });
      }
      if (url.includes('/api/payment-methods')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              paymentMethods: [
                { id: 1, display_name: 'Debit', type: 'debit', is_active: 1 },
              ],
            }),
        });
      }
      if (url.includes('/api/people')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/api/budgets/summary')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ totalBudget: 0, totalSpent: 0 }),
        });
      }
      if (url.includes('/api/budgets')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/api/summary')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              totalExpenses: 0,
              weeklyTotals: {},
              monthlyGross: 0,
              remaining: 0,
              typeTotals: {},
              methodTotals: {},
            }),
        });
      }
      if (url.includes('/api/expenses')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/api/income')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/api/fixed-expenses')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/api/loans')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/api/categories')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ categories: [] }),
        });
      }
      // Default fallback
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  /**
   * Validates: Requirement 7.4
   * Modal appears automatically on first page load after an upgrade.
   */
  it('should show upgrade modal when version differs from last seen', async () => {
    localStorage.setItem('last_seen_version', '1.0.0');
    mockFetch = buildFetchMock('2.0.0');
    global.fetch = mockFetch;

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /version 2\.0\.0 upgrade details/i })
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/Updated to v2\.0\.0/i)).toBeInTheDocument();
  });

  /**
   * Validates: Requirement 7.8
   * First-time users (no localStorage) should NOT see the modal.
   */
  it('should not show upgrade modal for first-time users', async () => {
    // No localStorage entry at all
    mockFetch = buildFetchMock('2.0.0');
    global.fetch = mockFetch;

    render(<App />);

    // Wait for the version fetch to complete
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/version')
      );
    });

    // Modal should NOT appear
    expect(
      screen.queryByRole('dialog', { name: /upgrade details/i })
    ).not.toBeInTheDocument();

    // localStorage should be initialized with the current version
    expect(localStorage.getItem('last_seen_version')).toBe('2.0.0');
  });

  /**
   * Validates: Requirement 7.6
   * After closing the modal, refreshing should NOT show it again.
   */
  it('should not show upgrade modal after user acknowledges it', async () => {
    const user = userEvent.setup();
    localStorage.setItem('last_seen_version', '1.0.0');
    mockFetch = buildFetchMock('2.0.0');
    global.fetch = mockFetch;

    const { unmount } = render(<App />);

    // Wait for modal to appear
    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /version 2\.0\.0 upgrade details/i })
      ).toBeInTheDocument();
    });

    // Close the modal
    const closeButton = screen.getByLabelText(/close upgrade notification/i);
    await user.click(closeButton);

    // Modal should be gone
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /upgrade details/i })
      ).not.toBeInTheDocument();
    });

    // localStorage should be updated
    expect(localStorage.getItem('last_seen_version')).toBe('2.0.0');

    // Simulate page refresh by unmounting and re-rendering
    unmount();
    render(<App />);

    // Wait for version fetch again
    await waitFor(() => {
      const versionCalls = mockFetch.mock.calls.filter((c) =>
        c[0].includes('/api/version')
      );
      expect(versionCalls.length).toBeGreaterThanOrEqual(2);
    });

    // Modal should NOT appear on second render
    expect(
      screen.queryByRole('dialog', { name: /upgrade details/i })
    ).not.toBeInTheDocument();
  });
});
