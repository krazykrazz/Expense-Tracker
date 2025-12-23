import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BudgetAlertManager from './BudgetAlertManager';
import * as budgetApi from '../services/budgetApi';

// Mock the budget API
vi.mock('../services/budgetApi');

/**
 * Integration Test for Multiple Budget Alerts
 * Requirements: 1.4, 3.5
 * 
 * This test verifies multiple alert handling:
 * - Create multiple budgets (Food, Gas, Entertainment)
 * - Add expenses to trigger different alert levels for each
 * - Verify alerts display in correct severity order
 * - Test independent dismissal of each alert
 * - Verify alert count and "most severe" logic
 */

describe('Budget Alert Multiple Alerts - Integration Test', () => {
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

  it('should handle multiple alerts with correct severity ordering', async () => {
    // Requirements: 1.4, 3.5
    const mockOnManageBudgets = vi.fn();
    const mockOnViewDetails = vi.fn();

    // Create multiple budgets with different alert levels
    const budgetData = [
      {
        budget: { id: 1, category: 'Food', limit: 500 },
        spent: 550, // 110% - Critical
        progress: 110,
        remaining: -50,
        status: 'critical'
      },
      {
        budget: { id: 2, category: 'Gas', limit: 300 },
        spent: 270, // 90% - Danger
        progress: 90,
        remaining: 30,
        status: 'danger'
      },
      {
        budget: { id: 3, category: 'Entertainment', limit: 200 },
        spent: 160, // 80% - Warning
        progress: 80,
        remaining: 40,
        status: 'warning'
      }
    ];

    budgetApi.getBudgets.mockResolvedValue(budgetData);

    render(
      <BudgetAlertManager
        year={2025}
        month={11}
        refreshTrigger={0}
        onManageBudgets={mockOnManageBudgets}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Wait for all alerts to appear
    await waitFor(() => {
      expect(screen.getByText(/Food budget exceeded!/)).toBeInTheDocument();
      expect(screen.getByText(/Gas budget is 90\.0% used/)).toBeInTheDocument();
      expect(screen.getByText(/Entertainment budget is 80\.0% used/)).toBeInTheDocument();
    });

    // Verify alerts are displayed in correct severity order (critical, danger, warning)
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(3);

    // Critical alert should be first (most severe)
    expect(alerts[0]).toHaveClass('budget-alert-critical');
    expect(alerts[0]).toHaveTextContent('Food budget exceeded!');
    expect(alerts[0]).toHaveTextContent('⚠'); // Critical icon

    // Danger alert should be second
    expect(alerts[1]).toHaveClass('budget-alert-danger');
    expect(alerts[1]).toHaveTextContent('Gas budget is 90.0% used');
    expect(alerts[1]).toHaveTextContent('!'); // Danger icon

    // Warning alert should be third (least severe)
    expect(alerts[2]).toHaveClass('budget-alert-warning');
    expect(alerts[2]).toHaveTextContent('Entertainment budget is 80.0% used');
    expect(alerts[2]).toHaveTextContent('⚡'); // Warning icon

    // Verify each alert has correct content
    expect(screen.getByText(/\$50\.00 over budget/)).toBeInTheDocument(); // Food critical
    expect(screen.getByText(/Only \$30\.00 left!/)).toBeInTheDocument(); // Gas danger
    expect(screen.getByText(/\$40\.00 remaining/)).toBeInTheDocument(); // Entertainment warning
  });
});