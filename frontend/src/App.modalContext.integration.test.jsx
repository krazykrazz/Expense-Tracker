import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

/**
 * Integration tests for App.jsx with ModalContext
 * Validates that modal state from ModalProvider flows correctly to child components
 * and that modal open/close handlers work through the context.
 * 
 * **Validates: Requirements 7.1, 7.3, 7.4**
 */

describe('App.jsx ModalContext Integration', () => {
  let mockFetch;

  // Generate enough expenses to show FloatingAddButton (needs > 10)
  const mockExpenses = Array.from({ length: 15 }, (_, i) => ({
    id: i + 1,
    date: '2024-03-15',
    place: `Store ${i + 1}`,
    notes: `Notes ${i + 1}`,
    amount: 50 + i,
    type: 'Groceries',
    method: 'Debit',
    week: 3
  }));

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
            totalExpenses: 90, weeklyTotals: {}, monthlyGross: 3000,
            remaining: 2910, typeTotals: {}, methodTotals: {}
          })
        });
      }
      if (url.includes('/api/budgets/summary')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ totalBudget: 0, totalSpent: 0 }) });
      }
      if (url.includes('/api/budgets')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ budgets: [] }) });
      }
      if (url.includes('/api/fixed-expenses')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/api/income')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ sources: [], total: 0 }) });
      }
      if (url.includes('/api/loans')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      }
      if (url.includes('/api/expenses')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockExpenses) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });
  });

  /**
   * Test: Header settings button opens backup settings modal through context
   * Validates: Requirement 7.4
   */
  it('should open backup settings modal when header settings button is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /expense tracker/i })).toBeInTheDocument();
    });

    // Click settings button in header (has aria-label="Settings")
    const settingsButton = screen.getByRole('button', { name: /settings/i });
    await user.click(settingsButton);

    // Backup settings modal should be visible (heading is "⚙️ Settings")
    await waitFor(() => {
      // Look for the settings heading inside the modal
      const settingsHeadings = screen.getAllByRole('heading', { level: 2 });
      const settingsModalHeading = settingsHeadings.find(h => h.textContent.includes('Settings'));
      expect(settingsModalHeading).toBeInTheDocument();
    });
  });

  /**
   * Test: Modal overlay click-to-close works through context
   * Validates: Requirement 7.1
   */
  it('should close backup settings modal when overlay is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /expense tracker/i })).toBeInTheDocument();
    });

    // Open settings modal
    const settingsButton = screen.getByRole('button', { name: /settings/i });
    await user.click(settingsButton);

    await waitFor(() => {
      const settingsHeadings = screen.getAllByRole('heading', { level: 2 });
      const settingsModalHeading = settingsHeadings.find(h => h.textContent.includes('Settings'));
      expect(settingsModalHeading).toBeInTheDocument();
    });

    // Click the modal overlay (not the content) - SettingsModal uses settings-modal-overlay class
    const overlay = document.querySelector('.settings-modal-overlay');
    await user.click(overlay);

    // Modal should be closed - settings heading should not be present
    await waitFor(() => {
      const settingsHeadings = screen.queryAllByRole('heading', { level: 2 });
      const settingsModalHeading = settingsHeadings.find(h => h.textContent.includes('⚙️ Settings'));
      expect(settingsModalHeading).toBeUndefined();
    });
  });

  /**
   * Test: FloatingAddButton opens expense form through context
   * Validates: Requirement 7.3
   */
  it('should open expense form modal when FloatingAddButton is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /expense tracker/i })).toBeInTheDocument();
    });

    // Wait for expenses to load (FloatingAddButton shows when expenseCount > 10)
    await waitFor(() => {
      const floatingButton = document.querySelector('.floating-add-button');
      expect(floatingButton).toBeInTheDocument();
    });

    // Click the floating add button (use class selector to be specific)
    const floatingButton = document.querySelector('.floating-add-button');
    await user.click(floatingButton);

    // Expense form modal should be visible - check for modal overlay with expense form
    await waitFor(() => {
      const modalOverlay = document.querySelector('.modal-overlay');
      expect(modalOverlay).toBeInTheDocument();
      // Check that the expense form is inside the modal
      const expenseForm = document.querySelector('.expense-form');
      expect(expenseForm).toBeInTheDocument();
    });
  });

  /**
   * Test: MonthSelector button callbacks open modals through context
   * Validates: Requirement 7.1
   */
  it('should open annual summary modal from MonthSelector', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /expense tracker/i })).toBeInTheDocument();
    });

    // Click annual summary button in MonthSelector (use class selector)
    const annualButton = document.querySelector('.annual-summary-button');
    await user.click(annualButton);

    // Annual summary modal should be visible - check for the modal heading with year
    await waitFor(() => {
      const headings = screen.getAllByRole('heading', { level: 2 });
      const annualHeading = headings.find(h => h.textContent.includes('Annual Summary') && h.textContent.includes('2026'));
      expect(annualHeading).toBeInTheDocument();
    });
  });

  /**
   * Test: navigateToExpenseList event closes overlay modals
   * Validates: Requirement 7.4
   */
  it('should close overlay modals when navigateToExpenseList event is dispatched', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /expense tracker/i })).toBeInTheDocument();
    });

    // Open backup settings modal (an overlay modal)
    const settingsButton = screen.getByRole('button', { name: /settings/i });
    await user.click(settingsButton);

    await waitFor(() => {
      const settingsHeadings = screen.getAllByRole('heading', { level: 2 });
      const settingsModalHeading = settingsHeadings.find(h => h.textContent.includes('Settings'));
      expect(settingsModalHeading).toBeInTheDocument();
    });

    // Dispatch navigateToExpenseList event
    fireEvent(window, new CustomEvent('navigateToExpenseList', {
      detail: { categoryFilter: 'Groceries' }
    }));

    // Backup settings modal should be closed
    await waitFor(() => {
      const settingsHeadings = screen.queryAllByRole('heading', { level: 2 });
      const settingsModalHeading = settingsHeadings.find(h => h.textContent.includes('⚙️ Settings'));
      expect(settingsModalHeading).not.toBeDefined();
    });
  });

  /**
   * Test: Modal close button works through context
   * Validates: Requirement 7.1
   */
  it('should close modal when close button is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /expense tracker/i })).toBeInTheDocument();
    });

    // Open settings modal
    const settingsButton = screen.getByRole('button', { name: /settings/i });
    await user.click(settingsButton);

    await waitFor(() => {
      const settingsHeadings = screen.getAllByRole('heading', { level: 2 });
      const settingsModalHeading = settingsHeadings.find(h => h.textContent.includes('Settings'));
      expect(settingsModalHeading).toBeInTheDocument();
    });

    // Click the close button (SettingsModal uses settings-modal-close class)
    const closeButton = document.querySelector('.settings-modal-close');
    await user.click(closeButton);

    // Modal should be closed
    await waitFor(() => {
      const settingsHeadings = screen.queryAllByRole('heading', { level: 2 });
      const settingsModalHeading = settingsHeadings.find(h => h.textContent.includes('⚙️ Settings'));
      expect(settingsModalHeading).toBeUndefined();
    });
  });
});
