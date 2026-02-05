import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BudgetAlertManager from './BudgetAlertManager';
import * as budgetApi from '../services/budgetApi';

// Mock the budget API
vi.mock('../services/budgetApi');

/**
 * Integration Test for Real-time Alert Updates
 * Requirements: 5.1, 5.2, 5.3, 5.4
 * 
 * This test verifies real-time alert updates:
 * - Set up budget and expenses to trigger alert
 * - Verify alert displayed
 * - Edit expense to reduce amount below threshold
 * - Verify alert disappears immediately
 * - Edit expense to increase amount above threshold
 * - Verify alert reappears with correct severity
 */

describe('Budget Alert Real-time Updates - Integration Test', () => {
  let originalSessionStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock sessionStorage
    originalSessionStorage = global.sessionStorage;
    const mockStorage = {
      store: {},
      getItem: vi.fn((key) => mockStorage.store[key] || null),
      setItem: vi.fn((key, value) => { mockStorage.store[key] = value; }),
      removeItem: vi.fn((key) => { delete mockStorage.store[key]; }),
      clear: vi.fn(() => { mockStorage.store = {}; })
    };
    global.sessionStorage = mockStorage;
  });

  afterEach(() => {
    global.sessionStorage = originalSessionStorage;
  });

  it('should update alerts in real-time when expenses change', async () => {
    // Requirements: 5.1, 5.2, 5.3, 5.4
    const mockOnClick = vi.fn();

    const budgetLimit = 500;
    let currentSpent = 450; // Start at 90% (danger alert)

    const getBudgetData = () => [{
      id: 1, year: 2025, month: 11, category: 'Groceries', limit: budgetLimit, spent: currentSpent
    }];

    budgetApi.getBudgets.mockImplementation(async () => ({ budgets: getBudgetData() }));

    const { rerender } = render(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={0}
        onClick={mockOnClick}
      />
    );

    // Step 1: Verify initial danger alert is displayed
    await waitFor(() => {
      expect(screen.getByText(/Groceries budget is 90\.0% used/)).toBeInTheDocument();
    });

    // Verify danger alert styling via testid
    const dangerAlert = screen.getByTestId('budget-reminder-banner');
    expect(dangerAlert).toHaveClass('danger');
    expect(screen.getByText(/\$50\.00 remaining/)).toBeInTheDocument();
    // Verify severity indicator is present
    expect(screen.getByTestId('severity-indicator')).toBeInTheDocument();

    // Step 2: Edit expense to reduce amount below threshold (70% spent)
    // Requirement 5.3: When I delete an expense that improves the budget situation
    currentSpent = 350; // 70% of $500 (below 80% threshold)
    
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={1}
        onClick={mockOnClick}
      />
    );

    // Step 3: Verify alert disappears immediately
    await waitFor(() => {
      expect(screen.queryByText(/Groceries budget/)).not.toBeInTheDocument();
    });

    // Step 4: Edit expense to increase amount above threshold (85% spent)
    // Requirement 5.1: When I add an expense that pushes a category over an alert threshold
    currentSpent = 425; // 85% of $500 (warning level)
    
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={2}
        onClick={mockOnClick}
      />
    );

    // Step 5: Verify alert reappears with correct severity (warning)
    await waitFor(() => {
      expect(screen.getByText(/Groceries budget is 85\.0% used/)).toBeInTheDocument();
    });

    // Verify warning alert styling
    const warningAlert = screen.getByTestId('budget-reminder-banner');
    expect(warningAlert).toHaveClass('warning');
    expect(screen.getByText(/\$75\.00 remaining/)).toBeInTheDocument();

    // Step 6: Further increase to danger level (95% spent)
    // Requirement 5.2: When I edit an expense that changes the budget alert status
    currentSpent = 475; // 95% of $500 (danger level)
    
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={3}
        onClick={mockOnClick}
      />
    );

    // Step 7: Verify alert updates to danger severity
    await waitFor(() => {
      expect(screen.getByText(/Groceries budget is 95\.0% used/)).toBeInTheDocument();
    });

    // Verify danger alert styling
    const updatedDangerAlert = screen.getByTestId('budget-reminder-banner');
    expect(updatedDangerAlert).toHaveClass('danger');
    expect(screen.getByText(/\$25\.00 remaining/)).toBeInTheDocument();

    // Step 8: Push to critical level (110% spent)
    currentSpent = 550; // 110% of $500 (critical level)
    
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={4}
        onClick={mockOnClick}
      />
    );

    // Step 9: Verify alert updates to critical severity
    // Requirement 5.4: When budget progress moves from one threshold to another
    await waitFor(() => {
      expect(screen.getByText(/Groceries budget exceeded!/)).toBeInTheDocument();
    });

    // Verify critical alert styling
    const criticalAlert = screen.getByTestId('budget-reminder-banner');
    expect(criticalAlert).toHaveClass('critical');
    expect(screen.getByText(/\$50\.00 over budget/)).toBeInTheDocument();
  });

  it('should handle rapid expense changes with debouncing', async () => {
    // Requirements: 5.1, 5.2, 7.2 (debouncing for performance)
    const mockOnClick = vi.fn();

    const budgetLimit = 1000;
    let currentSpent = 700; // Start at 70% (no alert)

    budgetApi.getBudgets.mockImplementation(async () => ({ budgets: [{
      id: 2, year: 2025, month: 11, category: 'Gas', limit: budgetLimit, spent: currentSpent
    }] }));

    const { rerender } = render(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={0}
        onClick={mockOnClick}
      />
    );

    // Initially no alert
    await waitFor(() => {
      expect(screen.queryByText(/Gas budget/)).not.toBeInTheDocument();
    });

    // Rapid changes - simulate multiple expense operations in quick succession
    currentSpent = 850; // 85% (warning)
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={1}
        onClick={mockOnClick}
      />
    );

    currentSpent = 920; // 92% (danger)
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={2}
        onClick={mockOnClick}
      />
    );

    currentSpent = 1100; // 110% (critical)
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={3}
        onClick={mockOnClick}
      />
    );

    // Should eventually show the final state (critical alert)
    // The debouncing should handle rapid updates gracefully
    await waitFor(() => {
      expect(screen.getByText(/Gas budget exceeded!/)).toBeInTheDocument();
      const banner = screen.getByTestId('budget-reminder-banner');
      expect(banner).toHaveClass('critical');
    }, { timeout: 1000 }); // Allow time for debouncing
  });

  it('should maintain alert state consistency during real-time updates', async () => {
    // Requirements: 5.1, 5.2, 5.3, 5.4
    const mockOnClick = vi.fn();

    const budgetLimit = 300;
    let currentSpent = 240; // Start at 80% (warning)

    budgetApi.getBudgets.mockImplementation(async () => ({ budgets: [{
      id: 3, year: 2025, month: 11, category: 'Entertainment', limit: budgetLimit, spent: currentSpent
    }] }));

    const { rerender } = render(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={0}
        onClick={mockOnClick}
      />
    );

    // Initial warning alert
    await waitFor(() => {
      expect(screen.getByText(/Entertainment budget is 80\.0% used/)).toBeInTheDocument();
    });

    // Test click handler works during real-time updates
    const banner = screen.getByTestId('budget-reminder-banner');
    fireEvent.click(banner);
    expect(mockOnClick).toHaveBeenCalledWith('Entertainment');

    // Dismiss the alert
    const dismissButton = screen.getByLabelText(/Dismiss reminder/);
    fireEvent.click(dismissButton);

    await waitFor(() => {
      expect(screen.queryByText(/Entertainment budget/)).not.toBeInTheDocument();
    });

    // Change spending but stay at same severity level (82% - still warning)
    currentSpent = 246;
    
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={1}
        onClick={mockOnClick}
      />
    );

    // Alert should remain dismissed (same severity level)
    await waitFor(() => {
      expect(screen.queryByText(/Entertainment budget/)).not.toBeInTheDocument();
    });

    // Increase to danger level (95% - severity worsened)
    // To test the alert reappearing, we need to clear the dismissal state by changing month
    currentSpent = 285;
    
    // First change month to clear dismissal state
    rerender(
      <BudgetAlertManager
        year={2025}
        month={12}
        refreshTrigger={2}
        onClick={mockOnClick}
      />
    );

    // Wait for debounce
    await new Promise(resolve => setTimeout(resolve, 400));

    // Change back to original month with cleared dismissal state
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={3}
        onClick={mockOnClick}
      />
    );

    // Wait for debounce
    await new Promise(resolve => setTimeout(resolve, 400));

    // Alert should reappear because dismissal state was cleared
    await waitFor(() => {
      expect(screen.getByText(/Entertainment budget is 95\.0% used/)).toBeInTheDocument();
      const banner = screen.getByTestId('budget-reminder-banner');
      expect(banner).toHaveClass('danger');
    });

    // Verify click handler still works after dismissal override
    const newBanner = screen.getByTestId('budget-reminder-banner');
    fireEvent.click(newBanner);
    expect(mockOnClick).toHaveBeenCalledWith('Entertainment');
  });

  it('should handle edge cases in real-time updates', async () => {
    // Requirements: 5.1, 5.2, 5.3, 5.4
    const mockOnClick = vi.fn();

    const budgetLimit = 100;
    let currentSpent = 79.99; // Just below 80% threshold

    budgetApi.getBudgets.mockImplementation(async () => ({ budgets: [{
      id: 4, year: 2025, month: 11, category: 'Other', limit: budgetLimit, spent: currentSpent
    }] }));

    const { rerender } = render(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={0}
        onClick={mockOnClick}
      />
    );

    // No alert initially (just below threshold)
    await waitFor(() => {
      expect(screen.queryByText(/Other budget/)).not.toBeInTheDocument();
    });

    // Cross threshold by tiny amount (80.01%)
    currentSpent = 80.01;
    
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={1}
        onClick={mockOnClick}
      />
    );

    // Alert should appear
    await waitFor(() => {
      expect(screen.getByText(/Other budget is 80\.0% used/)).toBeInTheDocument();
    });

    // Go back just below threshold
    currentSpent = 79.99;
    
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={2}
        onClick={mockOnClick}
      />
    );

    // Alert should disappear
    await waitFor(() => {
      expect(screen.queryByText(/Other budget/)).not.toBeInTheDocument();
    });

    // Test exact threshold values
    currentSpent = 80.00; // Exactly 80%
    
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={3}
        onClick={mockOnClick}
      />
    );

    // Alert should appear at exact threshold
    await waitFor(() => {
      expect(screen.getByText(/Other budget is 80\.0% used/)).toBeInTheDocument();
    });

    currentSpent = 90.00; // Exactly 90%
    
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={4}
        onClick={mockOnClick}
      />
    );

    // Should upgrade to danger
    await waitFor(() => {
      expect(screen.getByText(/Other budget is 90\.0% used/)).toBeInTheDocument();
      const banner = screen.getByTestId('budget-reminder-banner');
      expect(banner).toHaveClass('danger');
    });

    currentSpent = 100.00; // Exactly 100%
    
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={5}
        onClick={mockOnClick}
      />
    );

    // Should upgrade to critical
    await waitFor(() => {
      expect(screen.getByText(/Other budget exceeded!/)).toBeInTheDocument();
      const banner = screen.getByTestId('budget-reminder-banner');
      expect(banner).toHaveClass('critical');
    });
  });
});
