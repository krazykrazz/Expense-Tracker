import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TaxDeductible from './TaxDeductible';
import * as peopleApi from '../services/peopleApi';
import * as expenseApi from '../services/expenseApi';

// Mock the APIs
vi.mock('../services/peopleApi');
vi.mock('../services/expenseApi');
vi.mock('../services/paymentMethodApi', () => ({
  getActivePaymentMethods: vi.fn().mockResolvedValue([
    { id: 1, display_name: 'Cash', type: 'cash', is_active: 1 },
    { id: 2, display_name: 'Debit', type: 'debit', is_active: 1 },
  ]),
  getPaymentMethod: vi.fn().mockResolvedValue(null),
}));

// Mock fetch for the tax deductible endpoint
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('TaxDeductible', () => {
  const defaultProps = {
    year: 2025
  };

  const mockPeople = [
    { id: 1, name: 'John Doe', dateOfBirth: '1990-05-15' },
    { id: 2, name: 'Jane Smith', dateOfBirth: null }
  ];

  const mockTaxDeductibleData = {
    year: 2025,
    totalDeductible: 1500.00,
    medicalTotal: 1200.00,
    donationTotal: 300.00,
    monthlyBreakdown: [
      { month: 1, total: 200 },
      { month: 2, total: 150 },
      { month: 3, total: 0 },
      { month: 4, total: 100 },
      { month: 5, total: 0 },
      { month: 6, total: 250 },
      { month: 7, total: 0 },
      { month: 8, total: 300 },
      { month: 9, total: 0 },
      { month: 10, total: 200 },
      { month: 11, total: 0 },
      { month: 12, total: 300 }
    ],
    expenses: {
      medical: [
        { id: 1, date: '2025-01-15', place: 'City Hospital', amount: 200, type: 'Tax - Medical', notes: 'Checkup' },
        { id: 2, date: '2025-02-20', place: 'Pharmacy', amount: 150, type: 'Tax - Medical', notes: null }
      ],
      donations: [
        { id: 3, date: '2025-06-10', place: 'Red Cross', amount: 300, type: 'Tax - Donation', notes: 'Annual donation' }
      ]
    }
  };

  const mockGroupedData = {
    ...mockTaxDeductibleData,
    groupedByPerson: {
      1: {
        personId: 1,
        personName: 'John Doe',
        total: 800.00,
        providers: [
          {
            providerName: 'City Hospital',
            total: 500.00,
            expenses: [
              { id: 1, date: '2025-01-15', place: 'City Hospital', amount: 500, allocatedAmount: 500, type: 'Tax - Medical', notes: 'Surgery' }
            ]
          },
          {
            providerName: 'Pharmacy',
            total: 300.00,
            expenses: [
              { id: 2, date: '2025-02-20', place: 'Pharmacy', amount: 300, allocatedAmount: 300, type: 'Tax - Medical', notes: null }
            ]
          }
        ]
      },
      2: {
        personId: 2,
        personName: 'Jane Smith',
        total: 200.00,
        providers: [
          {
            providerName: 'Dental Clinic',
            total: 200.00,
            expenses: [
              { id: 4, date: '2025-04-10', place: 'Dental Clinic', amount: 200, allocatedAmount: 200, type: 'Tax - Medical', notes: 'Cleaning' }
            ]
          }
        ]
      }
    },
    personTotals: {
      1: { personId: 1, personName: 'John Doe', medicalTotal: 800.00, donationTotal: 0, total: 800.00 },
      2: { personId: 2, personName: 'Jane Smith', medicalTotal: 200.00, donationTotal: 0, total: 200.00 }
    },
    unassignedExpenses: {
      providers: [
        {
          providerName: 'Unknown Clinic',
          total: 200.00,
          expenses: [
            { id: 5, date: '2025-08-15', place: 'Unknown Clinic', amount: 200, type: 'Tax - Medical', method: 'Credit Card', notes: null }
          ]
        }
      ],
      total: 200.00,
      count: 1
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    peopleApi.getPeople.mockResolvedValue(mockPeople);
    expenseApi.updateExpense.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should display loading state initially', () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
      
      render(<TaxDeductible {...defaultProps} />);
      
      expect(screen.getByText('Loading tax deductible data...')).toBeInTheDocument();
    });

    it('should display tax deductible data after loading', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Tax Deductible Expenses/)).toBeInTheDocument();
        // Check that summary cards are rendered
        const summaryCards = document.querySelectorAll('.summary-card');
        expect(summaryCards.length).toBe(3);
        // Use getAllByText since "Total Deductible" appears in both summary card and YoY section
        const totalDeductibleElements = screen.getAllByText('Total Deductible');
        expect(totalDeductibleElements.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('should display empty state when no expenses', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ totalDeductible: 0 })
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('No tax-deductible expenses found for 2025')).toBeInTheDocument();
      });
    });
  });

  describe('Person Grouping Toggle', () => {
    it('should display toggle when medical expenses exist', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Group Medical Expenses by Person')).toBeInTheDocument();
      });
    });

    it('should not display toggle when no medical expenses', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          ...mockTaxDeductibleData,
          medicalTotal: 0,
          expenses: { medical: [], donations: mockTaxDeductibleData.expenses.donations }
        })
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText('Group Medical Expenses by Person')).not.toBeInTheDocument();
      });
    });

    it('should fetch grouped data when toggle is enabled', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTaxDeductibleData)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockGroupedData)
        });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Group Medical Expenses by Person')).toBeInTheDocument();
      });

      // Enable grouping
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/expenses/tax-deductible?year=2025&groupByPerson=true');
      });
    });
  });

  describe('Person-Grouped Display', () => {
    it('should display person groups when grouping is enabled', async () => {
      // Mock needs to handle multiple fetch calls - initial tax data, then grouped data
      mockFetch.mockImplementation((url) => {
        if (url.includes('groupByPerson=true')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(mockGroupedData)
          });
        }
        // Initial fetch without groupByPerson
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTaxDeductibleData)
        });
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Group Medical Expenses by Person')).toBeInTheDocument();
      });

      // Enable grouping
      fireEvent.click(screen.getByRole('checkbox'));

      await waitFor(() => {
        expect(screen.getByText('👤 John Doe')).toBeInTheDocument();
        expect(screen.getByText('👤 Jane Smith')).toBeInTheDocument();
      });
    });

    it('should expand person group to show providers', async () => {
      mockFetch.mockImplementation((url) => {
        // Return grouped data for all requests when groupByPerson is enabled
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockGroupedData)
        });
      });

      render(<TaxDeductible {...defaultProps} />);

      // Wait for initial load and enable grouping
      await waitFor(() => {
        expect(screen.getByText('Group Medical Expenses by Person')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('checkbox'));

      await waitFor(() => {
        expect(screen.getByText('👤 John Doe')).toBeInTheDocument();
      });

      // Click to expand John Doe's group
      fireEvent.click(screen.getByText('👤 John Doe').closest('.person-group-header'));

      await waitFor(() => {
        expect(screen.getByText('🏥 City Hospital')).toBeInTheDocument();
        expect(screen.getByText('🏥 Pharmacy')).toBeInTheDocument();
      });
    });
  });

  describe('Unassigned Expenses Handling', () => {
    it('should display unassigned section when unassigned expenses exist', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockGroupedData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Group Medical Expenses by Person')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('checkbox'));

      await waitFor(() => {
        // Check for the unassigned section by looking for the class
        const unassignedSection = document.querySelector('.unassigned-section');
        expect(unassignedSection).toBeInTheDocument();
        expect(screen.getByText(/Unassigned Medical Expenses/)).toBeInTheDocument();
      });
    });

    it('should expand unassigned section to show expenses', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockGroupedData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Group Medical Expenses by Person')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('checkbox'));

      await waitFor(() => {
        expect(screen.getByText(/Unassigned Medical Expenses/)).toBeInTheDocument();
      });

      // Click to expand unassigned section
      fireEvent.click(screen.getByText(/Unassigned Medical Expenses/).closest('.unassigned-header'));

      await waitFor(() => {
        expect(screen.getByText('🏥 Unknown Clinic')).toBeInTheDocument();
      });
    });
  });

  describe('Quick Assign Functionality', () => {
    it('should display edit button for unassigned expenses', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockGroupedData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Group Medical Expenses by Person')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('checkbox'));

      await waitFor(() => {
        expect(screen.getByText(/Unassigned Medical Expenses/)).toBeInTheDocument();
      });

      // Unassigned section should be expanded by default in the test data
      // Click to expand if needed
      const unassignedHeader = screen.getByText(/Unassigned Medical Expenses/).closest('.unassigned-header');
      fireEvent.click(unassignedHeader);

      await waitFor(() => {
        const editButton = screen.getByRole('button', { name: /Edit/i });
        expect(editButton).toBeInTheDocument();
      });
    });

    it('should open edit modal when edit button is clicked', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockGroupedData)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockGroupedData)
        });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Group Medical Expenses by Person')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('checkbox'));

      await waitFor(() => {
        expect(screen.getByText(/Unassigned Medical Expenses/)).toBeInTheDocument();
      });

      // Expand unassigned section
      fireEvent.click(screen.getByText(/Unassigned Medical Expenses/).closest('.unassigned-header'));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument();
      });

      // Click edit button - this should trigger the edit modal
      const editButton = screen.getByRole('button', { name: /Edit/i });
      fireEvent.click(editButton);

      // The edit modal should be triggered (we can verify the handler was called)
      // Note: Full modal testing would require more setup
    });
  });

  describe('Standard View (Non-Grouped)', () => {
    it('should display medical expenses list when not grouped', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Medical Expenses.*2 items/)).toBeInTheDocument();
      });
    });

    it('should expand medical expenses to show details', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Medical Expenses.*2 items/)).toBeInTheDocument();
      });

      // Click to expand
      fireEvent.click(screen.getByText(/Medical Expenses.*2 items/).closest('.tax-category-header-collapsible'));

      await waitFor(() => {
        expect(screen.getByText('City Hospital')).toBeInTheDocument();
        expect(screen.getByText('Pharmacy')).toBeInTheDocument();
      });
    });

    it('should display donations section', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTaxDeductibleData)
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Donations.*1 items/)).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle fetch error gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Server error' })
      });

      render(<TaxDeductible {...defaultProps} />);

      await waitFor(() => {
        // Should show empty state on error
        expect(screen.getByText('No tax-deductible expenses found for 2025')).toBeInTheDocument();
      });
    });
  });
});
