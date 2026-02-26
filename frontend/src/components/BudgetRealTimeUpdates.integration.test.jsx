import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../utils/fetchProvider', async () => {
  const actual = await vi.importActual('../utils/fetchProvider');
  return {
    ...actual,
    getFetchFn: () => (...args) => globalThis.fetch(...args),
    authAwareFetch: (...args) => globalThis.fetch(...args),
  };
});

import { render, waitFor } from '@testing-library/react';
import BudgetSummaryPanel from './BudgetSummaryPanel';

/**
 * Integration Tests for Budget Real-Time Updates
 * Requirements: 2.4, 8.2, 8.3
 * 
 * These tests verify that budget progress updates correctly when expenses are
 * added, modified, or deleted, ensuring real-time synchronization between
 * expense operations and budget calculations.
 */

describe('Budget Real-Time Updates - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update budget display when refreshTrigger changes', async () => {
    // Requirements: 2.4, 8.2
    let budgetSpent = 0;
    
    global.fetch = vi.fn(async (url) => {
      if (url.includes('/api/budgets/summary')) {
        return {
          ok: true,
          json: async () => ({
            totalBudgeted: 500,
            totalSpent: budgetSpent,
            remaining: 500 - budgetSpent,
            progress: (budgetSpent / 500) * 100,
            budgetsOnTrack: budgetSpent < 500 ? 1 : 0,
            totalBudgets: 1,
            categories: []
          })
        };
      }
      
      if (url.includes('/api/budgets')) {
        return {
          ok: true,
          json: async () => ({ budgets: [] })
        };
      }
      
      return { ok: false };
    });

    const { container, rerender } = render(
      <BudgetSummaryPanel year={2025} month={11} refreshTrigger={0} />
    );

    // Wait for initial load
    await waitFor(() => {
      expect(container.textContent).toContain('$0.00');
    });

    // Simulate expense addition by changing budgetSpent and refreshTrigger
    budgetSpent = 100;
    rerender(<BudgetSummaryPanel year={2025} month={11} refreshTrigger={1} />);

    // Verify budget updated
    await waitFor(() => {
      expect(container.textContent).toContain('100');
    });
  });

  it('should handle multiple rapid updates', async () => {
    // Requirements: 2.4, 8.2
    let budgetSpent = 0;
    
    global.fetch = vi.fn(async (url) => {
      if (url.includes('/api/budgets/summary')) {
        return {
          ok: true,
          json: async () => ({
            totalBudgeted: 500,
            totalSpent: budgetSpent,
            remaining: 500 - budgetSpent,
            progress: (budgetSpent / 500) * 100,
            budgetsOnTrack: budgetSpent < 500 ? 1 : 0,
            totalBudgets: 1,
            categories: []
          })
        };
      }
      
      if (url.includes('/api/budgets')) {
        return {
          ok: true,
          json: async () => ({ budgets: [] })
        };
      }
      
      return { ok: false };
    });

    const { container, rerender } = render(
      <BudgetSummaryPanel year={2025} month={11} refreshTrigger={0} />
    );

    await waitFor(() => {
      expect(container.textContent).toContain('$0.00');
    });

    // Simulate three rapid expense additions
    budgetSpent = 50;
    rerender(<BudgetSummaryPanel year={2025} month={11} refreshTrigger={1} />);
    
    await waitFor(() => {
      expect(container.textContent).toContain('50');
    });

    budgetSpent = 100;
    rerender(<BudgetSummaryPanel year={2025} month={11} refreshTrigger={2} />);
    
    await waitFor(() => {
      expect(container.textContent).toContain('100');
    });

    budgetSpent = 150;
    rerender(<BudgetSummaryPanel year={2025} month={11} refreshTrigger={3} />);
    
    await waitFor(() => {
      expect(container.textContent).toContain('150');
    });
  });

  it('should update budget display when refreshTrigger changes after expense addition', async () => {
    // Requirements: 2.4, 8.2
    let budgetSpent = 0;
    
    global.fetch = vi.fn(async (url) => {
      if (url.includes('/api/budgets/summary')) {
        return {
          ok: true,
          json: async () => ({
            totalBudgeted: 500,
            totalSpent: budgetSpent,
            remaining: 500 - budgetSpent,
            progress: (budgetSpent / 500) * 100,
            budgetsOnTrack: budgetSpent < 500 ? 1 : 0,
            totalBudgets: 1,
            categories: []
          })
        };
      }
      
      if (url.includes('/api/budgets')) {
        return {
          ok: true,
          json: async () => ({ budgets: [] })
        };
      }
      
      return { ok: false };
    });

    const { container, rerender } = render(
      <BudgetSummaryPanel year={2025} month={11} refreshTrigger={0} />
    );

    // Wait for initial load with $0 spent
    await waitFor(() => {
      expect(container.textContent).toContain('$0.00');
    });

    // Simulate expense addition by changing budgetSpent and refreshTrigger
    budgetSpent = 100;
    rerender(<BudgetSummaryPanel year={2025} month={11} refreshTrigger={1} />);

    // Verify budget updated to show $100 spent
    await waitFor(() => {
      expect(container.textContent).toContain('$100.00');
    });
  });

  it('should update budget when expense is modified', async () => {
    // Requirements: 2.4, 8.3
    let budgetSpent = 100;
    
    global.fetch = vi.fn(async (url) => {
      if (url.includes('/api/budgets/summary')) {
        return {
          ok: true,
          json: async () => ({
            totalBudgeted: 500,
            totalSpent: budgetSpent,
            remaining: 500 - budgetSpent,
            progress: (budgetSpent / 500) * 100,
            budgetsOnTrack: budgetSpent < 500 ? 1 : 0,
            totalBudgets: 1,
            categories: []
          })
        };
      }
      
      if (url.includes('/api/budgets')) {
        return {
          ok: true,
          json: async () => ({ budgets: [] })
        };
      }
      
      return { ok: false };
    });

    const { container, rerender } = render(
      <BudgetSummaryPanel year={2025} month={11} refreshTrigger={0} />
    );

    // Wait for initial load with $100 spent
    await waitFor(() => {
      expect(container.textContent).toContain('$100.00');
    });

    // Simulate expense modification (amount changed from 100 to 200)
    budgetSpent = 200;
    rerender(<BudgetSummaryPanel year={2025} month={11} refreshTrigger={1} />);

    // Verify budget updated to show $200 spent
    await waitFor(() => {
      expect(container.textContent).toContain('$200.00');
    });
  });

  it('should update budget when expense is deleted', async () => {
    // Requirements: 2.4, 8.2
    let budgetSpent = 150;
    
    global.fetch = vi.fn(async (url) => {
      if (url.includes('/api/budgets/summary')) {
        return {
          ok: true,
          json: async () => ({
            totalBudgeted: 500,
            totalSpent: budgetSpent,
            remaining: 500 - budgetSpent,
            progress: (budgetSpent / 500) * 100,
            budgetsOnTrack: budgetSpent < 500 ? 1 : 0,
            totalBudgets: 1,
            categories: []
          })
        };
      }
      
      if (url.includes('/api/budgets')) {
        return {
          ok: true,
          json: async () => ({ budgets: [] })
        };
      }
      
      return { ok: false };
    });

    const { container, rerender } = render(
      <BudgetSummaryPanel year={2025} month={11} refreshTrigger={0} />
    );

    // Wait for initial load with $150 spent
    await waitFor(() => {
      expect(container.textContent).toContain('$150.00');
    });

    // Simulate expense deletion
    budgetSpent = 0;
    rerender(<BudgetSummaryPanel year={2025} month={11} refreshTrigger={1} />);

    // Verify budget updated to show $0 spent
    await waitFor(() => {
      expect(container.textContent).toContain('$0.00');
    });
  });

  it('should handle multiple rapid expense changes correctly', async () => {
    // Requirements: 2.4, 8.2
    let budgetSpent = 0;
    
    global.fetch = vi.fn(async (url) => {
      if (url.includes('/api/budgets/summary')) {
        return {
          ok: true,
          json: async () => ({
            totalBudgeted: 500,
            totalSpent: budgetSpent,
            remaining: 500 - budgetSpent,
            progress: (budgetSpent / 500) * 100,
            budgetsOnTrack: budgetSpent < 500 ? 1 : 0,
            totalBudgets: 1,
            categories: []
          })
        };
      }
      
      if (url.includes('/api/budgets')) {
        return {
          ok: true,
          json: async () => ({ budgets: [] })
        };
      }
      
      return { ok: false };
    });

    const { container, rerender } = render(
      <BudgetSummaryPanel year={2025} month={11} refreshTrigger={0} />
    );

    await waitFor(() => {
      expect(container.textContent).toContain('$0.00');
    });

    // Simulate three rapid expense additions
    budgetSpent = 50;
    rerender(<BudgetSummaryPanel year={2025} month={11} refreshTrigger={1} />);
    
    await waitFor(() => {
      expect(container.textContent).toContain('$50.00');
    });

    budgetSpent = 100;
    rerender(<BudgetSummaryPanel year={2025} month={11} refreshTrigger={2} />);
    
    await waitFor(() => {
      expect(container.textContent).toContain('$100.00');
    });

    budgetSpent = 150;
    rerender(<BudgetSummaryPanel year={2025} month={11} refreshTrigger={3} />);
    
    await waitFor(() => {
      expect(container.textContent).toContain('$150.00');
    });
  });
});
