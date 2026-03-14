import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import UnifiedBillingCycleList from './UnifiedBillingCycleList';

describe('UnifiedBillingCycleList', () => {
  afterEach(() => {
    cleanup();
  });

  // Sample unified billing cycle data for testing
  const mockCycles = [
    {
      id: 1,
      payment_method_id: 4,
      cycle_start_date: '2025-01-16',
      cycle_end_date: '2025-02-15',
      actual_statement_balance: 1234.56,
      calculated_statement_balance: 1189.23,
      effective_balance: 1234.56,
      balance_type: 'actual',
      transaction_count: 23,
      trend_indicator: {
        type: 'higher',
        icon: '↑',
        amount: 145.33,
        cssClass: 'trend-higher'
      },
      minimum_payment: 25.00,
      due_date: '2025-03-01',
      notes: 'Statement received via email',
      statement_pdf_path: '/statements/2025-02.pdf'
    },
    {
      id: 2,
      payment_method_id: 4,
      cycle_start_date: '2024-12-16',
      cycle_end_date: '2025-01-15',
      actual_statement_balance: null,
      calculated_statement_balance: 1089.23,
      effective_balance: 1089.23,
      balance_type: 'calculated',
      transaction_count: 18,
      trend_indicator: {
        type: 'lower',
        icon: '↓',
        amount: 210.77,
        cssClass: 'trend-lower'
      },
      minimum_payment: null,
      due_date: null,
      notes: null,
      statement_pdf_path: null
    },
    {
      id: 3,
      payment_method_id: 4,
      cycle_start_date: '2024-11-16',
      cycle_end_date: '2024-12-15',
      actual_statement_balance: 1300.00,
      calculated_statement_balance: 1300.50,
      effective_balance: 1300.00,
      balance_type: 'actual',
      transaction_count: 15,
      trend_indicator: {
        type: 'same',
        icon: '✓',
        amount: 0,
        cssClass: 'trend-same'
      },
      minimum_payment: 15.00,
      due_date: '2025-01-01',
      notes: null,
      statement_pdf_path: null
    },
    {
      id: 4,
      payment_method_id: 4,
      cycle_start_date: '2024-10-16',
      cycle_end_date: '2024-11-15',
      actual_statement_balance: null,
      calculated_statement_balance: 1300.00,
      effective_balance: 1300.00,
      balance_type: 'calculated',
      transaction_count: 20,
      trend_indicator: null, // No previous cycle
      minimum_payment: null,
      due_date: null,
      notes: null,
      statement_pdf_path: null
    }
  ];

  /**
   * Test: Empty state rendering
   * **Validates: Requirements 6.1**
   */
  describe('Empty State', () => {
    it('should render empty state when cycles array is empty', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[]} />);
      
      const emptyState = container.querySelector('.unified-billing-cycle-list-empty');
      expect(emptyState).toBeTruthy();
      expect(emptyState.textContent).toContain('No billing cycles');
    });

    it('should render empty state when cycles is undefined', () => {
      const { container } = render(<UnifiedBillingCycleList />);
      
      const emptyState = container.querySelector('.unified-billing-cycle-list-empty');
      expect(emptyState).toBeTruthy();
    });

    it('should render empty state when cycles is null', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={null} />);
      
      const emptyState = container.querySelector('.unified-billing-cycle-list-empty');
      expect(emptyState).toBeTruthy();
    });

    it('should display empty icon in empty state', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[]} />);
      
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
      const { container } = render(<UnifiedBillingCycleList loading={true} />);
      
      const loadingState = container.querySelector('.unified-billing-cycle-list-loading');
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
      const { container } = render(<UnifiedBillingCycleList error={errorMessage} />);
      
      const errorState = container.querySelector('.unified-billing-cycle-list-error');
      expect(errorState).toBeTruthy();
      expect(errorState.textContent).toBe(errorMessage);
    });
  });

  /**
   * Test: Discrepancy rendering for actual-balance cycles
   * **Validates: Requirements 5.1, 5.2, 5.3**
   */
  describe('Discrepancy Rendering', () => {
    it('should show discrepancy for actual-balance cycles', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[0]]} />);
      
      const discrepancy = container.querySelector('.unified-cycle-discrepancy');
      expect(discrepancy).toBeTruthy();
    });

    it('should not show discrepancy for calculated-balance cycles', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[1]]} />);
      
      const discrepancy = container.querySelector('.unified-cycle-discrepancy');
      expect(discrepancy).toBeFalsy();
    });

    it('should show "✓ Match" when actual equals calculated balance', () => {
      const matchCycle = {
        ...mockCycles[2],
        actual_statement_balance: 1300.00,
        calculated_statement_balance: 1300.00,
      };
      const { container } = render(<UnifiedBillingCycleList cycles={[matchCycle]} />);
      
      const discrepancy = container.querySelector('.unified-cycle-discrepancy.discrepancy-match');
      expect(discrepancy).toBeTruthy();
      expect(discrepancy.querySelector('.discrepancy-icon').textContent).toBe('✓');
      expect(discrepancy.querySelector('.discrepancy-amount').textContent).toBe('Match');
    });

    it('should show higher discrepancy when actual > calculated', () => {
      // mockCycles[0]: actual=1234.56, calculated=1189.23 → higher
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[0]]} />);
      
      const discrepancy = container.querySelector('.unified-cycle-discrepancy.discrepancy-higher');
      expect(discrepancy).toBeTruthy();
      expect(discrepancy.querySelector('.discrepancy-icon').textContent).toBe('↑');
    });

    it('should not render any trend indicator elements', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={mockCycles} />);
      
      expect(container.querySelector('.unified-trend-indicator')).toBeFalsy();
      expect(container.querySelector('.unified-trend-icon')).toBeFalsy();
      expect(container.querySelector('.unified-trend-amount')).toBeFalsy();
    });
  });

  /**
   * Test: Balance type indicator display
   * **Validates: Requirements 4.3**
   */
  describe('Balance Type Indicator Display', () => {
    it('should display "Actual" badge for actual balance type', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[0]]} />);
      
      const balanceType = container.querySelector('.unified-balance-type.actual');
      expect(balanceType).toBeTruthy();
      expect(balanceType.textContent).toBe('Actual');
    });

    it('should display "Calculated" badge for calculated balance type', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[1]]} />);
      
      const balanceType = container.querySelector('.unified-balance-type.calculated');
      expect(balanceType).toBeTruthy();
      expect(balanceType.textContent).toBe('Calculated');
    });

    it('should display effective balance value', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[0]]} />);
      
      const balanceValue = container.querySelector('.unified-balance-value');
      expect(balanceValue).toBeTruthy();
      expect(balanceValue.textContent).toContain('1,234.56');
    });
  });

  /**
   * Test: Transaction count display
   * **Validates: Requirements 3.1, 3.3**
   */
  describe('Transaction Count Display', () => {
    it('should display transaction count', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[0]]} />);
      
      const transactionCount = container.querySelector('.unified-transaction-count');
      expect(transactionCount).toBeTruthy();
      expect(transactionCount.textContent).toContain('23');
      expect(transactionCount.textContent).toContain('transactions');
    });

    it('should use singular "transaction" for count of 1', () => {
      const singleTransactionCycle = {
        ...mockCycles[0],
        transaction_count: 1
      };
      const { container } = render(<UnifiedBillingCycleList cycles={[singleTransactionCycle]} />);
      
      const transactionCount = container.querySelector('.unified-transaction-count');
      expect(transactionCount.textContent).toContain('1 transaction');
      expect(transactionCount.textContent).not.toContain('transactions');
    });

    it('should display 0 transactions correctly', () => {
      const zeroTransactionCycle = {
        ...mockCycles[0],
        transaction_count: 0
      };
      const { container } = render(<UnifiedBillingCycleList cycles={[zeroTransactionCycle]} />);
      
      const transactionCount = container.querySelector('.unified-transaction-count');
      expect(transactionCount.textContent).toContain('0 transactions');
    });
  });

  /**
   * Test: Cycle data display
   * **Validates: Requirements 6.1, 6.2**
   */
  describe('Cycle Data Display', () => {
    it('should display cycle dates', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[0]]} />);
      
      const cycleDates = container.querySelector('.unified-cycle-dates');
      expect(cycleDates).toBeTruthy();
      expect(cycleDates.textContent).toContain('2025');
    });

    it('should display minimum payment when provided', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[0]]} />);
      
      const details = container.querySelector('.unified-cycle-details');
      expect(details).toBeTruthy();
      expect(details.textContent).toContain('Min');
    });

    it('should display due date when provided', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[0]]} />);
      
      const details = container.querySelector('.unified-cycle-details');
      expect(details).toBeTruthy();
      expect(details.textContent).toContain('Due');
    });

    it('should not display details section when minimum_payment and due_date are null', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[1]]} />);
      
      const details = container.querySelector('.unified-cycle-details');
      expect(details).toBeFalsy();
    });

    it('should display notes when provided', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[0]]} />);
      
      const notes = container.querySelector('.unified-cycle-notes');
      expect(notes).toBeTruthy();
      expect(notes.textContent).toBe('Statement received via email');
    });

    it('should not display notes section when notes is null', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[1]]} />);
      
      const notes = container.querySelector('.unified-cycle-notes');
      expect(notes).toBeFalsy();
    });

    it('should render multiple cycles', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={mockCycles} />);
      
      const items = container.querySelectorAll('.unified-billing-cycle-item');
      expect(items.length).toBe(4);
    });

    it('should display PDF button when statement_pdf_path exists', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[0]]} />);
      
      const pdfButton = container.querySelector('.unified-cycle-pdf-btn');
      expect(pdfButton).toBeTruthy();
    });

    it('should not display PDF button when statement_pdf_path is null', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[1]]} />);
      
      const pdfButton = container.querySelector('.unified-cycle-pdf-btn');
      expect(pdfButton).toBeFalsy();
    });
  });

  /**
   * Test: Action buttons based on actual_statement_balance
   * **Validates: Requirements 6.3, 6.4**
   */
  describe('Action Buttons Based on Actual Balance', () => {
    it('should show edit and delete buttons for all cycles', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[0]]} />);
      
      const editButton = container.querySelector('.financial-action-btn-secondary');
      const deleteButton = container.querySelector('.financial-action-btn-danger');
      
      expect(editButton).toBeTruthy();
      expect(deleteButton).toBeTruthy();
    });

    it('should show edit and delete buttons for calculated cycles too', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[1]]} />);
      
      const editButton = container.querySelector('.financial-action-btn-secondary');
      const deleteButton = container.querySelector('.financial-action-btn-danger');
      
      expect(editButton).toBeTruthy();
      expect(deleteButton).toBeTruthy();
    });

    it('should call onEnterStatement when edit button is clicked on calculated cycle', async () => {
      const onEnterStatementMock = vi.fn();
      const { container } = render(
        <UnifiedBillingCycleList cycles={[mockCycles[1]]} onEnterStatement={onEnterStatementMock} />
      );
      
      const editButton = container.querySelector('.financial-action-btn-secondary');
      expect(editButton).toBeTruthy();
      
      await act(async () => {
        fireEvent.click(editButton);
      });
      
      expect(onEnterStatementMock).toHaveBeenCalledWith(mockCycles[1]);
    });

    it('should call onEdit when edit button is clicked on actual cycle', async () => {
      const onEditMock = vi.fn();
      const { container } = render(
        <UnifiedBillingCycleList cycles={[mockCycles[0]]} onEdit={onEditMock} />
      );
      
      const editButton = container.querySelector('.financial-action-btn-secondary');
      expect(editButton).toBeTruthy();
      
      await act(async () => {
        fireEvent.click(editButton);
      });
      
      expect(onEditMock).toHaveBeenCalledWith(mockCycles[0]);
    });

    it('should show delete confirmation dialog when delete button is clicked', async () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[0]]} />);
      
      const deleteButton = container.querySelector('.financial-action-btn-danger');
      expect(deleteButton).toBeTruthy();
      
      await act(async () => {
        fireEvent.click(deleteButton);
      });
      
      const confirmDialog = container.querySelector('.unified-billing-cycle-confirm-dialog');
      expect(confirmDialog).toBeTruthy();
      expect(confirmDialog.textContent).toContain('Delete Billing Cycle');
    });

    it('should call onDelete when delete is confirmed', async () => {
      const onDeleteMock = vi.fn();
      const { container } = render(
        <UnifiedBillingCycleList cycles={[mockCycles[0]]} onDelete={onDeleteMock} />
      );
      
      // Click delete button
      const deleteButton = container.querySelector('.financial-action-btn-danger');
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
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[0]]} />);
      
      // Click delete button
      const deleteButton = container.querySelector('.financial-action-btn-danger');
      await act(async () => {
        fireEvent.click(deleteButton);
      });
      
      // Verify dialog is shown
      let confirmDialog = container.querySelector('.unified-billing-cycle-confirm-dialog');
      expect(confirmDialog).toBeTruthy();
      
      // Click cancel button
      const cancelButton = container.querySelector('.confirm-cancel-btn');
      await act(async () => {
        fireEvent.click(cancelButton);
      });
      
      // Verify dialog is closed
      confirmDialog = container.querySelector('.unified-billing-cycle-confirm-dialog');
      expect(confirmDialog).toBeFalsy();
    });
  });

  /**
   * Test: Custom formatters
   */
  describe('Custom Formatters', () => {
    it('should use custom formatCurrency function', () => {
      const customFormatCurrency = (value) => `${value.toFixed(2)} USD`;
      const { container } = render(
        <UnifiedBillingCycleList 
          cycles={[mockCycles[0]]} 
          formatCurrency={customFormatCurrency}
        />
      );
      
      const balanceValue = container.querySelector('.unified-balance-value');
      expect(balanceValue.textContent).toContain('USD');
    });

    it('should use custom formatDate function', () => {
      const customFormatDate = (dateString) => `Custom: ${dateString}`;
      const { container } = render(
        <UnifiedBillingCycleList 
          cycles={[mockCycles[0]]} 
          formatDate={customFormatDate}
        />
      );
      
      const cycleDates = container.querySelector('.unified-cycle-dates');
      expect(cycleDates.textContent).toContain('Custom:');
    });
  });

  /**
   * Test: Accessibility
   */
  describe('Accessibility', () => {
    it('should have accessible edit button with aria-label', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[0]]} />);
      
      const editButton = container.querySelector('.financial-action-btn-secondary');
      expect(editButton.getAttribute('aria-label')).toContain('Edit billing cycle');
    });

    it('should have accessible delete button with aria-label', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[0]]} />);
      
      const deleteButton = container.querySelector('.financial-action-btn-danger');
      expect(deleteButton.getAttribute('aria-label')).toContain('Delete billing cycle');
    });

    it('should have accessible edit button for calculated cycles with aria-label', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[1]]} />);
      
      const editButton = container.querySelector('.financial-action-btn-secondary');
      expect(editButton.getAttribute('aria-label')).toContain('Enter statement');
    });

    it('should have title attributes on action buttons', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[0]]} />);
      
      const editButton = container.querySelector('.financial-action-btn-secondary');
      const deleteButton = container.querySelector('.financial-action-btn-danger');
      
      expect(editButton.getAttribute('title')).toBe('Edit billing cycle');
      expect(deleteButton.getAttribute('title')).toBe('Delete billing cycle');
    });

    it('should have accessible PDF button with aria-label', () => {
      const { container } = render(<UnifiedBillingCycleList cycles={[mockCycles[0]]} />);
      
      const pdfButton = container.querySelector('.unified-cycle-pdf-btn');
      expect(pdfButton.getAttribute('aria-label')).toContain('View PDF');
    });
  });

  /**
   * Test: PDF view callback
   */
  describe('PDF View Callback', () => {
    it('should call onViewPdf when PDF button is clicked', async () => {
      const onViewPdfMock = vi.fn();
      const { container } = render(
        <UnifiedBillingCycleList cycles={[mockCycles[0]]} onViewPdf={onViewPdfMock} />
      );
      
      const pdfButton = container.querySelector('.unified-cycle-pdf-btn');
      expect(pdfButton).toBeTruthy();
      
      await act(async () => {
        fireEvent.click(pdfButton);
      });
      
      expect(onViewPdfMock).toHaveBeenCalledWith(mockCycles[0]);
    });
  });
});
