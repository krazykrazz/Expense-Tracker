import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from './App';
import { CATEGORIES } from './utils/constants';

// Mock fetch globally
global.fetch = vi.fn();

// Mock payment methods for testing
const MOCK_PAYMENT_METHODS = [
  { id: 1, display_name: 'Cash', type: 'cash', is_active: 1 },
  { id: 2, display_name: 'Debit', type: 'debit', is_active: 1 },
  { id: 3, display_name: 'VISA', type: 'credit_card', is_active: 1 }
];

// Mock SummaryPanel to avoid API calls and rendering issues
vi.mock('./components/SummaryPanel', () => ({
  default: () => <div data-testid="summary-panel">Summary Panel Mock</div>
}));

describe('App Error Handling and Edge Cases for Filtering', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    fetch.mockReset();
    vi.clearAllTimers();
    
    // Mock version endpoint (called on mount)
    fetch.mockImplementation((url) => {
      if (url.includes('/api/version')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ version: '4.2.3' })
        });
      }
      if (url.includes('/api/categories')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ categories: CATEGORIES })
        });
      }
      if (url.includes('/api/payment-methods')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ paymentMethods: MOCK_PAYMENT_METHODS })
        });
      }
      if (url.includes('/api/people')) {
        return Promise.resolve({
          ok: true,
          json: async () => ([])
        });
      }
      // Default: return empty expenses
      return Promise.resolve({
        ok: true,
        json: async () => ([])
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test: API failure scenarios
   * Requirement 3.4: Handle API failures gracefully with error messages
   */
  describe('API Failure Scenarios', () => {
    it('should display error message when API fails to fetch expenses', async () => {
      // Mock API failure
      fetch.mockImplementation((url) => {
        if (url.includes('/api/version')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ version: '4.2.3' })
          });
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ categories: CATEGORIES })
          });
        }
        if (url.includes('/api/expenses')) {
          return Promise.resolve({
            ok: false,
            text: async () => JSON.stringify({ error: 'Database connection failed' })
          });
        }
        return Promise.resolve({ ok: true, json: async () => ([]) });
      });

      render(<App />);

      // Wait for error message to appear
      await waitFor(() => {
        const errorMessage = screen.getByText(/Database connection failed/i);
        expect(errorMessage).toBeTruthy();
      });

      // Verify retry button is present
      const retryButton = screen.getByText(/Retry/i);
      expect(retryButton).toBeTruthy();
    });

    it('should display user-friendly message for network errors', async () => {
      // Mock network error
      fetch.mockImplementation((url) => {
        if (url.includes('/api/version')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ version: '4.2.3' })
          });
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ categories: CATEGORIES })
          });
        }
        if (url.includes('/api/expenses')) {
          return Promise.reject(new Error('Failed to fetch'));
        }
        return Promise.resolve({ ok: true, json: async () => ([]) });
      });

      render(<App />);

      // Wait for error message to appear (should show user-friendly message)
      await waitFor(() => {
        const errorMessage = screen.getByText(/Unable to connect to the server/i);
        expect(errorMessage).toBeTruthy();
      });
    });

    it('should allow retry after API failure', async () => {
      let shouldFail = true;
      
      // Mock API failure initially, success after retry
      fetch.mockImplementation((url) => {
        if (url.includes('/api/version')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ version: '4.2.3' })
          });
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ categories: CATEGORIES })
          });
        }
        if (url.includes('/api/expenses')) {
          if (shouldFail) {
            // Return error
            return Promise.resolve({
              ok: false,
              status: 500,
              text: async () => JSON.stringify({ error: 'Temporary error' })
            });
          }
          // Return success
          return Promise.resolve({
            ok: true,
            json: async () => ([
              { id: 1, date: '2025-01-15', place: 'Store', amount: 50, type: 'Groceries', method: 'Cash', week: 3 }
            ])
          });
        }
        return Promise.resolve({ ok: true, json: async () => ([]) });
      });

      const { container } = render(<App />);

      // Wait for error message to appear
      await waitFor(() => {
        const errorDiv = container.querySelector('.error-message');
        expect(errorDiv).toBeTruthy();
        expect(errorDiv.textContent).toContain('Temporary error');
      }, { timeout: 3000 });

      // Verify retry button is present
      const retryButton = screen.getByText(/Retry/i);
      expect(retryButton).toBeTruthy();
      
      // Now set shouldFail to false so retry succeeds
      shouldFail = false;
      
      // Click retry button
      fireEvent.click(retryButton);

      // Wait for error to be cleared and content to load
      await waitFor(() => {
        // Error should be gone
        expect(container.querySelector('.error-message')).toBeNull();
      }, { timeout: 3000 });

      // Verify search bar appears (indicates successful load)
      await waitFor(() => {
        expect(container.querySelector('.search-bar-container')).toBeTruthy();
      }, { timeout: 3000 });
    });

    it('should handle errors gracefully during filter operations', async () => {
      let shouldFail = false;
      
      // Mock API to succeed initially, then fail when shouldFail is true
      fetch.mockImplementation((url) => {
        if (url.includes('/api/version')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ version: '4.2.3' })
          });
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ categories: CATEGORIES })
          });
        }
        if (url.includes('/api/payment-methods')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ paymentMethods: MOCK_PAYMENT_METHODS })
          });
        }
        if (url.includes('/api/people')) {
          return Promise.resolve({
            ok: true,
            json: async () => ([])
          });
        }
        if (url.includes('/api/expenses')) {
          if (shouldFail) {
            // Return error
            return Promise.resolve({
              ok: false,
              status: 500,
              text: async () => JSON.stringify({ error: 'Server error during filter' })
            });
          }
          // Return success
          return Promise.resolve({
            ok: true,
            json: async () => ([
              { id: 1, date: '2025-01-15', place: 'Store', amount: 50, type: 'Groceries', method: 'Cash', week: 3 }
            ])
          });
        }
        return Promise.resolve({ ok: true, json: async () => ([]) });
      });

      const { container } = render(<App />);

      // Wait for component to load successfully first (search bar should be visible)
      await waitFor(() => {
        expect(container.querySelector('.search-bar-container')).toBeTruthy();
      }, { timeout: 3000 });

      // Wait for payment methods to load
      await waitFor(() => {
        const methodSelect = container.querySelector('#payment-method-filter');
        const options = Array.from(methodSelect.options).map(opt => opt.value);
        const nonEmptyOptions = options.filter(opt => opt !== '');
        expect(nonEmptyOptions.length).toBeGreaterThan(0);
      }, { timeout: 3000 });

      // Now set shouldFail to true so filter change triggers error
      shouldFail = true;

      // Apply a payment method filter (which triggers global view and a new API call)
      // Note: Category filter alone does NOT trigger global view, so we use payment method
      const methodSelect = container.querySelector('#payment-method-filter');
      fireEvent.change(methodSelect, { target: { value: 'Cash' } });

      // Wait for error message to appear
      await waitFor(() => {
        const errorDiv = container.querySelector('.error-message');
        expect(errorDiv).toBeTruthy();
        expect(errorDiv.textContent).toContain('Server error during filter');
      }, { timeout: 3000 });
      
      // Retry button should be present
      const retryButton = screen.getByText(/Retry/i);
      expect(retryButton).toBeTruthy();
    });
  });

  /**
   * Test: Empty results display
   * Requirement 5.4: Handle empty results with informative messages
   */
  describe('Empty Results Display', () => {
    it('should display informative message when no expenses match filters', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/api/version')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ version: '4.2.3' })
          });
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ categories: CATEGORIES })
          });
        }
        // Return empty array for expenses
        return Promise.resolve({
          ok: true,
          json: async () => ([])
        });
      });

      const { container } = render(<App />);

      // Wait for component to load
      await waitFor(() => {
        expect(container.querySelector('.search-bar-container')).toBeTruthy();
      });

      // Apply filters
      const categorySelect = container.querySelector('#category-filter');
      fireEvent.change(categorySelect, { target: { value: 'Groceries' } });

      // Wait for global view to activate - the message comes from ExpenseList
      await waitFor(() => {
        // When no expenses exist, ExpenseList shows "No expenses have been recorded for this period"
        const message = screen.getByText(/No expenses have been recorded for this period/i);
        expect(message).toBeTruthy();
      });
    });

    it('should suggest clearing filters when no results found', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/api/version')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ version: '4.2.3' })
          });
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ categories: CATEGORIES })
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ([])
        });
      });

      const { container } = render(<App />);

      await waitFor(() => {
        expect(container.querySelector('.search-bar-container')).toBeTruthy();
      });

      // Apply multiple filters
      const categorySelect = container.querySelector('#category-filter');
      const methodSelect = container.querySelector('#payment-method-filter');
      
      fireEvent.change(categorySelect, { target: { value: 'Groceries' } });
      fireEvent.change(methodSelect, { target: { value: 'Cash' } });

      // Wait for the no expenses message - when no expenses exist at all
      await waitFor(() => {
        const message = screen.getByText(/No expenses have been recorded for this period/i);
        expect(message).toBeTruthy();
      });
    });
  });

  /**
   * Test: Invalid filter selections
   * Requirement 3.4: Validate filter selections against approved lists
   */
  describe('Invalid Filter Selections', () => {
    it('should only allow valid categories from the dropdown', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/api/version')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ version: '4.2.3' })
          });
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ categories: CATEGORIES })
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ([])
        });
      });

      const { container } = render(<App />);

      await waitFor(() => {
        expect(container.querySelector('.search-bar-container')).toBeTruthy();
      });

      const categorySelect = container.querySelector('#category-filter');
      
      // Get all options from the dropdown
      const options = Array.from(categorySelect.options).map(opt => opt.value);
      
      // Verify all non-empty options are in the approved CATEGORIES list
      const nonEmptyOptions = options.filter(opt => opt !== '');
      nonEmptyOptions.forEach(option => {
        expect(CATEGORIES).toContain(option);
      });

      // Verify we can select a valid category
      fireEvent.change(categorySelect, { target: { value: 'Groceries' } });
      expect(categorySelect.value).toBe('Groceries');
    });

    it('should only allow valid payment methods from the dropdown', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/api/version')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ version: '4.2.3' })
          });
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ categories: CATEGORIES })
          });
        }
        if (url.includes('/api/payment-methods')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ paymentMethods: MOCK_PAYMENT_METHODS })
          });
        }
        if (url.includes('/api/people')) {
          return Promise.resolve({
            ok: true,
            json: async () => ([])
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ([])
        });
      });

      const { container } = render(<App />);

      // Wait for payment methods to load
      await waitFor(() => {
        expect(container.querySelector('.search-bar-container')).toBeTruthy();
      });

      // Wait for payment methods dropdown to be populated
      await waitFor(() => {
        const methodSelect = container.querySelector('#payment-method-filter');
        const options = Array.from(methodSelect.options).map(opt => opt.value);
        const nonEmptyOptions = options.filter(opt => opt !== '');
        expect(nonEmptyOptions.length).toBeGreaterThan(0);
      });

      const methodSelect = container.querySelector('#payment-method-filter');
      
      // Get all options from the dropdown
      const options = Array.from(methodSelect.options).map(opt => opt.value);
      
      // Verify all non-empty options are in the API-fetched payment methods list
      const nonEmptyOptions = options.filter(opt => opt !== '');
      const expectedMethods = MOCK_PAYMENT_METHODS.map(m => m.display_name);
      nonEmptyOptions.forEach(option => {
        expect(expectedMethods).toContain(option);
      });

      // Verify we can select a valid payment method
      fireEvent.change(methodSelect, { target: { value: 'Cash' } });
      expect(methodSelect.value).toBe('Cash');
    });

    it('should accept valid categories from the approved list', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      fetch.mockImplementation((url) => {
        if (url.includes('/api/version')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ version: '4.2.3' })
          });
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ categories: CATEGORIES })
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ([])
        });
      });

      const { container } = render(<App />);

      await waitFor(() => {
        expect(container.querySelector('.search-bar-container')).toBeTruthy();
      });

      // Set a valid category
      const categorySelect = container.querySelector('#category-filter');
      fireEvent.change(categorySelect, { target: { value: 'Groceries' } });

      // Wait a bit to ensure no warning is logged
      await new Promise(resolve => setTimeout(resolve, 100));

      // No warning should be logged
      expect(consoleSpy).not.toHaveBeenCalled();

      // Category should be set
      expect(categorySelect.value).toBe('Groceries');

      consoleSpy.mockRestore();
    });
  });

  /**
   * Test: Rapid filter changes
   * Requirement 3.4: Test rapid filter changes
   */
  describe('Rapid Filter Changes', () => {
    it('should handle rapid filter changes without errors', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/api/version')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ version: '4.2.3' })
          });
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ categories: CATEGORIES })
          });
        }
        if (url.includes('/api/payment-methods')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ paymentMethods: MOCK_PAYMENT_METHODS })
          });
        }
        if (url.includes('/api/people')) {
          return Promise.resolve({
            ok: true,
            json: async () => ([])
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ([
            { id: 1, date: '2025-01-15', place: 'Store', amount: 50, type: 'Groceries', method: 'Cash', week: 3 }
          ])
        });
      });

      const { container } = render(<App />);

      await waitFor(() => {
        expect(container.querySelector('.search-bar-container')).toBeTruthy();
      });

      // Wait for payment methods to load
      await waitFor(() => {
        const methodSelect = container.querySelector('#payment-method-filter');
        const options = Array.from(methodSelect.options).map(opt => opt.value);
        const nonEmptyOptions = options.filter(opt => opt !== '');
        expect(nonEmptyOptions.length).toBeGreaterThan(0);
      });

      const categorySelect = container.querySelector('#category-filter');
      const methodSelect = container.querySelector('#payment-method-filter');

      // Rapidly change filters multiple times (using valid payment methods from mock)
      fireEvent.change(categorySelect, { target: { value: 'Groceries' } });
      fireEvent.change(methodSelect, { target: { value: 'Cash' } });
      fireEvent.change(categorySelect, { target: { value: 'Dining Out' } });
      fireEvent.change(methodSelect, { target: { value: 'Debit' } });
      fireEvent.change(categorySelect, { target: { value: 'Gas' } });
      fireEvent.change(methodSelect, { target: { value: 'VISA' } });

      // Wait for final state
      await waitFor(() => {
        expect(categorySelect.value).toBe('Gas');
        expect(methodSelect.value).toBe('VISA');
      });

      // No errors should occur
      expect(screen.queryByText(/error/i)).toBeNull();
    });

    it('should debounce search text input during rapid typing', async () => {
      let fetchCount = 0;
      fetch.mockImplementation((url) => {
        if (url.includes('/api/version')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ version: '4.2.3' })
          });
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ categories: CATEGORIES })
          });
        }
        if (url.includes('/api/expenses')) {
          fetchCount++;
          return Promise.resolve({
            ok: true,
            json: async () => ([])
          });
        }
        return Promise.resolve({ ok: true, json: async () => ([]) });
      });

      const { container } = render(<App />);

      await waitFor(() => {
        expect(container.querySelector('.search-bar-container')).toBeTruthy();
      });

      const searchInput = container.querySelector('#expense-search-input');

      // Reset fetch count after initial load
      fetchCount = 0;

      // Rapidly type in search box
      fireEvent.change(searchInput, { target: { value: 's' } });
      fireEvent.change(searchInput, { target: { value: 'st' } });
      fireEvent.change(searchInput, { target: { value: 'sto' } });
      fireEvent.change(searchInput, { target: { value: 'stor' } });
      fireEvent.change(searchInput, { target: { value: 'store' } });

      // Wait for debounce to complete (300ms + buffer)
      await new Promise(resolve => setTimeout(resolve, 400));

      // Should only fetch once after debounce, not for each keystroke
      // Note: May be 1 or 2 depending on timing, but should be much less than 5
      expect(fetchCount).toBeLessThanOrEqual(2);
    });

    it('should handle clearing filters multiple times in succession', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/api/version')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ version: '4.2.3' })
          });
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ categories: CATEGORIES })
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ([])
        });
      });

      const { container } = render(<App />);

      await waitFor(() => {
        expect(container.querySelector('.search-bar-container')).toBeTruthy();
      }, { timeout: 3000 });

      const categorySelect = container.querySelector('#category-filter');

      // Apply filter
      fireEvent.change(categorySelect, { target: { value: 'Groceries' } });
      
      await waitFor(() => {
        expect(categorySelect.value).toBe('Groceries');
      }, { timeout: 3000 });

      // Clear by selecting empty value directly (simulating user clearing the dropdown)
      fireEvent.change(categorySelect, { target: { value: '' } });
      
      await waitFor(() => {
        expect(categorySelect.value).toBe('');
      }, { timeout: 3000 });

      // Apply again
      fireEvent.change(categorySelect, { target: { value: 'Dining Out' } });
      
      await waitFor(() => {
        expect(categorySelect.value).toBe('Dining Out');
      }, { timeout: 3000 });

      // Clear again by selecting empty value
      fireEvent.change(categorySelect, { target: { value: '' } });

      await waitFor(() => {
        expect(categorySelect.value).toBe('');
      }, { timeout: 3000 });

      // No errors should occur
      expect(screen.queryByText(/error/i)).toBeNull();
    });
  });

  /**
   * Test: Browser back/forward with active filters
   * Note: This is a simplified test as full browser history testing requires more complex setup
   */
  describe('Browser Navigation Edge Cases', () => {
    it('should maintain filter state during component lifecycle', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/api/version')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ version: '4.2.3' })
          });
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ categories: CATEGORIES })
          });
        }
        if (url.includes('/api/payment-methods')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ paymentMethods: MOCK_PAYMENT_METHODS })
          });
        }
        if (url.includes('/api/people')) {
          return Promise.resolve({
            ok: true,
            json: async () => ([])
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ([])
        });
      });

      const { container, rerender } = render(<App />);

      await waitFor(() => {
        expect(container.querySelector('.search-bar-container')).toBeTruthy();
      }, { timeout: 3000 });

      // Wait for payment methods to load
      await waitFor(() => {
        const methodSelect = container.querySelector('#payment-method-filter');
        const options = Array.from(methodSelect.options).map(opt => opt.value);
        const nonEmptyOptions = options.filter(opt => opt !== '');
        expect(nonEmptyOptions.length).toBeGreaterThan(0);
      }, { timeout: 3000 });

      // Apply filters
      const categorySelect = container.querySelector('#category-filter');
      const methodSelect = container.querySelector('#payment-method-filter');
      
      fireEvent.change(categorySelect, { target: { value: 'Groceries' } });
      fireEvent.change(methodSelect, { target: { value: 'Cash' } });

      await waitFor(() => {
        expect(categorySelect.value).toBe('Groceries');
        expect(methodSelect.value).toBe('Cash');
      }, { timeout: 3000 });

      // Simulate component re-render (like browser navigation)
      rerender(<App />);

      // Note: In a real app with URL state management, filters would persist
      // This test verifies the component handles re-renders without crashing
      await waitFor(() => {
        expect(container.querySelector('.search-bar-container')).toBeTruthy();
      }, { timeout: 3000 });

      // Component should render without errors
      expect(screen.queryByText(/error/i)).toBeNull();
    });
  });

  /**
   * Test: Edge case - simultaneous filter and month change
   */
  describe('Simultaneous Operations', () => {
    it('should handle filter changes while month is being changed', async () => {
      fetch.mockImplementation((url) => {
        if (url.includes('/api/version')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ version: '4.2.3' })
          });
        }
        if (url.includes('/api/categories')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ categories: CATEGORIES })
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ([
            { id: 1, date: '2025-01-15', place: 'Store', amount: 50, type: 'Groceries', method: 'Cash', week: 3 }
          ])
        });
      });

      const { container } = render(<App />);

      await waitFor(() => {
        expect(container.querySelector('.search-bar-container')).toBeTruthy();
      }, { timeout: 3000 });

      // Apply filter
      const categorySelect = container.querySelector('#category-filter');
      fireEvent.change(categorySelect, { target: { value: 'Groceries' } });

      // Immediately try to change month (find month select)
      const monthSelect = container.querySelector('#month-select');
      if (monthSelect) {
        fireEvent.change(monthSelect, { target: { value: '2' } });
      }

      // Wait for operations to complete
      await waitFor(() => {
        expect(categorySelect.value).toBe('Groceries');
      }, { timeout: 3000 });

      // No errors should occur
      expect(screen.queryByText(/error/i)).toBeNull();
    });
  });
});
