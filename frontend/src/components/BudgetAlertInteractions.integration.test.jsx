import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BudgetAlertManager from './BudgetAlertManager';
import * as budgetApi from '../services/budgetApi';

// Mock the budget API
vi.mock('../services/budgetApi');

/**
 * Integration Tests for Budget Alert Interactions
 * Requirements: 4.1, 4.2, 4.3, 4.4
 * 
 * These tests verify that budget alert interactions work correctly:
 * - Budget management modal opening from alerts
 * - Alert refresh after budget modifications
 * - View details navigation functionality
 */

describe('Budget Alert Interactions - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear any existing sessionStorage
    sessionStorage.clear();
  });

  it('should open budget management modal with focused category when manage budgets clicked', async () => {
    // Requirements: 4.1, 4.2
    const mockOnManageBudgets = vi.fn();
    const mockOnViewDetails = vi.fn();

    // Mock budget API to return budget data that triggers alerts
    budgetApi.getBudgets.mockResolvedValue({ budgets: [
      {
        budget: { id: 1, category: 'Groceries', limit: 500 },
        spent: 450,
        progress: 90,
        remaining: 50,
        status: 'danger'
      }
    ] });

    render(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={0}
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Wait for alert to appear
    await waitFor(() => {
      expect(screen.getByText(/Groceries budget/)).toBeInTheDocument();
    });

    // Click manage budgets button
    const manageBudgetsButton = screen.getByText('Manage Budgets');
    fireEvent.click(manageBudgetsButton);

    // Verify callback was called with the correct category
    expect(mockOnManageBudgets).toHaveBeenCalledWith('Groceries');
  });

  it('should navigate to budget details when view details clicked', async () => {
    // Requirements: 4.3, 4.4
    const mockOnManageBudgets = vi.fn();
    const mockOnViewDetails = vi.fn();

    // Mock budget API to return budget data that triggers alerts
    budgetApi.getBudgets.mockResolvedValue({ budgets: [
      {
        budget: { id: 1, category: 'Gas', limit: 200 },
        spent: 180,
        progress: 90,
        remaining: 20,
        status: 'danger'
      }
    ] });

    render(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={0}
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Wait for alert to appear
    await waitFor(() => {
      expect(screen.getByText(/Gas budget/)).toBeInTheDocument();
    });

    // Click view details button
    const viewDetailsButton = screen.getByText('View Details');
    fireEvent.click(viewDetailsButton);

    // Verify callback was called with the correct category
    expect(mockOnViewDetails).toHaveBeenCalledWith('Gas');
  });

  it('should refresh alerts when refreshTrigger changes after budget modifications', async () => {
    // Requirements: 4.1, 4.2, 4.4
    const mockOnManageBudgets = vi.fn();
    const mockOnViewDetails = vi.fn();

    let budgetSpent = 450; // Initial state: 90% spent (danger alert)

    budgetApi.getBudgets.mockImplementation(async () => ({ budgets: [
      {
        budget: { id: 1, category: 'Groceries', limit: 500 },
        spent: budgetSpent,
        progress: (budgetSpent / 500) * 100,
        remaining: 500 - budgetSpent,
        status: budgetSpent >= 450 ? 'danger' : 'safe'
      }
    ] }));

    const { rerender } = render(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={0}
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Wait for initial danger alert (90% spent)
    await waitFor(() => {
      expect(screen.getByText(/Groceries budget/)).toBeInTheDocument();
      expect(screen.getByText(/90\.0%/)).toBeInTheDocument();
    });

    // Simulate budget modification - reduce spending to below threshold
    budgetSpent = 300; // Now 60% spent (no alert)
    
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={1}
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Wait for alert to disappear (below 80% threshold)
    await waitFor(() => {
      expect(screen.queryByText(/Groceries budget/)).not.toBeInTheDocument();
    });
  });

  it('should handle multiple alerts with independent interactions', async () => {
    // Requirements: 4.1, 4.2, 4.3, 4.4
    const mockOnManageBudgets = vi.fn();
    const mockOnViewDetails = vi.fn();

    // Mock budget API to return multiple budgets that trigger alerts
    budgetApi.getBudgets.mockResolvedValue({ budgets: [
      {
        budget: { id: 1, category: 'Groceries', limit: 500 },
        spent: 450,
        progress: 90,
        remaining: 50,
        status: 'danger'
      },
      {
        budget: { id: 2, category: 'Gas', limit: 200 },
        spent: 210,
        progress: 105,
        remaining: -10,
        status: 'critical'
      }
    ] });

    render(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={0}
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Wait for both alerts to appear
    await waitFor(() => {
      expect(screen.getByText(/Groceries budget/)).toBeInTheDocument();
      expect(screen.getByText(/Gas budget/)).toBeInTheDocument();
    });

    // Get all manage budgets buttons
    const manageBudgetsButtons = screen.getAllByText('Manage Budgets');
    expect(manageBudgetsButtons).toHaveLength(2);

    // Click first manage budgets button (should be for Gas - critical alert comes first)
    fireEvent.click(manageBudgetsButtons[0]);
    expect(mockOnManageBudgets).toHaveBeenCalledWith('Gas');

    // Click second manage budgets button (should be for Groceries - danger alert)
    fireEvent.click(manageBudgetsButtons[1]);
    expect(mockOnManageBudgets).toHaveBeenCalledWith('Groceries');

    // Get all view details buttons
    const viewDetailsButtons = screen.getAllByText('View Details');
    expect(viewDetailsButtons).toHaveLength(2);

    // Click first view details button
    fireEvent.click(viewDetailsButtons[0]);
    expect(mockOnViewDetails).toHaveBeenCalledWith('Gas');

    // Click second view details button
    fireEvent.click(viewDetailsButtons[1]);
    expect(mockOnViewDetails).toHaveBeenCalledWith('Groceries');
  });

  it('should maintain alert interactions after dismissal and refresh', async () => {
    // Requirements: 4.1, 4.2, 4.3, 4.4
    const mockOnManageBudgets = vi.fn();
    const mockOnViewDetails = vi.fn();

    // Mock budget API to return budget data that triggers alerts
    budgetApi.getBudgets.mockResolvedValue({ budgets: [
      {
        budget: { id: 1, category: 'Groceries', limit: 500 },
        spent: 450,
        progress: 90,
        remaining: 50,
        status: 'danger'
      }
    ] });

    const { rerender } = render(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={0}
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Wait for alert to appear
    await waitFor(() => {
      expect(screen.getByText(/Groceries budget/)).toBeInTheDocument();
    });

    // Dismiss the alert
    const dismissButton = screen.getByLabelText(/Dismiss.*budget alert/);
    fireEvent.click(dismissButton);

    // Alert should disappear
    await waitFor(() => {
      expect(screen.queryByText(/Groceries budget/)).not.toBeInTheDocument();
    });

    // Simulate different refreshTrigger (like after expense operation)
    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={1}
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Alert should remain dismissed during the same session
    await waitFor(() => {
      expect(screen.queryByText(/Groceries budget/)).not.toBeInTheDocument();
    });

    // Simulate month change (clears dismissal state)
    rerender(
      <BudgetAlertManager
        year={2025}
        month={12}
        refreshTrigger={1}
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Alert should reappear for new month
    await waitFor(() => {
      expect(screen.getByText(/Groceries budget/)).toBeInTheDocument();
    });

    // Interactions should still work
    const manageBudgetsButton = screen.getByText('Manage Budgets');
    fireEvent.click(manageBudgetsButton);
    expect(mockOnManageBudgets).toHaveBeenCalledWith('Groceries');
  });

  it('should handle budget management integration with alert refresh', async () => {
    // Requirements: 4.1, 4.2, 4.4
    const mockOnManageBudgets = vi.fn();
    const mockOnViewDetails = vi.fn();

    let budgetLimit = 500;
    const budgetSpent = 450;

    budgetApi.getBudgets.mockImplementation(async () => ({ budgets: [
      {
        budget: { id: 1, category: 'Groceries', limit: budgetLimit },
        spent: budgetSpent,
        progress: (budgetSpent / budgetLimit) * 100,
        remaining: budgetLimit - budgetSpent,
        status: (budgetSpent / budgetLimit) >= 0.9 ? 'danger' : 'safe'
      }
    ] }));

    const { rerender } = render(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={0}
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Wait for danger alert (90% spent)
    await waitFor(() => {
      expect(screen.getByText(/Groceries budget/)).toBeInTheDocument();
      expect(screen.getByText(/90\.0%/)).toBeInTheDocument();
    });

    // Simulate budget management - increase limit
    budgetLimit = 600; // Now 75% spent (no alert)

    rerender(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={1}
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Alert should disappear after budget modification
    await waitFor(() => {
      expect(screen.queryByText(/Groceries budget/)).not.toBeInTheDocument();
    });
  });
});