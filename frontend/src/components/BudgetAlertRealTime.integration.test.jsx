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
    const mockOnManageBudgets = vi.fn();
    const mockOnViewDetails = vi.fn();

    const budgetLimit = 500;
    let currentSpent = 450; // Start at 90% (danger alert)

    const getBudgetData = () => [{
      budget: { id: 1, category: 'Groceries', limit: budgetLimit },
      spent: currentSpent,
      progress: (currentSpent / budgetLimit) * 100,
      remaining: budgetLimit - currentSpent,
      status: currentSpent >= budgetLimit ? 'critical' : 
              currentSpent >= budgetLimit * 0.9 ? 'danger' :
              currentSpent >= budgetLimit * 0.8 ? 'warning' : 'safe'
    }];

    budgetApi.getBudgets.mockImplementation(async () => getBudgetData());

    const { rerender } = render(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={0}
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Step 1: Verify initial danger alert is displayed
    await waitFor(() => {
      expect(screen.getByText(/Groceries budget is 90\.0% used/)).toBeInTheDocument();
      expect(screen.getByText('!')).toBeInTheDocument(); // Danger icon
    });

    // Verify danger alert styling
    const dangerAlert = screen.getByRole('alert');
    expect(dangerAlert).toHaveClass('budget-alert-danger');
    expect(screen.getByText(/Only \$50\.00 left!/)).toBeInTheDocument();

    // Step 2: Edit expense to reduce amount below threshold (70% spent)
    // Requirement 5.3: When I delete an expense that improves the budget situation
    currentSpent = 350; // 70% of $500 (below 80% threshold)
    
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={1}
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
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
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Step 5: Verify alert reappears with correct severity (warning)
    await waitFor(() => {
      expect(screen.getByText(/Groceries budget is 85\.0% used/)).toBeInTheDocument();
      expect(screen.getByText('⚡')).toBeInTheDocument(); // Warning icon
    });

    // Verify warning alert styling
    const warningAlert = screen.getByRole('alert');
    expect(warningAlert).toHaveClass('budget-alert-warning');
    expect(screen.getByText(/\$75\.00 remaining/)).toBeInTheDocument();

    // Step 6: Further increase to danger level (95% spent)
    // Requirement 5.2: When I edit an expense that changes the budget alert status
    currentSpent = 475; // 95% of $500 (danger level)
    
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={3}
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Step 7: Verify alert updates to danger severity
    await waitFor(() => {
      expect(screen.getByText(/Groceries budget is 95\.0% used/)).toBeInTheDocument();
      expect(screen.getByText('!')).toBeInTheDocument(); // Danger icon
    });

    // Verify danger alert styling
    const updatedDangerAlert = screen.getByRole('alert');
    expect(updatedDangerAlert).toHaveClass('budget-alert-danger');
    expect(screen.getByText(/Only \$25\.00 left!/)).toBeInTheDocument();

    // Step 8: Push to critical level (110% spent)
    currentSpent = 550; // 110% of $500 (critical level)
    
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={4}
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Step 9: Verify alert updates to critical severity
    // Requirement 5.4: When budget progress moves from one threshold to another
    await waitFor(() => {
      expect(screen.getByText(/Groceries budget exceeded!/)).toBeInTheDocument();
      expect(screen.getByText('⚠')).toBeInTheDocument(); // Critical icon
    });

    // Verify critical alert styling
    const criticalAlert = screen.getByRole('alert');
    expect(criticalAlert).toHaveClass('budget-alert-critical');
    expect(screen.getByText(/\$50\.00 over budget/)).toBeInTheDocument();
  });

  it('should handle rapid expense changes with debouncing', async () => {
    // Requirements: 5.1, 5.2, 7.2 (debouncing for performance)
    const mockOnManageBudgets = vi.fn();
    const mockOnViewDetails = vi.fn();

    const budgetLimit = 1000;
    let currentSpent = 700; // Start at 70% (no alert)

    budgetApi.getBudgets.mockImplementation(async () => [{
      budget: { id: 2, category: 'Gas', limit: budgetLimit },
      spent: currentSpent,
      progress: (currentSpent / budgetLimit) * 100,
      remaining: budgetLimit - currentSpent,
      status: currentSpent >= budgetLimit ? 'critical' : 
              currentSpent >= budgetLimit * 0.9 ? 'danger' :
              currentSpent >= budgetLimit * 0.8 ? 'warning' : 'safe'
    }]);

    const { rerender } = render(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={0}
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
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
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    currentSpent = 920; // 92% (danger)
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={2}
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    currentSpent = 1100; // 110% (critical)
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={3}
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Should eventually show the final state (critical alert)
    // The debouncing should handle rapid updates gracefully
    await waitFor(() => {
      expect(screen.getByText(/Gas budget exceeded!/)).toBeInTheDocument();
      expect(screen.getByText('⚠')).toBeInTheDocument();
    }, { timeout: 1000 }); // Allow time for debouncing
  });

  it('should maintain alert state consistency during real-time updates', async () => {
    // Requirements: 5.1, 5.2, 5.3, 5.4
    const mockOnManageBudgets = vi.fn();
    const mockOnViewDetails = vi.fn();

    const budgetLimit = 300;
    let currentSpent = 240; // Start at 80% (warning)

    budgetApi.getBudgets.mockImplementation(async () => [{
      budget: { id: 3, category: 'Entertainment', limit: budgetLimit },
      spent: currentSpent,
      progress: (currentSpent / budgetLimit) * 100,
      remaining: budgetLimit - currentSpent,
      status: currentSpent >= budgetLimit ? 'critical' : 
              currentSpent >= budgetLimit * 0.9 ? 'danger' :
              currentSpent >= budgetLimit * 0.8 ? 'warning' : 'safe'
    }]);

    const { rerender } = render(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={0}
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Initial warning alert
    await waitFor(() => {
      expect(screen.getByText(/Entertainment budget is 80\.0% used/)).toBeInTheDocument();
    });

    // Test action buttons work during real-time updates
    fireEvent.click(screen.getByText('Manage Budgets'));
    expect(mockOnManageBudgets).toHaveBeenCalledWith('Entertainment');

    fireEvent.click(screen.getByText('View Details'));
    expect(mockOnViewDetails).toHaveBeenCalledWith('Entertainment');

    // Dismiss the alert
    const dismissButton = screen.getByLabelText(/Dismiss.*budget alert/);
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
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
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
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
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
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Wait for debounce
    await new Promise(resolve => setTimeout(resolve, 400));

    // Alert should reappear because dismissal state was cleared
    await waitFor(() => {
      expect(screen.getByText(/Entertainment budget is 95\.0% used/)).toBeInTheDocument();
      expect(screen.getByText('!')).toBeInTheDocument(); // Danger icon
    });

    // Verify action buttons still work after dismissal override
    fireEvent.click(screen.getByText('Manage Budgets'));
    expect(mockOnManageBudgets).toHaveBeenCalledWith('Entertainment');
  });

  it('should handle edge cases in real-time updates', async () => {
    // Requirements: 5.1, 5.2, 5.3, 5.4
    const mockOnManageBudgets = vi.fn();
    const mockOnViewDetails = vi.fn();

    const budgetLimit = 100;
    let currentSpent = 79.99; // Just below 80% threshold

    budgetApi.getBudgets.mockImplementation(async () => [{
      budget: { id: 4, category: 'Other', limit: budgetLimit },
      spent: currentSpent,
      progress: (currentSpent / budgetLimit) * 100,
      remaining: budgetLimit - currentSpent,
      status: currentSpent >= budgetLimit ? 'critical' : 
              currentSpent >= budgetLimit * 0.9 ? 'danger' :
              currentSpent >= budgetLimit * 0.8 ? 'warning' : 'safe'
    }]);

    const { rerender } = render(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={0}
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
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
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
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
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
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
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
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
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Should upgrade to danger
    await waitFor(() => {
      expect(screen.getByText(/Other budget is 90\.0% used/)).toBeInTheDocument();
      expect(screen.getByText('!')).toBeInTheDocument();
    });

    currentSpent = 100.00; // Exactly 100%
    
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={5}
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Should upgrade to critical
    await waitFor(() => {
      expect(screen.getByText(/Other budget exceeded!/)).toBeInTheDocument();
      expect(screen.getByText('⚠')).toBeInTheDocument();
    });
  });
});