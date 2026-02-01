import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MonthSelector from './MonthSelector';

describe('MonthSelector', () => {
  const mockOnMonthChange = vi.fn();
  const mockOnViewAnnualSummary = vi.fn();
  const mockOnViewTaxDeductible = vi.fn();
  const mockOnManageBudgets = vi.fn();
  const mockOnViewBudgetHistory = vi.fn();
  const mockOnOpenAnalyticsHub = vi.fn();
  const mockOnOpenPaymentMethods = vi.fn();
  
  const defaultProps = {
    selectedYear: 2024,
    selectedMonth: 12,
    onMonthChange: mockOnMonthChange,
    onViewAnnualSummary: mockOnViewAnnualSummary,
    onViewTaxDeductible: mockOnViewTaxDeductible,
    onManageBudgets: mockOnManageBudgets,
    onViewBudgetHistory: mockOnViewBudgetHistory,
    onOpenAnalyticsHub: mockOnOpenAnalyticsHub,
    onOpenPaymentMethods: mockOnOpenPaymentMethods
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders year selector with correct value', () => {
      render(<MonthSelector {...defaultProps} />);
      
      const yearSelect = screen.getByLabelText('Year:');
      expect(yearSelect.value).toBe('2024');
    });

    it('renders month selector with correct value', () => {
      render(<MonthSelector {...defaultProps} />);
      
      const monthSelect = screen.getByLabelText('Month:');
      expect(monthSelect.value).toBe('12');
    });

    it('renders all 12 months', () => {
      render(<MonthSelector {...defaultProps} />);
      
      const monthSelect = screen.getByLabelText('Month:');
      expect(monthSelect.options.length).toBe(12);
      expect(screen.getByText('January')).toBeInTheDocument();
      expect(screen.getByText('December')).toBeInTheDocument();
    });

    it('renders years from 2020 to 2030', () => {
      render(<MonthSelector {...defaultProps} />);
      
      const yearSelect = screen.getByLabelText('Year:');
      expect(yearSelect.options.length).toBe(11);
      expect(screen.getByText('2020')).toBeInTheDocument();
      expect(screen.getByText('2030')).toBeInTheDocument();
    });

    it('renders Annual Summary button', () => {
      render(<MonthSelector {...defaultProps} />);
      expect(screen.getByText('📊 Annual Summary')).toBeInTheDocument();
    });

    it('renders Income Tax button', () => {
      render(<MonthSelector {...defaultProps} />);
      expect(screen.getByText('💰 Income Tax')).toBeInTheDocument();
    });

    it('renders Manage Budgets button', () => {
      render(<MonthSelector {...defaultProps} />);
      expect(screen.getByText('💵 Manage Budgets')).toBeInTheDocument();
    });

    it('renders Budget History button', () => {
      render(<MonthSelector {...defaultProps} />);
      expect(screen.getByText('📈 Budget History')).toBeInTheDocument();
    });

    it('renders Payment Methods button', () => {
      render(<MonthSelector {...defaultProps} />);
      expect(screen.getByText('💳 Payment Methods')).toBeInTheDocument();
    });
  });

  describe('Year selection', () => {
    it('calls onMonthChange when year is changed', () => {
      render(<MonthSelector {...defaultProps} />);
      
      const yearSelect = screen.getByLabelText('Year:');
      fireEvent.change(yearSelect, { target: { value: '2025' } });
      
      expect(mockOnMonthChange).toHaveBeenCalledWith(2025, 12);
    });

    it('preserves selected month when year changes', () => {
      render(<MonthSelector {...defaultProps} selectedMonth={6} />);
      
      const yearSelect = screen.getByLabelText('Year:');
      fireEvent.change(yearSelect, { target: { value: '2023' } });
      
      expect(mockOnMonthChange).toHaveBeenCalledWith(2023, 6);
    });
  });

  describe('Month selection', () => {
    it('calls onMonthChange when month is changed', () => {
      render(<MonthSelector {...defaultProps} />);
      
      const monthSelect = screen.getByLabelText('Month:');
      fireEvent.change(monthSelect, { target: { value: '6' } });
      
      expect(mockOnMonthChange).toHaveBeenCalledWith(2024, 6);
    });

    it('preserves selected year when month changes', () => {
      render(<MonthSelector {...defaultProps} selectedYear={2023} />);
      
      const monthSelect = screen.getByLabelText('Month:');
      fireEvent.change(monthSelect, { target: { value: '3' } });
      
      expect(mockOnMonthChange).toHaveBeenCalledWith(2023, 3);
    });
  });

  describe('Button actions', () => {
    it('calls onViewAnnualSummary when Annual Summary button is clicked', () => {
      render(<MonthSelector {...defaultProps} />);
      
      fireEvent.click(screen.getByText('📊 Annual Summary'));
      
      expect(mockOnViewAnnualSummary).toHaveBeenCalled();
    });

    it('calls onViewTaxDeductible when Income Tax button is clicked', () => {
      render(<MonthSelector {...defaultProps} />);
      
      fireEvent.click(screen.getByText('💰 Income Tax'));
      
      expect(mockOnViewTaxDeductible).toHaveBeenCalled();
    });

    it('calls onManageBudgets when Manage Budgets button is clicked', () => {
      render(<MonthSelector {...defaultProps} />);
      
      fireEvent.click(screen.getByText('💵 Manage Budgets'));
      
      expect(mockOnManageBudgets).toHaveBeenCalled();
    });

    it('calls onViewBudgetHistory when Budget History button is clicked', () => {
      render(<MonthSelector {...defaultProps} />);
      
      fireEvent.click(screen.getByText('📈 Budget History'));
      
      expect(mockOnViewBudgetHistory).toHaveBeenCalled();
    });

    it('calls onOpenPaymentMethods when Payment Methods button is clicked', () => {
      render(<MonthSelector {...defaultProps} />);
      
      fireEvent.click(screen.getByText('💳 Payment Methods'));
      
      expect(mockOnOpenPaymentMethods).toHaveBeenCalled();
    });
  });

  describe('Button titles', () => {
    it('has correct title for Annual Summary button', () => {
      render(<MonthSelector {...defaultProps} />);
      
      const button = screen.getByText('📊 Annual Summary');
      expect(button).toHaveAttribute('title', 'View annual summary');
    });

    it('has correct title for Income Tax button', () => {
      render(<MonthSelector {...defaultProps} />);
      
      const button = screen.getByText('💰 Income Tax');
      expect(button).toHaveAttribute('title', 'View tax deductible expenses');
    });

    it('has correct title for Manage Budgets button', () => {
      render(<MonthSelector {...defaultProps} />);
      
      const button = screen.getByText('💵 Manage Budgets');
      expect(button).toHaveAttribute('title', 'Manage monthly budgets');
    });

    it('has correct title for Budget History button', () => {
      render(<MonthSelector {...defaultProps} />);
      
      const button = screen.getByText('📈 Budget History');
      expect(button).toHaveAttribute('title', 'View budget history');
    });

    it('has correct title for Payment Methods button', () => {
      render(<MonthSelector {...defaultProps} />);
      
      const button = screen.getByText('💳 Payment Methods');
      expect(button).toHaveAttribute('title', 'Manage payment methods');
    });
  });

  describe('Edge cases', () => {
    it('handles January correctly', () => {
      render(<MonthSelector {...defaultProps} selectedMonth={1} />);
      
      const monthSelect = screen.getByLabelText('Month:');
      expect(monthSelect.value).toBe('1');
    });

    it('handles first year in range', () => {
      render(<MonthSelector {...defaultProps} selectedYear={2020} />);
      
      const yearSelect = screen.getByLabelText('Year:');
      expect(yearSelect.value).toBe('2020');
    });

    it('handles last year in range', () => {
      render(<MonthSelector {...defaultProps} selectedYear={2030} />);
      
      const yearSelect = screen.getByLabelText('Year:');
      expect(yearSelect.value).toBe('2030');
    });
  });
});
