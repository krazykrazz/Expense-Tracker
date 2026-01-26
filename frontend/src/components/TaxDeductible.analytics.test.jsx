/**
 * Integration Tests for Tax Deductible Analytics Features
 * Tests YoY comparison and Tax Credit Calculator UI rendering
 * 
 * **Validates: Requirements 2.1, 8.1, 8.4**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import TaxDeductible from './TaxDeductible';
import * as peopleApi from '../services/peopleApi';
import * as expenseApi from '../services/expenseApi';
import * as incomeApi from '../services/incomeApi';
import * as categoriesApi from '../services/categoriesApi';

// Mock the APIs
vi.mock('../services/peopleApi');
vi.mock('../services/expenseApi');
vi.mock('../services/incomeApi');
vi.mock('../services/categoriesApi');

// Mock fetch for the tax deductible endpoint
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const mockLocalStorage = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; })
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true
});

describe('TaxDeductible Analytics Integration Tests', () => {
  const defaultProps = {
    year: 2025,
    refreshTrigger: 0
  };

  const mockPeople = [
    { id: 1, name: 'John Doe', dateOfBirth: '1990-05-15' },
    { id: 2, name: 'Jane Smith', dateOfBirth: null }
  ];

  const mockCategories = [
    { id: 1, name: 'Tax - Medical' },
    { id: 2, name: 'Tax - Donation' }
  ];

  const mockTaxDeductibleData = {
    year: 2025,
    totalDeductible: 3500.00,
    medicalTotal: 2500.00,
    donationTotal: 1000.00,
    monthlyBreakdown: [
      { month: 1, total: 500, medical: 400, donations: 100 },
      { month: 2, total: 300, medical: 200, donations: 100 },
      { month: 3, total: 400, medical: 300, donations: 100 },
      { month: 4, total: 200, medical: 150, donations: 50 },
      { month: 5, total: 350, medical: 250, donations: 100 },
      { month: 6, total: 450, medical: 350, donations: 100 },
      { month: 7, total: 300, medical: 200, donations: 100 },
      { month: 8, total: 400, medical: 300, donations: 100 },
      { month: 9, total: 200, medical: 150, donations: 50 },
      { month: 10, total: 200, medical: 100, donations: 100 },
      { month: 11, total: 100, medical: 50, donations: 50 },
      { month: 12, total: 100, medical: 50, donations: 50 }
    ],
    expenses: {
      medical: [
        { id: 1, date: '2025-01-15', place: 'City Hospital', amount: 400, type: 'Tax - Medical', notes: 'Checkup' },
        { id: 2, date: '2025-02-20', place: 'Pharmacy', amount: 200, type: 'Tax - Medical', notes: null }
      ],
      donations: [
        { id: 3, date: '2025-06-10', place: 'Red Cross', amount: 500, type: 'Tax - Donation', notes: 'Annual donation' }
      ]
    }
  };

  const mockPreviousYearSummary = {
    year: 2024,
    medicalTotal: 2000.00,
    donationTotal: 800.00,
    totalDeductible: 2800.00,
    medicalCount: 15,
    donationCount: 5
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.clear();
    
    // Setup default mocks
    peopleApi.getPeople.mockResolvedValue(mockPeople);
    expenseApi.updateExpense.mockResolvedValue({ success: true });
    expenseApi.getTaxDeductibleSummary.mockResolvedValue(mockPreviousYearSummary);
    incomeApi.getAnnualIncomeByCategory.mockResolvedValue({ total: 75000 });
    categoriesApi.getCategories.mockResolvedValue(mockCategories);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockLocalStorage.clear();
  });

  describe('YoY Comparison UI Rendering - Requirement 2.1', () => {
    it('should render YoY comparison section with all three cards', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('📊 Year-over-Year Comparison')).toBeInTheDocument();
      });

      // Check for all three YoY cards
      const yoySection = screen.getByText('📊 Year-over-Year Comparison').closest('.yoy-comparison-section');
      expect(yoySection).toBeInTheDocument();
      
      // Medical card - check within YoY section
      const yoyCards = yoySection.querySelectorAll('.yoy-card');
      expect(yoyCards.length).toBe(3);
      
      // Check for Medical Expenses card
      expect(screen.getByText('Medical Expenses')).toBeInTheDocument();
      
      // Donations card - use getAllByText since it appears in multiple places
      const donationsElements = screen.getAllByText('Donations');
      expect(donationsElements.length).toBeGreaterThanOrEqual(1);
      
      // Total card - use getAllByText since it appears in summary cards too
      const totalDeductibleElements = screen.getAllByText('Total Deductible');
      expect(totalDeductibleElements.length).toBeGreaterThanOrEqual(2); // Summary card + YoY card
    });

    it('should display current and previous year values in YoY cards', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('📊 Year-over-Year Comparison')).toBeInTheDocument();
      });

      // Check for year labels
      const year2025Labels = screen.getAllByText('2025');
      const year2024Labels = screen.getAllByText('2024');
      
      expect(year2025Labels.length).toBeGreaterThanOrEqual(3); // One for each YoY card
      expect(year2024Labels.length).toBeGreaterThanOrEqual(3);
    });

    it('should display percentage change indicators', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('📊 Year-over-Year Comparison')).toBeInTheDocument();
      });

      // Medical: 2500 vs 2000 = +25%
      // Donations: 1000 vs 800 = +25%
      // Total: 3500 vs 2800 = +25%
      
      // Check for up indicators (↑) since all values increased
      const upIndicators = screen.getAllByText('↑');
      expect(upIndicators.length).toBeGreaterThanOrEqual(3);
    });

    it('should show loading state while fetching previous year data', async () => {
      // Make the summary fetch slow
      expenseApi.getTaxDeductibleSummary.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockPreviousYearSummary), 100))
      );
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      // Initially should show loading
      await waitFor(() => {
        expect(screen.getByText('Loading previous year data...')).toBeInTheDocument();
      });

      // Then should show the comparison
      await waitFor(() => {
        expect(screen.getByText('📊 Year-over-Year Comparison')).toBeInTheDocument();
      }, { timeout: 500 });
    });

    it('should show error message when previous year fetch fails', async () => {
      expenseApi.getTaxDeductibleSummary.mockRejectedValue(new Error('Network error'));
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Unable to load previous year data')).toBeInTheDocument();
      });
    });

    it('should handle "New" indicator when previous year has no data', async () => {
      expenseApi.getTaxDeductibleSummary.mockResolvedValue({
        year: 2024,
        medicalTotal: 0,
        donationTotal: 0,
        totalDeductible: 0,
        medicalCount: 0,
        donationCount: 0
      });
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('📊 Year-over-Year Comparison')).toBeInTheDocument();
      });

      // Should show "New" indicators for all categories
      const newIndicators = screen.getAllByText('New');
      expect(newIndicators.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Tax Credit Calculator UI Rendering - Requirements 8.1, 8.4', () => {
    it('should render Tax Credit Calculator section', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('🧮 Tax Credit Calculator')).toBeInTheDocument();
      });
    });

    it('should render net income input field', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Annual Net Income/)).toBeInTheDocument();
      });
    });

    it('should render province selector with Ontario as default', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        const provinceSelect = screen.getByLabelText(/Province\/Territory/);
        expect(provinceSelect).toBeInTheDocument();
        expect(provinceSelect.value).toBe('ON');
      });
    });

    it('should show prompt when net income is not configured', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Enter your annual net income above/)).toBeInTheDocument();
      });
    });

    it('should show tax credit breakdown when net income is configured', async () => {
      // Pre-set net income in localStorage
      mockLocalStorage.setItem('taxDeductible_netIncome', JSON.stringify({ 2025: 75000 }));
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Tax Credit Breakdown')).toBeInTheDocument();
      });

      // Check for federal and provincial credit sections
      expect(screen.getByText('🇨🇦 Federal Credits')).toBeInTheDocument();
      expect(screen.getByText(/Ontario Credits/)).toBeInTheDocument();
    });

    it('should show AGI threshold progress section when net income is configured', async () => {
      mockLocalStorage.setItem('taxDeductible_netIncome', JSON.stringify({ 2025: 75000 }));
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Medical Expense Threshold')).toBeInTheDocument();
      });

      // Check for threshold calculation display
      expect(screen.getByText(/Your threshold:/)).toBeInTheDocument();
    });

    it('should show estimated tax savings summary', async () => {
      mockLocalStorage.setItem('taxDeductible_netIncome', JSON.stringify({ 2025: 75000 }));
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('💰 Estimated Tax Savings')).toBeInTheDocument();
      });
    });

    it('should update calculations when net income is entered', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByLabelText(/Annual Net Income/)).toBeInTheDocument();
      });

      // Enter net income
      const incomeInput = screen.getByLabelText(/Annual Net Income/);
      fireEvent.change(incomeInput, { target: { value: '75000' } });

      // Should now show tax credit breakdown
      await waitFor(() => {
        expect(screen.getByText('Tax Credit Breakdown')).toBeInTheDocument();
      });
    });

    it('should update calculations when province is changed', async () => {
      mockLocalStorage.setItem('taxDeductible_netIncome', JSON.stringify({ 2025: 75000 }));
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Ontario Credits/)).toBeInTheDocument();
      });

      // Change province to Alberta
      const provinceSelect = screen.getByLabelText(/Province\/Territory/);
      fireEvent.change(provinceSelect, { target: { value: 'AB' } });

      // Should now show Alberta credits
      await waitFor(() => {
        expect(screen.getByText(/Alberta Credits/)).toBeInTheDocument();
      });
    });

    it('should show "Use App Data" button for pulling income', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Use App Data/)).toBeInTheDocument();
      });
    });

    it('should populate income from app data when button is clicked', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Use App Data/)).toBeInTheDocument();
      });

      // Click the button
      const useAppDataBtn = screen.getByText(/Use App Data/);
      fireEvent.click(useAppDataBtn);

      // Should call the income API
      await waitFor(() => {
        expect(incomeApi.getAnnualIncomeByCategory).toHaveBeenCalledWith(2025);
      });

      // Should show tax credit breakdown after income is loaded
      await waitFor(() => {
        expect(screen.getByText('Tax Credit Breakdown')).toBeInTheDocument();
      });
    });

    it('should show deductible amount when medical expenses exceed threshold', async () => {
      // Set net income low enough that threshold is below medical expenses
      // With $30,000 income, threshold = min(30000 * 0.03, 2794) = $900
      // Medical expenses = $2500, so deductible = $2500 - $900 = $1600
      mockLocalStorage.setItem('taxDeductible_netIncome', JSON.stringify({ 2025: 30000 }));
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/✅ Deductible amount:/)).toBeInTheDocument();
      });
    });

    it('should show message when medical expenses are below threshold', async () => {
      // Set net income high enough that threshold exceeds medical expenses
      // With $100,000 income, threshold = min(100000 * 0.03, 2794) = $2794
      // Medical expenses = $2500, so below threshold
      mockLocalStorage.setItem('taxDeductible_netIncome', JSON.stringify({ 2025: 100000 }));
      
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Medical expenses below threshold/)).toBeInTheDocument();
      });
    });
  });

  describe('Tax Credit Calculator without Net Income - Requirement 8.4', () => {
    it('should not show tax credit breakdown without net income', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('🧮 Tax Credit Calculator')).toBeInTheDocument();
      });

      // Should show prompt instead of breakdown
      expect(screen.getByText(/Enter your annual net income above/)).toBeInTheDocument();
      expect(screen.queryByText('Tax Credit Breakdown')).not.toBeInTheDocument();
    });

    it('should not show AGI threshold section without net income', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('🧮 Tax Credit Calculator')).toBeInTheDocument();
      });

      expect(screen.queryByText('Medical Expense Threshold')).not.toBeInTheDocument();
    });

    it('should not show tax savings summary without net income', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('🧮 Tax Credit Calculator')).toBeInTheDocument();
      });

      expect(screen.queryByText('💰 Estimated Tax Savings')).not.toBeInTheDocument();
    });
  });

  describe('Empty State Handling', () => {
    it('should not show YoY comparison when no tax deductible data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ totalDeductible: 0 })
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No tax-deductible expenses found for 2025')).toBeInTheDocument();
      });

      expect(screen.queryByText('📊 Year-over-Year Comparison')).not.toBeInTheDocument();
    });

    it('should not show Tax Credit Calculator when no tax deductible data', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ totalDeductible: 0 })
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No tax-deductible expenses found for 2025')).toBeInTheDocument();
      });

      expect(screen.queryByText('🧮 Tax Credit Calculator')).not.toBeInTheDocument();
    });
  });
});
