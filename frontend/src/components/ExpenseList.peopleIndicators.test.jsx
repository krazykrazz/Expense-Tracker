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
import ExpenseList from './ExpenseList';

// Mock fetch globally
global.fetch = vi.fn();

describe('ExpenseList People Indicators Tests', () => {
  const mockCategories = ['Groceries', 'Tax - Medical', 'Tax - Donation'];

  beforeEach(() => {
    fetch.mockReset();
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ categories: mockCategories }),
    });
  });

  /**
   * Test: Medical expense with assigned people shows person indicator
   * Requirements: 6.5
   */
  it('should display person indicator for medical expense with assigned people', async () => {
    const mockExpenses = [
      {
        id: 1,
        date: '2025-01-15',
        place: 'Doctor Office',
        notes: 'Checkup',
        amount: 150.0,
        type: 'Tax - Medical',
        method: 'VISA',
        week: 3,
        people: [
          { personId: 1, name: 'John', amount: 150.0 }
        ]
      }
    ];

    render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Check for person indicator with assigned class
    const indicator = document.querySelector('.people-indicator.assigned');
    expect(indicator).toBeTruthy();
    
    // Check for person name
    expect(screen.getByText('John')).toBeTruthy();
  });

  /**
   * Test: Medical expense without people shows unassigned indicator
   * Requirements: 6.5
   */
  it('should display unassigned indicator for medical expense without people', async () => {
    const mockExpenses = [
      {
        id: 1,
        date: '2025-01-15',
        place: 'Pharmacy',
        notes: 'Prescription',
        amount: 50.0,
        type: 'Tax - Medical',
        method: 'Debit',
        week: 3,
        people: []
      }
    ];

    render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Check for unassigned indicator
    const indicator = document.querySelector('.people-indicator.unassigned');
    expect(indicator).toBeTruthy();
    
    // Check for unassigned text
    expect(screen.getByText('Unassigned')).toBeTruthy();
  });

  /**
   * Test: Multi-person medical expense shows person count and allocation amounts
   * Requirements: 3.4, 6.5
   */
  it('should display person count and allocation amounts for multi-person expense', async () => {
    const mockExpenses = [
      {
        id: 1,
        date: '2025-01-15',
        place: 'Hospital',
        notes: 'Family visit',
        amount: 300.0,
        type: 'Tax - Medical',
        method: 'VISA',
        week: 3,
        people: [
          { personId: 1, name: 'John', amount: 150.0 },
          { personId: 2, name: 'Jane', amount: 150.0 }
        ]
      }
    ];

    render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Check for person count badge
    const countBadge = document.querySelector('.person-count');
    expect(countBadge).toBeTruthy();
    expect(countBadge.textContent).toBe('2');

    // Check that both names are displayed with amounts
    const personRows = document.querySelectorAll('.person-row');
    expect(personRows.length).toBe(2);
    
    const personNames = document.querySelectorAll('.person-name');
    expect(personNames.length).toBe(2);
    expect(personNames[0].textContent).toBe('John');
    expect(personNames[1].textContent).toBe('Jane');
    
    const personAmounts = document.querySelectorAll('.person-amount');
    expect(personAmounts.length).toBe(2);
    expect(personAmounts[0].textContent).toBe('$150.00');
    expect(personAmounts[1].textContent).toBe('$150.00');
  });

  /**
   * Test: Non-medical expenses do not show people indicator
   * Requirements: 6.5
   */
  it('should not display people indicator for non-medical expenses', async () => {
    const mockExpenses = [
      {
        id: 1,
        date: '2025-01-15',
        place: 'Grocery Store',
        notes: 'Shopping',
        amount: 100.0,
        type: 'Groceries',
        method: 'Debit',
        week: 3
      }
    ];

    render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Check that no people indicator is shown
    const indicator = document.querySelector('.people-indicator');
    expect(indicator).toBeNull();
  });

  /**
   * Test: Medical expense with undefined people array shows unassigned
   * Requirements: 6.5
   */
  it('should handle medical expense with undefined people array', async () => {
    const mockExpenses = [
      {
        id: 1,
        date: '2025-01-15',
        place: 'Clinic',
        notes: 'Visit',
        amount: 75.0,
        type: 'Tax - Medical',
        method: 'Cash',
        week: 3
        // people is undefined
      }
    ];

    render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Should show unassigned indicator
    const indicator = document.querySelector('.people-indicator.unassigned');
    expect(indicator).toBeTruthy();
  });

  /**
   * Test: Person indicator has correct tooltip content
   * Requirements: 3.4, 6.5
   */
  it('should have correct tooltip content for assigned people', async () => {
    const mockExpenses = [
      {
        id: 1,
        date: '2025-01-15',
        place: 'Doctor',
        notes: 'Checkup',
        amount: 200.0,
        type: 'Tax - Medical',
        method: 'VISA',
        week: 3,
        people: [
          { personId: 1, name: 'John', amount: 100.0, dateOfBirth: '1990-05-15' },
          { personId: 2, name: 'Jane', amount: 100.0 }
        ]
      }
    ];

    render(
      <ExpenseList
        expenses={mockExpenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Check tooltip content
    const indicator = document.querySelector('.people-indicator.assigned');
    expect(indicator).toBeTruthy();
    expect(indicator.getAttribute('title')).toContain('John');
    expect(indicator.getAttribute('title')).toContain('$100.00');
    expect(indicator.getAttribute('title')).toContain('DOB: 1990-05-15');
  });
});
