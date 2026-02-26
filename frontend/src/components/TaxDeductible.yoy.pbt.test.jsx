/**
 * Property-Based Tests for YoY Data Fetching in TaxDeductible Component
 * Tests that the component correctly fetches and displays YoY comparison data
 * 
 * **Validates: Requirements 1.1, 2.1**
  *
 * @invariant YoY Data Fetching: For any year selection, the component correctly fetches and displays year-over-year comparison data for tax deductible expenses. Randomization covers diverse year values and expense distributions.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../utils/fetchProvider', async () => {
  const actual = await vi.importActual('../utils/fetchProvider');
  return {
    ...actual,
    getFetchFn: () => (...args) => globalThis.fetch(...args),
    authAwareFetch: (...args) => globalThis.fetch(...args),
  };
});

import { render, screen, waitFor, cleanup } from '@testing-library/react';
import fc from 'fast-check';
import { asyncPbtOptions } from '../test/pbtArbitraries';
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

// Arbitrary for tax deductible amounts
const taxAmount = fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true })
  .filter(n => !isNaN(n) && isFinite(n) && n >= 100)
  .map(n => Math.round(n * 100) / 100);

// Arbitrary for year (reasonable range for tax years)
const taxYear = fc.integer({ min: 2022, max: 2028 });

// Arbitrary for generating tax deductible data with guaranteed positive values
const taxDeductibleDataArb = fc.record({
  medicalTotal: taxAmount,
  donationTotal: taxAmount
}).map(({ medicalTotal, donationTotal }) => ({
  year: 2025, // Will be overridden
  totalDeductible: medicalTotal + donationTotal,
  medicalTotal,
  donationTotal,
  monthlyBreakdown: Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    total: (medicalTotal + donationTotal) / 12,
    medical: medicalTotal / 12,
    donations: donationTotal / 12
  })),
  expenses: {
    medical: [{ id: 1, date: '2025-01-15', place: 'Hospital', amount: medicalTotal, type: 'Tax - Medical' }],
    donations: [{ id: 2, date: '2025-06-10', place: 'Charity', amount: donationTotal, type: 'Tax - Donation' }]
  }
}));

// Arbitrary for previous year summary data with guaranteed positive values
const previousYearSummaryArb = fc.record({
  medicalTotal: taxAmount,
  donationTotal: taxAmount,
  medicalCount: fc.integer({ min: 1, max: 50 }),
  donationCount: fc.integer({ min: 1, max: 20 })
}).map(({ medicalTotal, donationTotal, medicalCount, donationCount }) => ({
  year: 2024, // Will be overridden
  medicalTotal,
  donationTotal,
  totalDeductible: medicalTotal + donationTotal,
  medicalCount,
  donationCount
}));

describe('TaxDeductible YoY Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.clear();
    
    // Setup default mocks
    peopleApi.getPeople.mockResolvedValue([]);
    expenseApi.updateExpense.mockResolvedValue({ success: true });
    incomeApi.getAnnualIncomeByCategory.mockResolvedValue({ total: 0 });
    categoriesApi.getCategories.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mockLocalStorage.clear();
  });

  /**
   * **Feature: tax-deductible-analytics, Property 1: YoY Data Fetching**
   * **Validates: Requirements 1.1**
   * 
   * For any year Y passed to the TaxDeductible component, the system should
   * fetch tax deductible data for both year Y and year Y-1.
   */
  test('Property 1: YoY Data Fetching - fetches both current and previous year', async () => {
    await fc.assert(
      fc.asyncProperty(
        taxYear,
        taxDeductibleDataArb,
        previousYearSummaryArb,
        async (year, currentYearData, previousYearData) => {
          // Cleanup from previous iteration
          cleanup();
          vi.clearAllMocks();
          
          // Setup mocks with year-specific data
          const currentData = { ...currentYearData, year };
          const previousData = { ...previousYearData, year: year - 1 };
          
          mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(currentData)
          });
          
          expenseApi.getTaxDeductibleSummary.mockResolvedValue(previousData);
          
          // Render component
          render(<TaxDeductible year={year} refreshTrigger={0} />);
          
          // Wait for data to load
          await waitFor(() => {
            // Verify current year fetch was called
            expect(mockFetch).toHaveBeenCalledWith(
              expect.stringContaining(`/api/expenses/tax-deductible?year=${year}`)
            );
          }, { timeout: 5000 });
          
          // Verify previous year summary fetch was called
          await waitFor(() => {
            expect(expenseApi.getTaxDeductibleSummary).toHaveBeenCalledWith(year - 1);
          }, { timeout: 5000 });
          
          return true;
        }
      ),
      asyncPbtOptions({ numRuns: 5 })
    );
  });

  /**
   * **Feature: tax-deductible-analytics, Property 2: YoY Display Completeness**
   * **Validates: Requirements 2.1**
   * 
   * For any valid YoY comparison data containing current and previous year values,
   * the rendered output should contain all six values: medical (current), medical (previous),
   * donations (current), donations (previous), total (current), and total (previous).
   */
  test('Property 2: YoY Display Completeness - displays all six values', async () => {
    await fc.assert(
      fc.asyncProperty(
        taxDeductibleDataArb,
        previousYearSummaryArb,
        async (currentYearData, previousYearData) => {
          // Cleanup from previous iteration
          cleanup();
          vi.clearAllMocks();
          
          const year = 2025;
          const currentData = { ...currentYearData, year };
          const previousData = { ...previousYearData, year: year - 1 };
          
          mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(currentData)
          });
          
          expenseApi.getTaxDeductibleSummary.mockResolvedValue(previousData);
          
          // Render component
          const { container } = render(<TaxDeductible year={year} refreshTrigger={0} />);
          
          // Wait for YoY section to appear
          await waitFor(() => {
            expect(screen.getByText('📊 Year-over-Year Comparison')).toBeInTheDocument();
          }, { timeout: 5000 });
          
          // Find the YoY section
          const yoySection = container.querySelector('.yoy-comparison-section');
          expect(yoySection).not.toBeNull();
          
          // Check for all three YoY cards
          const yoyCards = yoySection.querySelectorAll('.yoy-card');
          expect(yoyCards.length).toBe(3);
          
          // Each card should have current and previous year values
          yoyCards.forEach(card => {
            const currentYearLabel = card.querySelector('.yoy-current .yoy-label');
            const previousYearLabel = card.querySelector('.yoy-previous .yoy-label');
            const currentYearAmount = card.querySelector('.yoy-current .yoy-amount');
            const previousYearAmount = card.querySelector('.yoy-previous .yoy-amount');
            
            expect(currentYearLabel).not.toBeNull();
            expect(previousYearLabel).not.toBeNull();
            expect(currentYearAmount).not.toBeNull();
            expect(previousYearAmount).not.toBeNull();
            
            // Verify year labels
            expect(currentYearLabel.textContent).toBe(String(year));
            expect(previousYearLabel.textContent).toBe(String(year - 1));
          });
          
          return true;
        }
      ),
      asyncPbtOptions({ numRuns: 5 })
    );
  });

  /**
   * Additional property test: YoY change indicators are consistent with data
   */
  test('Property: YoY change indicators match data direction', async () => {
    await fc.assert(
      fc.asyncProperty(
        taxDeductibleDataArb,
        previousYearSummaryArb,
        async (currentYearData, previousYearData) => {
          // Cleanup from previous iteration
          cleanup();
          vi.clearAllMocks();
          
          const year = 2025;
          const currentData = { ...currentYearData, year };
          const previousData = { ...previousYearData, year: year - 1 };
          
          mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(currentData)
          });
          
          expenseApi.getTaxDeductibleSummary.mockResolvedValue(previousData);
          
          // Render component
          const { container } = render(<TaxDeductible year={year} refreshTrigger={0} />);
          
          // Wait for YoY section to appear
          await waitFor(() => {
            expect(screen.getByText('📊 Year-over-Year Comparison')).toBeInTheDocument();
          }, { timeout: 5000 });
          
          // Find the YoY section
          const yoySection = container.querySelector('.yoy-comparison-section');
          
          // Check total card direction
          const totalCard = yoySection.querySelector('.yoy-card-total');
          const totalChange = totalCard.querySelector('.yoy-change');
          
          if (currentData.totalDeductible > previousData.totalDeductible) {
            expect(totalChange.classList.contains('yoy-change-up')).toBe(true);
          } else if (currentData.totalDeductible < previousData.totalDeductible) {
            expect(totalChange.classList.contains('yoy-change-down')).toBe(true);
          } else {
            expect(totalChange.classList.contains('yoy-change-same')).toBe(true);
          }
          
          return true;
        }
      ),
      asyncPbtOptions({ numRuns: 5 })
    );
  });

  /**
   * Property test: Handles zero previous year data correctly
   */
  test('Property: Shows "New" indicator when previous year has zero data', async () => {
    await fc.assert(
      fc.asyncProperty(
        taxDeductibleDataArb,
        async (currentYearData) => {
          // Cleanup from previous iteration
          cleanup();
          vi.clearAllMocks();
          
          const year = 2025;
          const currentData = { ...currentYearData, year };
          const previousData = {
            year: year - 1,
            medicalTotal: 0,
            donationTotal: 0,
            totalDeductible: 0,
            medicalCount: 0,
            donationCount: 0
          };
          
          mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(currentData)
          });
          
          expenseApi.getTaxDeductibleSummary.mockResolvedValue(previousData);
          
          // Render component
          render(<TaxDeductible year={year} refreshTrigger={0} />);
          
          // Wait for YoY section to appear
          await waitFor(() => {
            expect(screen.getByText('📊 Year-over-Year Comparison')).toBeInTheDocument();
          }, { timeout: 5000 });
          
          // Should show "New" indicators
          const newIndicators = screen.getAllByText('New');
          expect(newIndicators.length).toBeGreaterThanOrEqual(1);
          
          return true;
        }
      ),
      asyncPbtOptions({ numRuns: 5 })
    );
  });
});
