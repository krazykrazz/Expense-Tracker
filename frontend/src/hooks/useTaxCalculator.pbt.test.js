/**
 * Property-Based Tests for useTaxCalculator
 *
 * Tests localStorage round-trip for tax settings and tax credits computation.
 *
 * Feature: frontend-custom-hooks
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import fc from 'fast-check';
import { pbtOptions } from '../test/pbtArbitraries';
import useTaxCalculator from './useTaxCalculator';

// Mock the taxSettingsStorage module
vi.mock('../utils/taxSettingsStorage', () => ({
  getNetIncomeForYear: vi.fn(),
  saveNetIncomeForYear: vi.fn(),
  getSelectedProvince: vi.fn(),
  saveSelectedProvince: vi.fn(),
}));

// Mock the taxCreditCalculator module
vi.mock('../utils/taxCreditCalculator', () => ({
  calculateAllTaxCredits: vi.fn(),
}));

// Mock the incomeApi module
vi.mock('../services/incomeApi', () => ({
  getAnnualIncomeByCategory: vi.fn(),
}));

import {
  getNetIncomeForYear,
  saveNetIncomeForYear,
  getSelectedProvince,
  saveSelectedProvince,
} from '../utils/taxSettingsStorage';
import { calculateAllTaxCredits } from '../utils/taxCreditCalculator';
import { getAnnualIncomeByCategory } from '../services/incomeApi';

// --- Smart Generators ---

/**
 * Generates valid year values (reasonable range for tax years)
 */
const validYear = fc.integer({ min: 2000, max: 2050 });

/**
 * Generates valid net income values (non-negative)
 */
const validNetIncome = fc.float({ min: 0, max: 1000000, noNaN: true });

/**
 * Generates valid province codes
 */
const validProvince = fc.constantFrom(
  'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'
);

/**
 * Generates valid medical and donation totals (non-negative)
 */
const validExpenseTotal = fc.float({ min: 0, max: 100000, noNaN: true });

// --- Property Tests ---

describe('useTaxCalculator Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Feature: frontend-custom-hooks, Property 10: Tax settings localStorage round-trip
   * **Validates: Requirements 5.2, 5.3**
   *
   * For any valid year and non-negative net income value, calling handleNetIncomeChange
   * with that value and then re-initializing the hook with the same year SHALL restore
   * the same net income. Similarly, for any valid province code, calling handleProvinceChange
   * and re-initializing SHALL restore the same province.
   */
  test('Property 10: Tax settings localStorage round-trip', () => {
    fc.assert(
      fc.property(
        validYear,
        validNetIncome,
        validProvince,
        (year, netIncome, provinceCode) => {
          // Setup: Mock initial state (no saved values)
          getNetIncomeForYear.mockReturnValue(null);
          getSelectedProvince.mockReturnValue('ON');

          // Render hook initially
          const { result, rerender } = renderHook(
            ({ year, medicalTotal, donationTotal }) =>
              useTaxCalculator({ year, medicalTotal, donationTotal }),
            {
              initialProps: { year, medicalTotal: 0, donationTotal: 0 },
            }
          );

          // Simulate user entering net income
          act(() => {
            const event = { target: { value: netIncome.toString() } };
            result.current.handleNetIncomeChange(event);
          });

          // Verify saveNetIncomeForYear was called
          expect(saveNetIncomeForYear).toHaveBeenCalledWith(year, netIncome);

          // Simulate user selecting province
          act(() => {
            const event = { target: { value: provinceCode } };
            result.current.handleProvinceChange(event);
          });

          // Verify saveSelectedProvince was called
          expect(saveSelectedProvince).toHaveBeenCalledWith(provinceCode);

          // Now simulate re-initialization: mock the storage to return saved values
          getNetIncomeForYear.mockReturnValue(netIncome);
          getSelectedProvince.mockReturnValue(provinceCode);

          // Re-render with same year (simulates component remount or year change back)
          rerender({ year, medicalTotal: 0, donationTotal: 0 });

          // Property: The hook should restore the saved values
          expect(result.current.netIncome).toBe(netIncome);
          expect(result.current.netIncomeInput).toBe(netIncome.toString());
          expect(result.current.selectedProvince).toBe(provinceCode);
        }
      ),
      pbtOptions
    );
  });

  /**
   * Feature: frontend-custom-hooks, Property 11: Tax credits computation matches utility
   * **Validates: Requirements 5.5**
   *
   * For any valid combination of (medicalTotal >= 0, donationTotal >= 0, netIncome >= 0,
   * year, provinceCode), the taxCredits value exposed by the hook SHALL equal the result
   * of calling calculateAllTaxCredits directly with the same parameters.
   */
  test('Property 11: Tax credits computation matches utility', () => {
    fc.assert(
      fc.property(
        validYear,
        validExpenseTotal,
        validExpenseTotal,
        validNetIncome,
        validProvince,
        (year, medicalTotal, donationTotal, netIncome, provinceCode) => {
          // Setup: Mock storage to return the test values
          getNetIncomeForYear.mockReturnValue(netIncome);
          getSelectedProvince.mockReturnValue(provinceCode);

          // Mock the tax credit calculator to return a predictable result
          const expectedCredits = {
            federal: { total: 100 },
            provincial: { total: 50 },
            totalTaxSavings: 150,
          };
          calculateAllTaxCredits.mockReturnValue(expectedCredits);

          // Render hook with test parameters
          const { result } = renderHook(() =>
            useTaxCalculator({ year, medicalTotal, donationTotal })
          );

          // Property: The hook's taxCredits should match the utility's return value
          expect(result.current.taxCredits).toEqual(expectedCredits);

          // Verify the utility was called with correct parameters
          expect(calculateAllTaxCredits).toHaveBeenCalledWith({
            medicalTotal: medicalTotal || 0,
            donationTotal: donationTotal || 0,
            netIncome: netIncome,
            year: year,
            provinceCode: provinceCode,
          });
        }
      ),
      pbtOptions
    );
  });
});
