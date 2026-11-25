import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import MonthSelector from './MonthSelector';

describe('MonthSelector', () => {
  const mockOnMonthChange = vi.fn();
  const mockOnViewAnnualSummary = vi.fn();
  const mockOnViewTaxDeductible = vi.fn();
  const mockOnOpenBudgets = vi.fn();
  const mockOnOpenAnalyticsHub = vi.fn();
  const mockOnOpenFinancialOverview = vi.fn();
  
  const defaultProps = {
    selectedYear: 2024,
    selectedMonth: 12,
    onMonthChange: mockOnMonthChange,
    onViewAnnualSummary: mockOnViewAnnualSummary,
    onViewTaxDeductible: mockOnViewTaxDeductible,
    onOpenBudgets: mockOnOpenBudgets,
    onOpenAnalyticsHub: mockOnOpenAnalyticsHub,
    onOpenFinancialOverview: mockOnOpenFinancialOverview
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const openPicker = () => fireEvent.click(screen.getByRole('button', { name: 'December 2024' }));

  describe('Rendering', () => {
    it('shows the month as the title, with the picker closed', () => {
      render(<MonthSelector {...defaultProps} />);

      const title = screen.getByRole('button', { name: 'December 2024' });
      expect(title).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('the picker has the year (2000 to this year + 2) and the 12 months, the selected one pressed', () => {
      render(<MonthSelector {...defaultProps} />);
      openPicker();

      const yearSelect = screen.getByLabelText('Year:');
      const currentYear = new Date().getFullYear();
      expect(yearSelect.value).toBe('2024');
      expect(yearSelect.options.length).toBe((currentYear + 2) - 2000 + 1);
      const months = within(screen.getByRole('group', { name: 'Month' })).getAllByRole('button');
      expect(months).toHaveLength(12);
      expect(screen.getByRole('button', { name: 'December' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'January' })).toHaveAttribute('aria-pressed', 'false');
    });

    it.each([
      ['Annual Summary', 'View annual summary', 'mockOnViewAnnualSummary'],
      ['Income Tax', 'View tax deductible expenses', 'mockOnViewTaxDeductible'],
      ['Budgets', 'Manage budgets and view history', 'mockOnOpenBudgets'],
      ['Analytics', 'View spending patterns and predictions', 'mockOnOpenAnalyticsHub'],
      ['Financial', 'Manage loans, investments, and payment methods', 'mockOnOpenFinancialOverview']
    ])('the %s button has its title and opens its view', (name, title, handler) => {
      const handlers = {
        mockOnViewAnnualSummary, mockOnViewTaxDeductible, mockOnOpenBudgets, mockOnOpenAnalyticsHub, mockOnOpenFinancialOverview
      };
      render(<MonthSelector {...defaultProps} />);

      const button = screen.getByRole('button', { name });
      expect(button).toHaveAttribute('title', title);
      fireEvent.click(button);
      expect(handlers[handler]).toHaveBeenCalled();
    });

    it('does not render separate Manage Budgets, Budget History or Payment Methods buttons', () => {
      render(<MonthSelector {...defaultProps} />);
      expect(screen.queryByRole('button', { name: /Manage Budgets|Budget History|Payment Methods/ })).not.toBeInTheDocument();
    });
  });

  describe('Picking a month', () => {
    it('changing the year keeps the month', () => {
      render(<MonthSelector {...defaultProps} selectedMonth={6} />);
      fireEvent.click(screen.getByRole('button', { name: 'June 2024' }));

      fireEvent.change(screen.getByLabelText('Year:'), { target: { value: '2023' } });

      expect(mockOnMonthChange).toHaveBeenCalledWith(2023, 6);
    });

    it('picking a month keeps the year and closes the picker', () => {
      render(<MonthSelector {...defaultProps} selectedYear={2023} />);
      fireEvent.click(screen.getByRole('button', { name: 'December 2023' }));

      fireEvent.click(screen.getByRole('button', { name: 'March' }));

      expect(mockOnMonthChange).toHaveBeenCalledWith(2023, 3);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('Escape and a click outside close the picker', () => {
      render(<MonthSelector {...defaultProps} />);
      openPicker();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      openPicker();
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockOnMonthChange).not.toHaveBeenCalled();
    });
  });
  describe('Month stepping', () => {
    it('steps to the previous month across a year boundary', () => {
      render(<MonthSelector {...defaultProps} selectedYear={2025} selectedMonth={1} />);
      fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
      expect(mockOnMonthChange).toHaveBeenCalledWith(2024, 12);
    });

    it('steps to the next month across a year boundary', () => {
      render(<MonthSelector {...defaultProps} selectedYear={2024} selectedMonth={12} />);
      fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
      expect(mockOnMonthChange).toHaveBeenCalledWith(2025, 1);
    });

    it('disables previous at the first supported month', () => {
      render(<MonthSelector {...defaultProps} selectedYear={2000} selectedMonth={1} />);
      expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
    });

    it('jumps to the current month and hides the button when already there', () => {
      const now = new Date();
      const { rerender } = render(<MonthSelector {...defaultProps} selectedYear={2000} selectedMonth={5} />);
      fireEvent.click(screen.getByRole('button', { name: 'This month' }));
      expect(mockOnMonthChange).toHaveBeenCalledWith(now.getFullYear(), now.getMonth() + 1);

      rerender(<MonthSelector {...defaultProps} selectedYear={now.getFullYear()} selectedMonth={now.getMonth() + 1} />);
      expect(screen.queryByRole('button', { name: 'This month' })).not.toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('handles January correctly', () => {
      render(<MonthSelector {...defaultProps} selectedMonth={1} />);
      expect(screen.getByRole('button', { name: 'January 2024' })).toBeInTheDocument();
    });

    it('lists a selected year beyond this year + 2', () => {
      render(<MonthSelector {...defaultProps} selectedYear={2040} />);
      fireEvent.click(screen.getByRole('button', { name: 'December 2040' }));
      expect(screen.getByLabelText('Year:').value).toBe('2040');
    });
  });
  describe('Prev/next navigation', () => {
    it('steps to the next month across a year boundary', () => {
      render(<MonthSelector {...defaultProps} selectedYear={2024} selectedMonth={12} />);
      fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
      expect(mockOnMonthChange).toHaveBeenCalledWith(2025, 1);
    });

    it('steps to the previous month across a year boundary', () => {
      render(<MonthSelector {...defaultProps} selectedYear={2024} selectedMonth={1} />);
      fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
      expect(mockOnMonthChange).toHaveBeenCalledWith(2023, 12);
    });

    it('disables previous at January 2000', () => {
      render(<MonthSelector {...defaultProps} selectedYear={2000} selectedMonth={1} />);
      expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
    });

    it('jumps to the current month and hides the button when already there', () => {
      const now = new Date();
      const { rerender } = render(<MonthSelector {...defaultProps} selectedYear={2020} selectedMonth={5} />);
      fireEvent.click(screen.getByRole('button', { name: 'This month' }));
      expect(mockOnMonthChange).toHaveBeenCalledWith(now.getFullYear(), now.getMonth() + 1);

      rerender(<MonthSelector {...defaultProps} selectedYear={now.getFullYear()} selectedMonth={now.getMonth() + 1} />);
      expect(screen.queryByRole('button', { name: 'This month' })).not.toBeInTheDocument();
    });
  });
});
