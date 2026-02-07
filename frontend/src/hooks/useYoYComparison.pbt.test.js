import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as fc from 'fast-check';
import useYoYComparison from './useYoYComparison';
import * as expenseApi from '../services/expenseApi';
import { calculatePercentageChange } from '../utils/yoyComparison';

// Mock the expenseApi module
vi.mock('../services/expenseApi', () => ({
  getTaxDeductibleSummary: vi.fn(),
}));

describe('useYoYComparison - Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 12: YoY calculateChange matches utility
   * 
   * For any pair of non-negative numbers (current, previous), the hook's 
   * calculateChange(current, previous) SHALL return the same result as 
   * calculatePercentageChange(current, previous) from the yoyComparison utility.
   * 
   * This is a model-based property — the hook's wrapper must be a transparent pass-through.
   * 
   * Feature: frontend-custom-hooks, Property 12: YoY calculateChange matches utility
   * Validates: Requirements 6.2
   */
  it('Property 12: calculateChange matches yoyComparison utility', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 100000 }), // current value
        fc.integer({ min: 0, max: 100000 }), // previous value
        async (current, previous) => {
          // Mock the API to return dummy data (not used in this test)
          expenseApi.getTaxDeductibleSummary.mockResolvedValue({
            medicalTotal: 0,
            donationTotal: 0,
            totalDeductible: 0,
          });

          // Render the hook
          const { result } = renderHook(() =>
            useYoYComparison({ year: 2024, refreshTrigger: 0 })
          );

          // Wait for the hook to initialize
          await waitFor(() => {
            expect(result.current.yoyLoading).toBe(false);
          });

          // Call the hook's calculateChange function
          const hookResult = result.current.calculateChange(current, previous);

          // Call the utility function directly
          const utilityResult = calculatePercentageChange(current, previous);

          // The hook's result must match the utility's result exactly
          expect(hookResult).toEqual(utilityResult);
          expect(hookResult.change).toBe(utilityResult.change);
          expect(hookResult.direction).toBe(utilityResult.direction);
          expect(hookResult.formatted).toBe(utilityResult.formatted);
        }
      ),
      { numRuns: 100 }
    );
  });
});
