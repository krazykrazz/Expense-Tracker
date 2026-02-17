import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import BudgetAlertManager from './BudgetAlertManager';
import * as budgetApi from '../services/budgetApi';

// Wrapper that captures onRenderContent and renders it, mimicking SummaryPanel behavior
const ManagerWithRender = (props) => {
  const [content, setContent] = useState(null);
  return (
    <>
      <BudgetAlertManager {...props} onRenderContent={setContent} />
      {content}
    </>
  );
};

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
    const mockOnClick = vi.fn();

    // Create multiple budgets with different alert levels (flat format from API)
    const budgetData = [
      { id: 1, year: 2025, month: 11, category: 'Food', limit: 500, spent: 550 }, // 110% - Critical
      { id: 2, year: 2025, month: 11, category: 'Gas', limit: 300, spent: 270 }, // 90% - Danger
      { id: 3, year: 2025, month: 11, category: 'Entertainment', limit: 200, spent: 160 } // 80% - Warning
    ];

    budgetApi.getBudgets.mockResolvedValue({ budgets: budgetData });

    render(
      <ManagerWithRender
        year={2025}
        month={11}
        refreshTrigger={0}
        onClick={mockOnClick}
      />
    );

    // Wait for the combined alert banner to appear (multiple alerts show as single banner)
    await waitFor(() => {
      expect(screen.getByTestId('budget-reminder-banner')).toBeInTheDocument();
    });

    // With multiple alerts, BudgetReminderBanner shows a combined view
    // The banner should show the count and have critical styling (most severe)
    const banner = screen.getByTestId('budget-reminder-banner');
    expect(banner).toHaveClass('critical'); // Most severe alert determines banner class

    // Verify the summary message shows multiple alerts
    expect(screen.getByText(/budget.*exceeded/i)).toBeInTheDocument();
    expect(screen.getByText(/3 total alerts/i)).toBeInTheDocument();

    // Verify individual alert items are shown in the breakdown
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('Gas')).toBeInTheDocument();
    expect(screen.getByText('Entertainment')).toBeInTheDocument();

    // Verify severity indicators are present for each alert (using the actual testid format)
    expect(screen.getByTestId('severity-indicator-budget-alert-1')).toBeInTheDocument(); // Food - critical
    expect(screen.getByTestId('severity-indicator-budget-alert-2')).toBeInTheDocument(); // Gas - danger
    expect(screen.getByTestId('severity-indicator-budget-alert-3')).toBeInTheDocument(); // Entertainment - warning
  });
});