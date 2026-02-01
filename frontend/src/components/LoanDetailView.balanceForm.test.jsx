import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoanDetailView from './LoanDetailView';
import * as loanApi from '../services/loanApi';
import * as loanBalanceApi from '../services/loanBalanceApi';

// Mock the APIs
vi.mock('../services/loanApi', () => ({
  updateLoan: vi.fn(),
  markPaidOff: vi.fn()
}));

vi.mock('../services/loanBalanceApi', () => ({
  getBalanceHistory: vi.fn(),
  createOrUpdateBalance: vi.fn(),
  deleteBalance: vi.fn()
}));

describe('LoanDetailView Balance Entry Form - Fixed Interest Rate', () => {
  const mockOnClose = vi.fn();
  const mockOnUpdate = vi.fn();

  // Loan with fixed interest rate
  const fixedRateLoan = {
    id: 1,
    name: 'Car Loan',
    initial_balance: 20000,
    start_date: '2023-01-15',
    loan_type: 'loan',
    is_paid_off: false,
    currentBalance: 15000,
    currentRate: 5.5,
    fixed_interest_rate: 5.5,
    notes: 'Test note'
  };

  // Loan without fixed interest rate (variable rate)
  const variableRateLoan = {
    id: 2,
    name: 'Personal Loan',
    initial_balance: 10000,
    start_date: '2023-06-01',
    loan_type: 'loan',
    is_paid_off: false,
    currentBalance: 8000,
    currentRate: 6.0,
    fixed_interest_rate: null,
    notes: null
  };

  const mockBalanceHistory = [
    {
      id: 1,
      loan_id: 1,
      year: 2024,
      month: 1,
      remaining_balance: 15000,
      rate: 5.5,
      balanceChange: -500,
      rateChange: 0
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    loanBalanceApi.getBalanceHistory.mockResolvedValue(mockBalanceHistory);
    loanBalanceApi.createOrUpdateBalance.mockResolvedValue({ id: 2 });
  });

  // Helper to find input by label text within the form
  const findInputByLabel = (container, labelText) => {
    const labels = container.querySelectorAll('label');
    for (const label of labels) {
      if (label.textContent.includes(labelText)) {
        const inputGroup = label.closest('.balance-input-group');
        if (inputGroup) {
          return inputGroup.querySelector('input');
        }
      }
    }
    return null;
  };

  describe('Conditional Rendering of Rate Input', () => {
    it('hides rate input when loan has fixed_interest_rate', async () => {
      const { container } = render(
        <LoanDetailView
          loan={fixedRateLoan}
          isOpen={true}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Balance History')).toBeInTheDocument();
      });

      // Click Add Balance Entry button
      fireEvent.click(screen.getByText('+ Add Balance Entry'));

      // Rate input should NOT be visible
      expect(screen.queryByText('Interest Rate (%) *')).not.toBeInTheDocument();
      
      // Balance input should still be visible
      expect(screen.getByText('Remaining Balance *')).toBeInTheDocument();
    });

    it('shows rate input when loan does not have fixed_interest_rate', async () => {
      render(
        <LoanDetailView
          loan={variableRateLoan}
          isOpen={true}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Balance History')).toBeInTheDocument();
      });

      // Click Add Balance Entry button
      fireEvent.click(screen.getByText('+ Add Balance Entry'));

      // Rate input should be visible
      expect(screen.getByText('Interest Rate (%) *')).toBeInTheDocument();
      
      // Balance input should also be visible
      expect(screen.getByText('Remaining Balance *')).toBeInTheDocument();
    });
  });

  describe('Fixed Rate Indicator Display', () => {
    it('displays fixed rate indicator when loan has fixed_interest_rate', async () => {
      const { container } = render(
        <LoanDetailView
          loan={fixedRateLoan}
          isOpen={true}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Balance History')).toBeInTheDocument();
      });

      // Click Add Balance Entry button
      fireEvent.click(screen.getByText('+ Add Balance Entry'));

      // Fixed rate indicator should be visible - check for the badge specifically
      const fixedRateBadge = container.querySelector('.fixed-rate-badge');
      expect(fixedRateBadge).toBeInTheDocument();
      expect(fixedRateBadge.textContent).toContain('Fixed Rate:');
      expect(fixedRateBadge.textContent).toContain('5.5');
      expect(screen.getByText(/Interest rate will be automatically applied/)).toBeInTheDocument();
    });

    it('does not display fixed rate indicator when loan has no fixed_interest_rate', async () => {
      const { container } = render(
        <LoanDetailView
          loan={variableRateLoan}
          isOpen={true}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Balance History')).toBeInTheDocument();
      });

      // Click Add Balance Entry button
      fireEvent.click(screen.getByText('+ Add Balance Entry'));

      // Fixed rate indicator should NOT be visible
      const fixedRateBadge = container.querySelector('.fixed-rate-badge');
      expect(fixedRateBadge).not.toBeInTheDocument();
      expect(screen.queryByText(/Interest rate will be automatically applied/)).not.toBeInTheDocument();
    });
  });

  describe('Balance Entry Submission', () => {
    it('submits balance entry without rate for fixed rate loan', async () => {
      const { container } = render(
        <LoanDetailView
          loan={fixedRateLoan}
          isOpen={true}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Balance History')).toBeInTheDocument();
      });

      // Click Add Balance Entry button
      fireEvent.click(screen.getByText('+ Add Balance Entry'));

      // Fill in balance (rate should not be required)
      const balanceInput = findInputByLabel(container, 'Remaining Balance');
      fireEvent.change(balanceInput, { target: { value: '14500' } });

      // Submit the form - use the button specifically
      const submitButton = container.querySelector('.balance-form-submit-button');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(loanBalanceApi.createOrUpdateBalance).toHaveBeenCalledWith(
          expect.objectContaining({
            loan_id: 1,
            remaining_balance: 14500
          })
        );
      });

      // Verify rate was NOT included in the call
      const callArgs = loanBalanceApi.createOrUpdateBalance.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('rate');
    });

    it('submits balance entry with rate for variable rate loan', async () => {
      const { container } = render(
        <LoanDetailView
          loan={variableRateLoan}
          isOpen={true}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Balance History')).toBeInTheDocument();
      });

      // Click Add Balance Entry button
      fireEvent.click(screen.getByText('+ Add Balance Entry'));

      // Fill in balance and rate
      const balanceInput = findInputByLabel(container, 'Remaining Balance');
      fireEvent.change(balanceInput, { target: { value: '7500' } });

      const rateInput = findInputByLabel(container, 'Interest Rate');
      fireEvent.change(rateInput, { target: { value: '6.25' } });

      // Submit the form - use the button specifically
      const submitButton = container.querySelector('.balance-form-submit-button');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(loanBalanceApi.createOrUpdateBalance).toHaveBeenCalledWith(
          expect.objectContaining({
            loan_id: 2,
            remaining_balance: 7500,
            rate: 6.25
          })
        );
      });
    });

    it('shows validation error for missing rate on variable rate loan', async () => {
      const { container } = render(
        <LoanDetailView
          loan={variableRateLoan}
          isOpen={true}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Balance History')).toBeInTheDocument();
      });

      // Click Add Balance Entry button
      fireEvent.click(screen.getByText('+ Add Balance Entry'));

      // Fill in balance only (no rate)
      const balanceInput = findInputByLabel(container, 'Remaining Balance');
      fireEvent.change(balanceInput, { target: { value: '7500' } });

      // Submit the form without rate - use the button specifically
      const submitButton = container.querySelector('.balance-form-submit-button');
      fireEvent.click(submitButton);

      // Should show validation error
      await waitFor(() => {
        expect(screen.getByText(/Please fix the validation errors/)).toBeInTheDocument();
      });

      // API should not have been called
      expect(loanBalanceApi.createOrUpdateBalance).not.toHaveBeenCalled();
    });

    it('does not require rate validation for fixed rate loan', async () => {
      const { container } = render(
        <LoanDetailView
          loan={fixedRateLoan}
          isOpen={true}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Balance History')).toBeInTheDocument();
      });

      // Click Add Balance Entry button
      fireEvent.click(screen.getByText('+ Add Balance Entry'));

      // Fill in balance only (rate field is hidden for fixed rate loans)
      const balanceInput = findInputByLabel(container, 'Remaining Balance');
      fireEvent.change(balanceInput, { target: { value: '14500' } });

      // Submit the form - use the button specifically
      const submitButton = container.querySelector('.balance-form-submit-button');
      fireEvent.click(submitButton);

      // Should succeed without validation error for rate
      await waitFor(() => {
        expect(loanBalanceApi.createOrUpdateBalance).toHaveBeenCalled();
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles loan with fixed_interest_rate of 0', async () => {
      const zeroRateLoan = {
        ...fixedRateLoan,
        fixed_interest_rate: 0,
        currentRate: 0
      };

      render(
        <LoanDetailView
          loan={zeroRateLoan}
          isOpen={true}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Balance History')).toBeInTheDocument();
      });

      // Click Add Balance Entry button
      fireEvent.click(screen.getByText('+ Add Balance Entry'));

      // Fixed rate indicator should show 0%
      expect(screen.getByText(/Fixed Rate:/)).toBeInTheDocument();
      
      // Rate input should be hidden
      expect(screen.queryByText('Interest Rate (%) *')).not.toBeInTheDocument();
    });

    it('handles loan with undefined fixed_interest_rate as variable rate', async () => {
      const undefinedRateLoan = {
        ...variableRateLoan,
        fixed_interest_rate: undefined
      };

      render(
        <LoanDetailView
          loan={undefinedRateLoan}
          isOpen={true}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Balance History')).toBeInTheDocument();
      });

      // Click Add Balance Entry button
      fireEvent.click(screen.getByText('+ Add Balance Entry'));

      // Rate input should be visible (treated as variable rate)
      expect(screen.getByText('Interest Rate (%) *')).toBeInTheDocument();
      
      // Fixed rate indicator should NOT be visible
      expect(screen.queryByText(/Fixed Rate:/)).not.toBeInTheDocument();
    });
  });
});
