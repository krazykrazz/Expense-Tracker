import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ExpenseList from './ExpenseList';

// Mock fetch globally
global.fetch = vi.fn();

/**
 * ExpenseList Reimbursement Display Tests
 * 
 * Tests for the ReimbursementIndicator integration in ExpenseList.
 * **Validates: Requirements 5.1, 5.3, 7.2**
 */
describe('ExpenseList Reimbursement Display Tests', () => {
  const mockCategories = ['Groceries', 'Dining Out', 'Gas', 'Tax - Medical'];
  const mockPaymentMethods = [
    { id: 1, display_name: 'CIBC MC', type: 'credit_card', is_active: 1 },
    { id: 2, display_name: 'Debit', type: 'debit', is_active: 1 }
  ];

  beforeEach(() => {
    fetch.mockReset();
    
    // Mock API calls
    fetch.mockImplementation((url) => {
      if (url.includes('/api/categories')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ categories: mockCategories })
        });
      }
      if (url.includes('/api/people')) {
        return Promise.resolve({
          ok: true,
          json: async () => []
        });
      }
      if (url.includes('/api/payment-methods')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockPaymentMethods
        });
      }
      if (url.includes('/api/invoices')) {
        return Promise.resolve({
          ok: true,
          json: async () => []
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({})
      });
    });
  });

  /**
   * Test: Reimbursement indicator appears for non-medical expenses with original_cost set
   * Requirement 5.1: Display visual indicator when expense has original_cost set
   */
  it('should show reimbursement indicator for non-medical expenses with original_cost', async () => {
    const expenseWithReimbursement = {
      id: 1,
      date: '2025-01-15',
      place: 'Costco',
      notes: 'Shared groceries',
      amount: 75.00,           // Net amount after reimbursement
      original_cost: 100.00,   // Original charged amount
      type: 'Groceries',
      method: 'CIBC MC',
      week: 3
    };

    const { container } = render(
      <ExpenseList
        expenses={[expenseWithReimbursement]}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Check that the reimbursement indicator is rendered
    const indicator = container.querySelector('.reimbursement-indicator');
    expect(indicator).toBeTruthy();
    
    // Verify the indicator has the money icon
    const icon = indicator.querySelector('.reimbursement-icon');
    expect(icon).toBeTruthy();
    expect(icon.textContent).toBe('💰');
  });

  /**
   * Test: Reimbursement indicator is hidden for expenses without original_cost
   * Requirement 7.2: No indicator when original_cost is NULL
   */
  it('should NOT show reimbursement indicator for expenses without original_cost', async () => {
    const expenseWithoutReimbursement = {
      id: 1,
      date: '2025-01-15',
      place: 'Grocery Store',
      notes: 'Regular shopping',
      amount: 150.50,
      original_cost: null,  // No reimbursement
      type: 'Groceries',
      method: 'CIBC MC',
      week: 3
    };

    const { container } = render(
      <ExpenseList
        expenses={[expenseWithoutReimbursement]}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Check that no reimbursement indicator is rendered
    const indicator = container.querySelector('.reimbursement-indicator');
    expect(indicator).toBeNull();
  });

  /**
   * Test: Reimbursement indicator is hidden when original_cost equals amount
   * Requirement 7.2: No indicator when original_cost equals amount
   */
  it('should NOT show reimbursement indicator when original_cost equals amount', async () => {
    const expenseWithEqualCosts = {
      id: 1,
      date: '2025-01-15',
      place: 'Gas Station',
      notes: 'Fill up',
      amount: 60.00,
      original_cost: 60.00,  // Same as amount - no actual reimbursement
      type: 'Gas',
      method: 'Debit',
      week: 3
    };

    const { container } = render(
      <ExpenseList
        expenses={[expenseWithEqualCosts]}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Check that no reimbursement indicator is rendered
    const indicator = container.querySelector('.reimbursement-indicator');
    expect(indicator).toBeNull();
  });

  /**
   * Test: Correct net amount is displayed in the expense list
   * Requirement 5.3: Display net amount as primary amount shown
   */
  it('should display net amount (not original_cost) in the amount column', async () => {
    const expenseWithReimbursement = {
      id: 1,
      date: '2025-01-15',
      place: 'Costco',
      notes: 'Shared groceries',
      amount: 75.00,           // Net amount - this should be displayed
      original_cost: 100.00,   // Original charged amount
      type: 'Groceries',
      method: 'CIBC MC',
      week: 3
    };

    render(
      <ExpenseList
        expenses={[expenseWithReimbursement]}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Check that the net amount is displayed (not the original cost)
    expect(screen.getByText('$75.00')).toBeTruthy();
    // The original cost should NOT be displayed as the primary amount
    expect(screen.queryByText('$100.00')).toBeNull();
  });

  /**
   * Test: Reimbursement indicator is NOT shown for medical expenses
   * Requirement 5.3: Medical expenses use their own insurance UI
   */
  it('should NOT show reimbursement indicator for medical expenses', async () => {
    const medicalExpenseWithOriginalCost = {
      id: 1,
      date: '2025-01-15',
      place: 'Pharmacy',
      notes: 'Prescription',
      amount: 50.00,
      original_cost: 100.00,
      type: 'Tax - Medical',
      method: 'CIBC MC',
      week: 3,
      insurance_eligible: 1,
      claim_status: 'paid'
    };

    const { container } = render(
      <ExpenseList
        expenses={[medicalExpenseWithOriginalCost]}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Check that no reimbursement indicator is rendered for medical expenses
    const reimbursementIndicator = container.querySelector('.reimbursement-indicator');
    expect(reimbursementIndicator).toBeNull();
    
    // But insurance indicator should be shown instead
    const insuranceIndicator = container.querySelector('.insurance-status-indicator');
    expect(insuranceIndicator).toBeTruthy();
  });

  /**
   * Test: Reimbursement indicator tooltip shows correct breakdown
   * Requirement 5.2: Show breakdown on hover (Charged, Reimbursed, Net)
   */
  it('should show correct breakdown in reimbursement indicator tooltip', async () => {
    const expenseWithReimbursement = {
      id: 1,
      date: '2025-01-15',
      place: 'Restaurant',
      notes: 'Team dinner - partial reimbursement',
      amount: 80.00,           // Net amount
      original_cost: 120.00,   // Original charged amount
      type: 'Dining Out',
      method: 'CIBC MC',
      week: 3
    };

    const { container } = render(
      <ExpenseList
        expenses={[expenseWithReimbursement]}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    const indicator = container.querySelector('.reimbursement-indicator');
    expect(indicator).toBeTruthy();
    
    // Check tooltip content
    const title = indicator.getAttribute('title');
    expect(title).toContain('Charged: $120.00');
    expect(title).toContain('Reimbursed: $40.00');
    expect(title).toContain('Net: $80.00');
  });

  /**
   * Test: Multiple expenses - only reimbursed ones show indicator
   * Validates mixed list behavior
   */
  it('should show indicator only for reimbursed expenses in a mixed list', async () => {
    const expenses = [
      {
        id: 1,
        date: '2025-01-15',
        place: 'Costco',
        amount: 75.00,
        original_cost: 100.00,  // Has reimbursement
        type: 'Groceries',
        method: 'CIBC MC',
        week: 3
      },
      {
        id: 2,
        date: '2025-01-16',
        place: 'Gas Station',
        amount: 60.00,
        original_cost: null,    // No reimbursement
        type: 'Gas',
        method: 'Debit',
        week: 3
      },
      {
        id: 3,
        date: '2025-01-17',
        place: 'Restaurant',
        amount: 45.00,
        original_cost: 45.00,   // Equal - no reimbursement
        type: 'Dining Out',
        method: 'CIBC MC',
        week: 3
      }
    ];

    const { container } = render(
      <ExpenseList
        expenses={expenses}
        onExpenseDeleted={vi.fn()}
        onExpenseUpdated={vi.fn()}
        onAddExpense={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    // Should have exactly one reimbursement indicator
    const indicators = container.querySelectorAll('.reimbursement-indicator');
    expect(indicators.length).toBe(1);
  });
});
