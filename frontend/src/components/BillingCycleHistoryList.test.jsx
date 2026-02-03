import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import BillingCycleHistoryList from './BillingCycleHistoryList';

describe('BillingCycleHistoryList', () => {
  afterEach(() => {
    cleanup();
  });

  // Sample billing cycle data for testing
  const mockCycles = [
    {
      id: 1,
      cycle_start_date: '2025-01-16',
      cycle_end_date: '2025-02-15',
      actual_statement_balance: 1234.56,
      calculated_statement_balance: 1189.23,
      minimum_payment: 25.00,
      due_date: '2025-03-01',
      notes: 'Statement received via email',
      discrepancy: {
        amount: 45.33,
        type: 'higher',
        description: 'Actual balance is $45.33 higher than tracked'
      }
    },
    {
      id: 2,
      cycle_start_date: '2024-12-16',
      cycle_end_date: '2025-01-15',
      actual_statement_balance: 800.00,
      calculated_statement_balance: 850.00,
      minimum_payment: null,
      due_date: null,
      notes: null,
      discrepancy: {
        amount: -50.00,
        type: 'lower',
        description: 'Actual balance is $50.00 lower than tracked'
      }
    },
    {
      id: 3,
      cycle_start_date: '2024-11-16',
      cycle_end_date: '2024-12-15',
      actual_statement_balance: 500.00,
      calculated_statement_balance: 500.00,
      minimum_payment: 10.00,
      due_date: '2025-01-01',
      notes: null,
      discrepancy: {
        amount: 0,
        type: 'match',
        description: 'Tracking is accurate'
      }
    }
  ];

  /**
   * Test: Empty state rendering
   * **Validates: Requirements 5.4**
   */
  describe('Empty State', () => {
    it('should render empty state when cycles array is empty', () => {
      const { container } = render(<BillingCycleHistoryList cycles={[]} />);
      
      const emptyState = container.querySelector('.billing-cycle-list-empty');
      expect(emptyState).toBeTruthy();
      expect(emptyState.textContent).toContain('No billing cycle history');
      expect(emptyState.textContent).toContain('Enter your first statement balance');
    });

    it('should render empty state when cycles is undefined', () => {
      const { container } = render(<BillingCycleHistoryList />);
      
      const emptyState = container.querySelector('.billing-cycle-list-empty');
      expect(emptyState).toBeTruthy();
    });

    it('should render empty state when cycles is null', () => {
      const { container } = render(<BillingCycleHistoryList cycles={null} />);
      
      const emptyState = container.querySelector('.billing-cycle-list-empty');
      expect(emptyState).toBeTruthy();
    });

    it('should display empty icon in empty state', () => {
      const { container } = render(<BillingCycleHistoryList cycles={[]} />);
      
      const emptyIcon = container.querySelector('.empty-icon');
      expect(emptyIcon).toBeTruthy();
      expect(emptyIcon.textContent).toBe('📋');
    });
  });

  /**
   * Test: Loading state
   */
  describe('Loading State', () => {
    it('should render loading state when loading is true', () => {
      const { container } = render(<BillingCycleHistoryList loading={true} />);
      
      const loadingState = container.querySelector('.billing-cycle-list-loading');
      expect(loadingState).toBeTruthy();
      expect(loadingState.textContent).toContain('Loading');
    });
  });

  /**
   * Test: Error state
   */
  describe('Error State', () => {
    it('should render error state when error is provided', () => {
      const errorMessage = 'Failed to load billing cycles';
      const { container } = render(<BillingCycleHistoryList error={errorMessage} />);
      
      const errorState = container.querySelector('.billing-cycle-list-error');
      expect(errorState).toBeTruthy();
      expect(errorState.textContent).toBe(errorMessage);
    });
  });

  /**
   * Test: Discrepancy indicator styling
   * **Validates: Requirements 5.2, 5.3**
   */
  describe('Discrepancy Indicator Styling', () => {
    it('should apply discrepancy-higher class for positive discrepancy (orange)', () => {
      const { container } = render(<BillingCycleHistoryList cycles={[mockCycles[0]]} />);
      
      const discrepancyIndicator = container.querySelector('.cycle-discrepancy');
      expect(discrepancyIndicator).toBeTruthy();
      expect(discrepancyIndicator.classList.contains('discrepancy-higher')).toBe(true);
    });

    it('should apply discrepancy-lower class for negative discrepancy (blue)', () => {
      const { container } = render(<BillingCycleHistoryList cycles={[mockCycles[1]]} />);
      
      const discrepancyIndicator = container.querySelector('.cycle-discrepancy');
      expect(discrepancyIndicator).toBeTruthy();
      expect(discrepancyIndicator.classList.contains('discrepancy-lower')).toBe(true);
    });

    it('should apply discrepancy-match class for zero discrepancy (green)', () => {
      const { container } = render(<BillingCycleHistoryList cycles={[mockCycles[2]]} />);
      
      const discrepancyIndicator = container.querySelector('.cycle-discrepancy');
      expect(discrepancyIndicator).toBeTruthy();
      expect(discrepancyIndicator.classList.contains('discrepancy-match')).toBe(true);
    });

    it('should display up arrow icon for higher discrepancy', () => {
      const { container } = render(<BillingCycleHistoryList cycles={[mockCycles[0]]} />);
      
      const discrepancyIcon = container.querySelector('.discrepancy-icon');
      expect(discrepancyIcon).toBeTruthy();
      expect(discrepancyIcon.textContent).toBe('↑');
    });

    it('should display down arrow icon for lower discrepancy', () => {
      const { container } = render(<BillingCycleHistoryList cycles={[mockCycles[1]]} />);
      
      const discrepancyIcon = container.querySelector('.discrepancy-icon');
      expect(discrepancyIcon).toBeTruthy();
      expect(discrepancyIcon.textContent).toBe('↓');
    });

    it('should display checkmark icon for matching discrepancy', () => {
      const { container } = render(<BillingCycleHistoryList cycles={[mockCycles[2]]} />);
      
      const discrepancyIcon = container.querySelector('.discrepancy-icon');
      expect(discrepancyIcon).toBeTruthy();
      expect(discrepancyIcon.textContent).toBe('✓');
    });

    it('should display positive discrepancy amount with plus sign', () => {
      const { container } = render(<BillingCycleHistoryList cycles={[mockCycles[0]]} />);
      
      const discrepancyAmount = container.querySelector('.discrepancy-amount');
      expect(discrepancyAmount).toBeTruthy();
      expect(discrepancyAmount.textContent).toContain('+');
    });

    it('should display negative discrepancy amount without plus sign', () => {
      const { container } = render(<BillingCycleHistoryList cycles={[mockCycles[1]]} />);
      
      const discrepancyAmount = container.querySelector('.discrepancy-amount');
      expect(discrepancyAmount).toBeTruthy();
      expect(discrepancyAmount.textContent).not.toContain('+');
    });
  });

  /**
   * Test: Cycle data display
   * **Validates: Requirements 5.2**
   */
  describe('Cycle Data Display', () => {
    it('should display cycle dates', () => {
      const { container } = render(<BillingCycleHistoryList cycles={[mockCycles[0]]} />);
      
      const cycleDates = container.querySelector('.cycle-dates');
      expect(cycleDates).toBeTruthy();
      // Check that dates are formatted and displayed
      expect(cycleDates.textContent).toContain('2025');
    });

    it('should display actual balance', () => {
      const { container } = render(<BillingCycleHistoryList cycles={[mockCycles[0]]} />);
      
      const actualRow = container.querySelector('.balance-row.actual');
      expect(actualRow).toBeTruthy();
      expect(actualRow.textContent).toContain('Actual');
    });

    it('should display calculated balance', () => {
      const { container } = render(<BillingCycleHistoryList cycles={[mockCycles[0]]} />);
      
      const calculatedRow = container.querySelector('.balance-row.calculated');
      expect(calculatedRow).toBeTruthy();
      expect(calculatedRow.textContent).toContain('Calculated');
    });

    it('should display minimum payment when provided', () => {
      const { container } = render(<BillingCycleHistoryList cycles={[mockCycles[0]]} />);
      
      const details = container.querySelector('.cycle-details');
      expect(details).toBeTruthy();
      expect(details.textContent).toContain('Min');
    });

    it('should display due date when provided', () => {
      const { container } = render(<BillingCycleHistoryList cycles={[mockCycles[0]]} />);
      
      const details = container.querySelector('.cycle-details');
      expect(details).toBeTruthy();
      expect(details.textContent).toContain('Due');
    });

    it('should not display details section when minimum_payment and due_date are null', () => {
      const cycleWithoutDetails = {
        ...mockCycles[1],
        minimum_payment: null,
        due_date: null
      };
      const { container } = render(<BillingCycleHistoryList cycles={[cycleWithoutDetails]} />);
      
      const details = container.querySelector('.cycle-details');
      expect(details).toBeFalsy();
    });

    it('should display notes when provided', () => {
      const { container } = render(<BillingCycleHistoryList cycles={[mockCycles[0]]} />);
      
      const notes = container.querySelector('.cycle-notes');
      expect(notes).toBeTruthy();
      expect(notes.textContent).toBe('Statement received via email');
    });

    it('should not display notes section when notes is null', () => {
      const { container } = render(<BillingCycleHistoryList cycles={[mockCycles[1]]} />);
      
      const notes = container.querySelector('.cycle-notes');
      expect(notes).toBeFalsy();
    });

    it('should render multiple cycles', () => {
      const { container } = render(<BillingCycleHistoryList cycles={mockCycles} />);
      
      const items = container.querySelectorAll('.billing-cycle-item');
      expect(items.length).toBe(3);
    });
  });

  /**
   * Test: Edit and Delete actions
   */
  describe('Edit and Delete Actions', () => {
    it('should call onEdit when edit button is clicked', async () => {
      const onEditMock = vi.fn();
      const { container } = render(
        <BillingCycleHistoryList cycles={[mockCycles[0]]} onEdit={onEditMock} />
      );
      
      const editButton = container.querySelector('.cycle-action-btn.edit');
      expect(editButton).toBeTruthy();
      
      await act(async () => {
        fireEvent.click(editButton);
      });
      
      expect(onEditMock).toHaveBeenCalledWith(mockCycles[0]);
    });

    it('should show delete confirmation dialog when delete button is clicked', async () => {
      const { container } = render(<BillingCycleHistoryList cycles={[mockCycles[0]]} />);
      
      const deleteButton = container.querySelector('.cycle-action-btn.delete');
      expect(deleteButton).toBeTruthy();
      
      await act(async () => {
        fireEvent.click(deleteButton);
      });
      
      const confirmDialog = container.querySelector('.billing-cycle-confirm-dialog');
      expect(confirmDialog).toBeTruthy();
      expect(confirmDialog.textContent).toContain('Delete Billing Cycle');
    });

    it('should call onDelete when delete is confirmed', async () => {
      const onDeleteMock = vi.fn();
      const { container } = render(
        <BillingCycleHistoryList cycles={[mockCycles[0]]} onDelete={onDeleteMock} />
      );
      
      // Click delete button
      const deleteButton = container.querySelector('.cycle-action-btn.delete');
      await act(async () => {
        fireEvent.click(deleteButton);
      });
      
      // Click confirm button
      const confirmButton = container.querySelector('.confirm-delete-btn');
      await act(async () => {
        fireEvent.click(confirmButton);
      });
      
      expect(onDeleteMock).toHaveBeenCalledWith(mockCycles[0]);
    });

    it('should close confirmation dialog when cancel is clicked', async () => {
      const { container } = render(<BillingCycleHistoryList cycles={[mockCycles[0]]} />);
      
      // Click delete button
      const deleteButton = container.querySelector('.cycle-action-btn.delete');
      await act(async () => {
        fireEvent.click(deleteButton);
      });
      
      // Verify dialog is shown
      let confirmDialog = container.querySelector('.billing-cycle-confirm-dialog');
      expect(confirmDialog).toBeTruthy();
      
      // Click cancel button
      const cancelButton = container.querySelector('.confirm-cancel-btn');
      await act(async () => {
        fireEvent.click(cancelButton);
      });
      
      // Verify dialog is closed
      confirmDialog = container.querySelector('.billing-cycle-confirm-dialog');
      expect(confirmDialog).toBeFalsy();
    });

    it('should not call onDelete when cancel is clicked', async () => {
      const onDeleteMock = vi.fn();
      const { container } = render(
        <BillingCycleHistoryList cycles={[mockCycles[0]]} onDelete={onDeleteMock} />
      );
      
      // Click delete button
      const deleteButton = container.querySelector('.cycle-action-btn.delete');
      await act(async () => {
        fireEvent.click(deleteButton);
      });
      
      // Click cancel button
      const cancelButton = container.querySelector('.confirm-cancel-btn');
      await act(async () => {
        fireEvent.click(cancelButton);
      });
      
      expect(onDeleteMock).not.toHaveBeenCalled();
    });
  });

  /**
   * Test: Custom formatters
   */
  describe('Custom Formatters', () => {
    it('should use custom formatCurrency function', () => {
      const customFormatCurrency = (value) => `$${value.toFixed(2)} USD`;
      const { container } = render(
        <BillingCycleHistoryList 
          cycles={[mockCycles[0]]} 
          formatCurrency={customFormatCurrency}
        />
      );
      
      const balanceValue = container.querySelector('.balance-row.actual .balance-value');
      expect(balanceValue.textContent).toContain('USD');
    });

    it('should use custom formatDate function', () => {
      const customFormatDate = (dateString) => `Custom: ${dateString}`;
      const { container } = render(
        <BillingCycleHistoryList 
          cycles={[mockCycles[0]]} 
          formatDate={customFormatDate}
        />
      );
      
      const cycleDates = container.querySelector('.cycle-dates');
      expect(cycleDates.textContent).toContain('Custom:');
    });
  });

  /**
   * Test: Accessibility
   */
  describe('Accessibility', () => {
    it('should have accessible edit button with aria-label', () => {
      const { container } = render(<BillingCycleHistoryList cycles={[mockCycles[0]]} />);
      
      const editButton = container.querySelector('.cycle-action-btn.edit');
      expect(editButton.getAttribute('aria-label')).toContain('Edit billing cycle');
    });

    it('should have accessible delete button with aria-label', () => {
      const { container } = render(<BillingCycleHistoryList cycles={[mockCycles[0]]} />);
      
      const deleteButton = container.querySelector('.cycle-action-btn.delete');
      expect(deleteButton.getAttribute('aria-label')).toContain('Delete billing cycle');
    });

    it('should have title attributes on action buttons', () => {
      const { container } = render(<BillingCycleHistoryList cycles={[mockCycles[0]]} />);
      
      const editButton = container.querySelector('.cycle-action-btn.edit');
      const deleteButton = container.querySelector('.cycle-action-btn.delete');
      
      expect(editButton.getAttribute('title')).toBe('Edit billing cycle');
      expect(deleteButton.getAttribute('title')).toBe('Delete billing cycle');
    });
  });
});
