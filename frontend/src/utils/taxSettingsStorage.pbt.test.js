/**
 * Property-Based Tests for Tax Settings Storage
 * Tests localStorage persistence for tax credit calculator settings
 * 
 * **Validates: Requirements 3.2, 3.3, 3.6, 6.2**
  *
 * @invariant Storage Round-Trip: For any valid tax settings (net income, province, year), saving to localStorage and reading back returns the same values; invalid stored data falls back to defaults. Randomization covers diverse setting values and year combinations.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { pbtOptions, year } from '../test/pbtArbitraries';
import {
  getNetIncomeForYear,
  saveNetIncomeForYear,
  getSelectedProvince,
  saveSelectedProvince,
  clearAllTaxSettings,
  _STORAGE_KEYS
} from './taxSettingsStorage';

// Province code arbitrary - all valid Canadian province codes
const provinceCode = fc.constantFrom('AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT');

// Safe income arbitrary (positive values within reasonable range)
const safeIncome = fc.integer({ min: 0, max: 10000000 });

// Tax year arbitrary (reasonable range)
const taxYear = fc.integer({ min: 2000, max: 2100 });

// Mock localStorage for testing
let mockStorage = {};

const mockLocalStorage = {
  getItem: vi.fn((key) => mockStorage[key] || null),
  setItem: vi.fn((key, value) => { mockStorage[key] = value; }),
  removeItem: vi.fn((key) => { delete mockStorage[key]; }),
  clear: vi.fn(() => { mockStorage = {}; })
};

describe('Tax Settings Storage Property-Based Tests', () => {
  beforeEach(() => {
    // Reset mock storage before each test
    mockStorage = {};
    
    // Mock localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true
    });
    
    // Clear mock call history
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up
    mockStorage = {};
    vi.clearAllMocks();
  });

  /**
   * **Feature: tax-deductible-analytics, Property 5: Net Income Storage Round-Trip**
   * **Validates: Requirements 3.2, 3.3, 3.6**
   * 
   * For any year Y and net income value N, saving N for year Y and then loading
   * for year Y should return N. Additionally, loading for a different year Y2
   * should not return N (unless N was also saved for Y2).
   */
  test('Property 5: Net income round-trip - save and load returns same value', () => {
    fc.assert(
      fc.property(
        taxYear,
        safeIncome,
        (year, income) => {
          // Clear storage before test
          mockStorage = {};
          
          // Save income for the year
          saveNetIncomeForYear(year, income);
          
          // Load income for the same year
          const loaded = getNetIncomeForYear(year);
          
          // Should return the same value
          expect(loaded).toBe(income);
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });

  test('Property 5: Net income isolation - different years have independent values', () => {
    fc.assert(
      fc.property(
        taxYear,
        taxYear.filter(y2 => true), // Will filter in test
        safeIncome,
        (year1, year2Candidate, income) => {
          // Ensure year2 is different from year1
          const year2 = year2Candidate === year1 ? year1 + 1 : year2Candidate;
          
          // Clear storage before test
          mockStorage = {};
          
          // Save income only for year1
          saveNetIncomeForYear(year1, income);
          
          // Load income for year2 (different year)
          const loadedYear2 = getNetIncomeForYear(year2);
          
          // Should return null for year2 (not saved)
          expect(loadedYear2).toBeNull();
          
          // Year1 should still have the value
          const loadedYear1 = getNetIncomeForYear(year1);
          expect(loadedYear1).toBe(income);
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });

  test('Property 5: Multiple years can store independent values', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(taxYear, safeIncome), { minLength: 1, maxLength: 5 }),
        (yearIncomePairs) => {
          // Clear storage before test
          mockStorage = {};
          
          // Deduplicate years (keep last value for each year)
          const uniqueYears = new Map();
          yearIncomePairs.forEach(([year, income]) => {
            uniqueYears.set(year, income);
          });
          
          // Save all values
          uniqueYears.forEach((income, year) => {
            saveNetIncomeForYear(year, income);
          });
          
          // Verify all values can be retrieved correctly
          uniqueYears.forEach((expectedIncome, year) => {
            const loaded = getNetIncomeForYear(year);
            expect(loaded).toBe(expectedIncome);
          });
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  test('Property 5: Overwriting income for same year updates value', () => {
    fc.assert(
      fc.property(
        taxYear,
        safeIncome,
        safeIncome,
        (year, income1, income2) => {
          // Clear storage before test
          mockStorage = {};
          
          // Save first income
          saveNetIncomeForYear(year, income1);
          expect(getNetIncomeForYear(year)).toBe(income1);
          
          // Save second income (overwrite)
          saveNetIncomeForYear(year, income2);
          expect(getNetIncomeForYear(year)).toBe(income2);
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  test('Property 5: Returns null for year with no saved income', () => {
    fc.assert(
      fc.property(
        taxYear,
        (year) => {
          // Clear storage before test
          mockStorage = {};
          
          // Load without saving
          const loaded = getNetIncomeForYear(year);
          
          // Should return null
          expect(loaded).toBeNull();
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  /**
   * **Feature: tax-deductible-analytics, Property 6: Province Storage Round-Trip**
   * **Validates: Requirements 6.2**
   * 
   * For any valid province code P, saving P and then loading should return P.
   */
  test('Property 6: Province round-trip - save and load returns same value', () => {
    fc.assert(
      fc.property(
        provinceCode,
        (province) => {
          // Clear storage before test
          mockStorage = {};
          
          // Save province
          saveSelectedProvince(province);
          
          // Load province
          const loaded = getSelectedProvince();
          
          // Should return the same value
          expect(loaded).toBe(province);
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });

  test('Property 6: Province defaults to ON when not set', () => {
    // Clear storage
    mockStorage = {};
    
    // Load without saving
    const loaded = getSelectedProvince();
    
    // Should default to Ontario
    expect(loaded).toBe('ON');
  });

  test('Property 6: Province overwrites previous value', () => {
    fc.assert(
      fc.property(
        provinceCode,
        provinceCode,
        (province1, province2) => {
          // Clear storage before test
          mockStorage = {};
          
          // Save first province
          saveSelectedProvince(province1);
          expect(getSelectedProvince()).toBe(province1);
          
          // Save second province (overwrite)
          saveSelectedProvince(province2);
          expect(getSelectedProvince()).toBe(province2);
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  /**
   * **Edge case tests**
   */
  test('Edge case: Zero income is stored and retrieved correctly', () => {
    mockStorage = {};
    
    saveNetIncomeForYear(2024, 0);
    const loaded = getNetIncomeForYear(2024);
    
    expect(loaded).toBe(0);
  });

  test('Edge case: Large income values are handled correctly', () => {
    fc.assert(
      fc.property(
        taxYear,
        fc.integer({ min: 1000000, max: 10000000 }),
        (year, largeIncome) => {
          mockStorage = {};
          
          saveNetIncomeForYear(year, largeIncome);
          const loaded = getNetIncomeForYear(year);
          
          expect(loaded).toBe(largeIncome);
        }
      ),
      pbtOptions({ numRuns: 20 })
    );
  });

  /**
   * **clearAllTaxSettings tests**
   */
  test('clearAllTaxSettings removes all stored values', () => {
    fc.assert(
      fc.property(
        taxYear,
        safeIncome,
        provinceCode,
        (year, income, province) => {
          mockStorage = {};
          
          // Save values
          saveNetIncomeForYear(year, income);
          saveSelectedProvince(province);
          
          // Verify saved
          expect(getNetIncomeForYear(year)).toBe(income);
          expect(getSelectedProvince()).toBe(province);
          
          // Clear all
          clearAllTaxSettings();
          
          // Verify cleared
          expect(getNetIncomeForYear(year)).toBeNull();
          expect(getSelectedProvince()).toBe('ON'); // Default
        }
      ),
      pbtOptions({ numRuns: 20 })
    );
  });

  /**
   * **Error handling tests**
   */
  test('Handles corrupted localStorage data gracefully', () => {
    // Set corrupted data directly
    mockStorage[_STORAGE_KEYS.NET_INCOME] = 'not valid json';
    
    // Should return null instead of throwing
    const loaded = getNetIncomeForYear(2024);
    expect(loaded).toBeNull();
  });

  test('Handles localStorage errors gracefully for province', () => {
    // Set corrupted data - but province is just a string, not JSON
    // So we test the default behavior
    mockStorage = {};
    
    const loaded = getSelectedProvince();
    expect(loaded).toBe('ON');
  });
});
