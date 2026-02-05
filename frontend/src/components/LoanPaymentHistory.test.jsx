import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoanPaymentHistory from './LoanPaymentHistory';

describe('LoanPaymentHistory', () => {
  const mockPayments = [
    { id: 1, amount: 500, payment_date: '2026-02-01', notes: 'February payment' },
    { id: 2, amount: 500, payment_date: '2026-01-15', notes: 'January payment' },
    { id: 3, amount: 600, payment_date: '2025-12-20', notes: null }
  ];

  const defaultProps = {
    payments: mockPayments,
    initialBalance: 10000,
    loading: false,
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    disabled: false
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test component renders with payment history
   * Requirements: 1.2, 6.2
   */
  it('should render payment history table with all payments', () => {
    render(<LoanPaymentHistory {...defaultProps} />);

    expect(screen.getByText('Payment History')).toBeInTheDocument();
    // Check that all 3 payments are rendered (dates may vary by timezone)
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBe(4); // 1 header + 3 data rows
    expect(screen.getByText('February payment')).toBeInTheDocument();
    expect(screen.getByText('January payment')).toBeInTheDocument();
  });

  /**
   * Test payments are displayed in reverse chronological order
   * Requirements: 1.2
   */
  it('should display payments in reverse chronological order (newest first)', () => {
    render(<LoanPaymentHistory {...defaultProps} />);

    const rows = screen.getAllByRole('row');
    // First row is header, so data rows start at index 1
    // Check that notes appear in the expected order (newest first)
    const notesTexts = rows.slice(1).map(row => {
      const notesCell = row.querySelector('.notes-cell');
      return notesCell?.textContent?.trim();
    });
    
    expect(notesTexts[0]).toBe('February payment');
    expect(notesTexts[1]).toBe('January payment');
    expect(notesTexts[2]).toBe('—'); // No notes for Dec payment
  });

  /**
   * Test running balance calculation
   * Requirements: 6.2
   * Property 14: Running Balance in Payment History
   */
  it('should calculate and display correct running balance after each payment', () => {
    render(<LoanPaymentHistory {...defaultProps} />);

    // Initial balance: 10000
    // Payments in chronological order: 600 (Dec), 500 (Jan), 500 (Feb)
    // Running balances: 9400, 8900, 8400
    // Displayed in reverse order: 8400, 8900, 9400
    
    const balanceCells = screen.getAllByText(/\$[\d,]+\.\d{2}/).filter(
      el => el.classList.contains('running-balance')
    );
    
    // Newest payment (Feb) should show balance of 8400
    expect(balanceCells[0].textContent).toBe('$8,400.00');
    // Jan payment should show balance of 8900
    expect(balanceCells[1].textContent).toBe('$8,900.00');
    // Dec payment should show balance of 9400
    expect(balanceCells[2].textContent).toBe('$9,400.00');
  });

  /**
   * Test payment amounts are displayed correctly
   * Requirements: 6.2
   */
  it('should display payment amounts with negative sign', () => {
    render(<LoanPaymentHistory {...defaultProps} />);

    const amountCells = screen.getAllByText(/-\$[\d,]+\.\d{2}/);
    expect(amountCells.length).toBe(3);
    expect(amountCells[0].textContent).toBe('-$500.00');
    expect(amountCells[1].textContent).toBe('-$500.00');
    expect(amountCells[2].textContent).toBe('-$600.00');
  });

  /**
   * Test notes display
   * Requirements: 6.2
   */
  it('should display notes when available', () => {
    render(<LoanPaymentHistory {...defaultProps} />);

    expect(screen.getByText('February payment')).toBeInTheDocument();
    expect(screen.getByText('January payment')).toBeInTheDocument();
    // Third payment has no notes, should show dash
    const noNotes = screen.getAllByText('—');
    expect(noNotes.length).toBeGreaterThan(0);
  });

  /**
   * Test edit button functionality
   * Requirements: 6.2
   */
  it('should call onEdit when edit button is clicked', () => {
    const mockOnEdit = vi.fn();
    render(<LoanPaymentHistory {...defaultProps} onEdit={mockOnEdit} />);

    const editButtons = screen.getAllByTitle('Edit payment');
    fireEvent.click(editButtons[0]);

    // The payment passed to onEdit will include runningBalance
    expect(mockOnEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        amount: 500,
        payment_date: '2026-02-01',
        notes: 'February payment'
      })
    );
  });

  /**
   * Test delete button functionality with confirmation
   * Requirements: 6.2
   */
  it('should call onDelete when delete is confirmed', async () => {
    const mockOnDelete = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<LoanPaymentHistory {...defaultProps} onDelete={mockOnDelete} />);

    const deleteButtons = screen.getAllByTitle('Delete payment');
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(mockOnDelete).toHaveBeenCalledWith(1);
    });
  });

  /**
   * Test delete cancellation
   * Requirements: 6.2
   */
  it('should not call onDelete when delete is cancelled', () => {
    const mockOnDelete = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<LoanPaymentHistory {...defaultProps} onDelete={mockOnDelete} />);

    const deleteButtons = screen.getAllByTitle('Delete payment');
    fireEvent.click(deleteButtons[0]);

    expect(mockOnDelete).not.toHaveBeenCalled();
  });

  /**
   * Test empty state
   * Requirements: 6.2
   */
  it('should display empty state when no payments', () => {
    render(<LoanPaymentHistory {...defaultProps} payments={[]} />);

    expect(screen.getByText('No payments recorded yet.')).toBeInTheDocument();
    expect(screen.getByText('Use the form above to log your first payment.')).toBeInTheDocument();
  });

  /**
   * Test loading state
   * Requirements: 6.2
   */
  it('should display loading state', () => {
    render(<LoanPaymentHistory {...defaultProps} payments={[]} loading={true} />);

    expect(screen.getByText('Loading payment history...')).toBeInTheDocument();
  });

  /**
   * Test summary display
   * Requirements: 6.2
   */
  it('should display total payments and current balance in summary', () => {
    render(<LoanPaymentHistory {...defaultProps} />);

    // Total payments: 500 + 500 + 600 = 1600
    expect(screen.getByText('$1,600.00')).toBeInTheDocument();
    // Current balance: 10000 - 1600 = 8400 (appears in both summary and table)
    const balanceElements = screen.getAllByText('$8,400.00');
    expect(balanceElements.length).toBeGreaterThanOrEqual(1);
  });

  /**
   * Test payment count display
   * Requirements: 6.2
   */
  it('should display payment count in footer', () => {
    render(<LoanPaymentHistory {...defaultProps} />);

    expect(screen.getByText('3 payments recorded')).toBeInTheDocument();
  });

  /**
   * Test singular payment count
   * Requirements: 6.2
   */
  it('should display singular payment count for one payment', () => {
    render(<LoanPaymentHistory {...defaultProps} payments={[mockPayments[0]]} />);

    expect(screen.getByText('1 payment recorded')).toBeInTheDocument();
  });

  /**
   * Test disabled state
   * Requirements: 6.2
   */
  it('should disable buttons when disabled prop is true', () => {
    render(<LoanPaymentHistory {...defaultProps} disabled={true} />);

    const editButtons = screen.getAllByTitle('Edit payment');
    const deleteButtons = screen.getAllByTitle('Delete payment');

    editButtons.forEach(btn => expect(btn).toBeDisabled());
    deleteButtons.forEach(btn => expect(btn).toBeDisabled());
  });

  /**
   * Test running balance clamps to zero
   * Requirements: 6.2
   */
  it('should clamp running balance to zero when payments exceed initial balance', () => {
    const largePayments = [
      { id: 1, amount: 6000, payment_date: '2026-02-01', notes: null },
      { id: 2, amount: 5000, payment_date: '2026-01-15', notes: null }
    ];

    render(
      <LoanPaymentHistory
        {...defaultProps}
        payments={largePayments}
        initialBalance={10000}
      />
    );

    // Initial: 10000, after 5000: 5000, after 6000: -1000 -> clamped to 0
    const balanceCells = screen.getAllByText(/\$[\d,]+\.\d{2}/).filter(
      el => el.classList.contains('running-balance')
    );
    
    // Newest payment should show $0.00 (clamped)
    expect(balanceCells[0].textContent).toBe('$0.00');
    // Older payment should show $5,000.00
    expect(balanceCells[1].textContent).toBe('$5,000.00');
  });

  /**
   * Test accessibility - edit button aria-label
   * Requirements: 6.2
   */
  it('should have accessible edit button labels', () => {
    render(<LoanPaymentHistory {...defaultProps} />);

    // Check that edit buttons have aria-labels (date format may vary)
    const editButtons = screen.getAllByTitle('Edit payment');
    expect(editButtons.length).toBe(3);
    editButtons.forEach(btn => {
      expect(btn).toHaveAttribute('aria-label');
      expect(btn.getAttribute('aria-label')).toMatch(/Edit payment from/);
    });
  });

  /**
   * Test accessibility - delete button aria-label
   * Requirements: 6.2
   */
  it('should have accessible delete button labels', () => {
    render(<LoanPaymentHistory {...defaultProps} />);

    // Check that delete buttons have aria-labels (date format may vary)
    const deleteButtons = screen.getAllByTitle('Delete payment');
    expect(deleteButtons.length).toBe(3);
    deleteButtons.forEach(btn => {
      expect(btn).toHaveAttribute('aria-label');
      expect(btn.getAttribute('aria-label')).toMatch(/Delete payment from/);
    });
  });
});
