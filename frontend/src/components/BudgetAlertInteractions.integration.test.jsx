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
 * - Click handler navigation functionality
 * - Alert refresh after budget modifications
 * - Dismissal and persistence behavior
 */

describe('Budget Alert Interactions - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear any existing sessionStorage
    sessionStorage.clear();
  });

  it('should call onClick with category when banner is clicked', async () => {
    // Requirements: 4.1, 4.2
    const mockOnClick = vi.fn();

    // Mock budget API to return budget data that triggers alerts (flat format)
    budgetApi.getBudgets.mockResolvedValue({ budgets: [
      { id: 1, year: 2025, month: 11, category: 'Groceries', limit: 500, spent: 450 }
    ] });

    render(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={0}
        onClick={mockOnClick}
      />
    );

    // Wait for alert to appear
    await waitFor(() => {
      expect(screen.getByText(/Groceries budget/)).toBeInTheDocument();
    });

    // Click the banner
    const banner = screen.getByTestId('budget-reminder-banner');
    fireEvent.click(banner);

    // Verify callback was called with the correct category
    expect(mockOnClick).toHaveBeenCalledWith('Groceries');
  });

  it('should refresh alerts when refreshTrigger changes after budget modifications', async () => {
    // Requirements: 4.1, 4.2, 4.4
    const mockOnClick = vi.fn();

    let budgetSpent = 450; // Initial state: 90% spent (danger alert)

    budgetApi.getBudgets.mockImplementation(async () => ({ budgets: [
      { id: 1, year: 2025, month: 11, category: 'Groceries', limit: 500, spent: budgetSpent }
    ] }));

    const { rerender } = render(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={0}
        onClick={mockOnClick}
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
        onClick={mockOnClick}
      />
    );

    // Wait for alert to disappear (below 80% threshold)
    await waitFor(() => {
      expect(screen.queryByText(/Groceries budget/)).not.toBeInTheDocument();
    });
  });

  it('should handle multiple alerts with combined banner view', async () => {
    // Requirements: 4.1, 4.2, 4.3, 4.4
    const mockOnClick = vi.fn();

    // Mock budget API to return multiple budgets that trigger alerts (flat format)
    budgetApi.getBudgets.mockResolvedValue({ budgets: [
      { id: 1, year: 2025, month: 11, category: 'Groceries', limit: 500, spent: 450 },
      { id: 2, year: 2025, month: 11, category: 'Gas', limit: 200, spent: 210 }
    ] });

    render(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={0}
        onClick={mockOnClick}
      />
    );

    // Wait for combined alert banner to appear
    await waitFor(() => {
      expect(screen.getByTestId('budget-reminder-banner')).toBeInTheDocument();
    });

    // With multiple alerts, clicking the banner should call onClick with null (no specific category)
    const banner = screen.getByTestId('budget-reminder-banner');
    fireEvent.click(banner);
    expect(mockOnClick).toHaveBeenCalledWith(null);

    // Individual alert items should be clickable with their specific category
    const groceriesItem = screen.getByText('Groceries').closest('[role="button"]');
    if (groceriesItem) {
      fireEvent.click(groceriesItem);
      expect(mockOnClick).toHaveBeenCalledWith('Groceries');
    }
  });

  it('should maintain alert interactions after dismissal and refresh', async () => {
    // Requirements: 4.1, 4.2, 4.3, 4.4
    const mockOnClick = vi.fn();

    // Mock budget API to return budget data that triggers alerts (flat format)
    budgetApi.getBudgets.mockResolvedValue({ budgets: [
      { id: 1, year: 2025, month: 11, category: 'Groceries', limit: 500, spent: 450 }
    ] });

    const { rerender } = render(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={0}
        onClick={mockOnClick}
      />
    );

    // Wait for alert to appear
    await waitFor(() => {
      expect(screen.getByText(/Groceries budget/)).toBeInTheDocument();
    });

    // Dismiss the alert
    const dismissButton = screen.getByLabelText(/Dismiss reminder/);
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
        onClick={mockOnClick}
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
        onClick={mockOnClick}
      />
    );

    // Alert should reappear for new month
    await waitFor(() => {
      expect(screen.getByText(/Groceries budget/)).toBeInTheDocument();
    });

    // Interactions should still work
    const banner = screen.getByTestId('budget-reminder-banner');
    fireEvent.click(banner);
    expect(mockOnClick).toHaveBeenCalledWith('Groceries');
  });

  it('should handle budget management integration with alert refresh', async () => {
    // Requirements: 4.1, 4.2, 4.4
    const mockOnClick = vi.fn();

    let budgetLimit = 500;
    const budgetSpent = 450;

    budgetApi.getBudgets.mockImplementation(async () => ({ budgets: [
      { id: 1, year: 2025, month: 11, category: 'Groceries', limit: budgetLimit, spent: budgetSpent }
    ] }));

    const { rerender } = render(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={0}
        onClick={mockOnClick}
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
        onClick={mockOnClick}
      />
    );

    // Alert should disappear after budget modification
    await waitFor(() => {
      expect(screen.queryByText(/Groceries budget/)).not.toBeInTheDocument();
    });
  });
});
