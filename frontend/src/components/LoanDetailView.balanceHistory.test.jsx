import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

describe('LoanDetailView Balance History Display - Fixed Interest Rate', () => {
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
      month: 2,
      remaining_balance: 14500,
      rate: 5.5,
      balanceChange: -500,
      rateChange: 0
    },
    {
      id: 2,
      loan_id: 1,
      year: 2024,
      month: 1,
      remaining_balance: 15000,
      rate: 5.5,
      balanceChange: -500,
      rateChange: null
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    loanBalanceApi.getBalanceHistory.mockResolvedValue(mockBalanceHistory);
  });

  describe('Conditional Rate Change Column Visibility - Requirements 3.1, 3.2, 3.3', () => {
    it('hides Rate Change column header when loan has fixed_interest_rate', async () => {
      render(
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

      // Wait for balance history to load
      await waitFor(() => {
        expect(screen.getByText('February 2024')).toBeInTheDocument();
      });

      // Rate Change column header should NOT be visible
      const headers = screen.getAllByRole('columnheader');
      const headerTexts = headers.map(h => h.textContent);
      expect(headerTexts).not.toContain('Rate Change');
      
      // Interest Rate column should still be visible
      expect(headerTexts).toContain('Interest Rate');
    });

    it('shows Rate Change column header when loan does not have fixed_interest_rate', async () => {
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

      // Wait for balance history to load
      await waitFor(() => {
        expect(screen.getByText('February 2024')).toBeInTheDocument();
      });

      // Rate Change column header should be visible
      const headers = screen.getAllByRole('columnheader');
      const headerTexts = headers.map(h => h.textContent);
      expect(headerTexts).toContain('Rate Change');
      
      // Interest Rate column should also be visible
      expect(headerTexts).toContain('Interest Rate');
    });

    it('hides Rate Change cells in table body for fixed rate loan', async () => {
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

      // Wait for balance history to load
      await waitFor(() => {
        expect(screen.getByText('February 2024')).toBeInTheDocument();
      });

      // Rate change cells should not exist
      const rateChangeCells = container.querySelectorAll('.rate-change');
      expect(rateChangeCells.length).toBe(0);
    });

    it('shows Rate Change cells in table body for variable rate loan', async () => {
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

      // Wait for balance history to load
      await waitFor(() => {
        expect(screen.getByText('February 2024')).toBeInTheDocument();
      });

      // Rate change cells should exist (at least one with actual change indicator)
      const rateChangeCells = container.querySelectorAll('.rate-change, .no-change');
      expect(rateChangeCells.length).toBeGreaterThan(0);
    });
  });

  describe('Fixed Rate Badge in Summary Section - Requirement 3.4', () => {
    it('displays Fixed Rate badge in summary when loan has fixed_interest_rate', async () => {
      const { container } = render(
        <LoanDetailView
          loan={fixedRateLoan}
          isOpen={true}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Loan Summary')).toBeInTheDocument();
      });

      // Fixed Rate badge should be visible in summary
      const fixedRateBadge = container.querySelector('.fixed-rate-badge-summary');
      expect(fixedRateBadge).toBeInTheDocument();
      expect(fixedRateBadge.textContent).toContain('Fixed Rate');
    });

    it('does not display Fixed Rate badge when loan has no fixed_interest_rate', async () => {
      const { container } = render(
        <LoanDetailView
          loan={variableRateLoan}
          isOpen={true}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Loan Summary')).toBeInTheDocument();
      });

      // Fixed Rate badge should NOT be visible
      const fixedRateBadge = container.querySelector('.fixed-rate-badge-summary');
      expect(fixedRateBadge).not.toBeInTheDocument();
    });
  });

  describe('Interest Rate Column Visibility - Requirement 3.2', () => {
    it('keeps Interest Rate column visible for fixed rate loan', async () => {
      render(
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

      // Wait for balance history to load
      await waitFor(() => {
        expect(screen.getByText('February 2024')).toBeInTheDocument();
      });

      // Interest Rate column should be visible
      const headers = screen.getAllByRole('columnheader');
      const headerTexts = headers.map(h => h.textContent);
      expect(headerTexts).toContain('Interest Rate');

      // Interest rate values should be displayed
      expect(screen.getAllByText('5.5%').length).toBeGreaterThan(0);
    });
  });
});
