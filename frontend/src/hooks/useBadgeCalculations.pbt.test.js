/**
 * Property-Based Tests for Badge Calculation Functions
 * 
 * Feature: post-spec-cleanup
 * Property 1: Badge calculation purity
 * 
 * For any valid combination of badge inputs, the extracted badge calculation
 * functions shall return a string result, and calling the same function with
 * the same inputs shall always produce the same output (pure functions).
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  calculateFutureDatePreview,
  calculateAdvancedOptionsBadge,
  calculateReimbursementBadge,
  calculateInsuranceBadge,
  calculatePeopleBadge,
  calculateInvoiceBadge
} from './useBadgeCalculations';

describe('useBadgeCalculations - Property-Based Tests', () => {
  describe('Property 1: Badge calculation purity', () => {
    it('calculateFutureDatePreview is pure and returns consistent strings', () => {
      fc.assert(
        fc.property(
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          fc.integer({ min: 0, max: 12 }),
          (date, futureMonths) => {
            const sourceDate = date.toISOString().split('T')[0]; // YYYY-MM-DD format
            
            // Call twice with same inputs
            const result1 = calculateFutureDatePreview(sourceDate, futureMonths);
            const result2 = calculateFutureDatePreview(sourceDate, futureMonths);
            
            // Results must be identical (purity)
            expect(result1).toBe(result2);
            
            // Result must be a string
            expect(typeof result1).toBe('string');
            
            // Empty string for invalid inputs
            if (futureMonths <= 0) {
              expect(result1).toBe('');
            } else {
              // Non-empty string for valid inputs
              expect(result1.length).toBeGreaterThan(0);
              expect(result1).toMatch(/^through/);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('calculateAdvancedOptionsBadge is pure and returns consistent strings', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 12 }),
          fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }), { nil: null }),
          (futureMonths, dateObj) => {
            const postedDate = dateObj ? dateObj.toISOString().split('T')[0] : '';
            
            // Call twice with same inputs
            const result1 = calculateAdvancedOptionsBadge(futureMonths, postedDate);
            const result2 = calculateAdvancedOptionsBadge(futureMonths, postedDate);
            
            // Results must be identical (purity)
            expect(result1).toBe(result2);
            
            // Result must be a string
            expect(typeof result1).toBe('string');
            
            // Empty string when no data
            if (futureMonths === 0 && !postedDate) {
              expect(result1).toBe('');
            }
            
            // Contains "Future:" when futureMonths > 0
            if (futureMonths > 0) {
              expect(result1).toContain('Future:');
            }
            
            // Contains "Posted:" when postedDate is set
            if (postedDate) {
              expect(result1).toContain('Posted:');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('calculateReimbursementBadge is pure and returns consistent strings', () => {
      fc.assert(
        fc.property(
          fc.option(fc.float({ min: 0, max: 10000, noNaN: true }), { nil: null }),
          fc.option(fc.float({ min: 0, max: 10000, noNaN: true }), { nil: null }),
          (origCost, amount) => {
            const genericOriginalCost = origCost !== null ? origCost.toString() : '';
            const amountStr = amount !== null ? amount.toString() : '';
            
            // Call twice with same inputs
            const result1 = calculateReimbursementBadge(genericOriginalCost, amountStr);
            const result2 = calculateReimbursementBadge(genericOriginalCost, amountStr);
            
            // Results must be identical (purity)
            expect(result1).toBe(result2);
            
            // Result must be a string
            expect(typeof result1).toBe('string');
            
            // Empty string when missing data or no reimbursement
            if (!genericOriginalCost || !amountStr) {
              expect(result1).toBe('');
            } else {
              const origNum = parseFloat(genericOriginalCost);
              const amtNum = parseFloat(amountStr);
              
              if (origNum <= amtNum) {
                expect(result1).toBe('');
              } else {
                expect(result1).toContain('Reimbursed:');
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('calculateInsuranceBadge is pure and returns consistent strings', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.constantFrom('not_claimed', 'in_progress', 'paid', 'denied'),
          (insuranceEligible, claimStatus) => {
            // Call twice with same inputs
            const result1 = calculateInsuranceBadge(insuranceEligible, claimStatus);
            const result2 = calculateInsuranceBadge(insuranceEligible, claimStatus);
            
            // Results must be identical (purity)
            expect(result1).toBe(result2);
            
            // Result must be a string
            expect(typeof result1).toBe('string');
            
            // Empty string when not eligible
            if (!insuranceEligible) {
              expect(result1).toBe('');
            } else {
              // Contains "Claim:" when eligible
              expect(result1).toContain('Claim:');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('calculatePeopleBadge is pure and returns consistent strings', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 100 }),
              name: fc.string({ minLength: 1, maxLength: 50 })
            }),
            { minLength: 0, maxLength: 10 }
          ),
          (selectedPeople) => {
            // Call twice with same inputs
            const result1 = calculatePeopleBadge(selectedPeople);
            const result2 = calculatePeopleBadge(selectedPeople);
            
            // Results must be identical (purity)
            expect(result1).toBe(result2);
            
            // Result must be a string
            expect(typeof result1).toBe('string');
            
            // Empty string when no people
            if (selectedPeople.length === 0) {
              expect(result1).toBe('');
            } else {
              // Contains count and "person" or "people"
              expect(result1).toMatch(/\d+ (person|people)/);
              
              // Singular vs plural
              if (selectedPeople.length === 1) {
                expect(result1).toContain('person');
                expect(result1).not.toContain('people');
              } else {
                expect(result1).toContain('people');
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('calculateInvoiceBadge is pure and returns consistent strings', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.integer({ min: 1, max: 1000 }),
              filename: fc.string({ minLength: 1, maxLength: 50 })
            }),
            { minLength: 0, maxLength: 10 }
          ),
          fc.array(
            fc.record({
              file: fc.record({ name: fc.string({ minLength: 1, maxLength: 50 }) }),
              personId: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null })
            }),
            { minLength: 0, maxLength: 10 }
          ),
          (invoices, invoiceFiles) => {
            // Call twice with same inputs
            const result1 = calculateInvoiceBadge(invoices, invoiceFiles);
            const result2 = calculateInvoiceBadge(invoices, invoiceFiles);
            
            // Results must be identical (purity)
            expect(result1).toBe(result2);
            
            // Result must be a string
            expect(typeof result1).toBe('string');
            
            const totalCount = invoices.length + invoiceFiles.length;
            
            // Empty string when no invoices
            if (totalCount === 0) {
              expect(result1).toBe('');
            } else {
              // Contains count and "invoice" or "invoices"
              expect(result1).toMatch(/\d+ invoice/);
              
              // Singular vs plural
              if (totalCount === 1) {
                expect(result1).toMatch(/1 invoice$/);
              } else {
                expect(result1).toContain('invoices');
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('all badge functions handle edge cases consistently', () => {
      // Test with null/undefined/empty inputs
      expect(calculateFutureDatePreview('', 0)).toBe('');
      expect(calculateFutureDatePreview('2024-01-01', 0)).toBe('');
      expect(calculateFutureDatePreview('', 5)).toBe('');
      
      expect(calculateAdvancedOptionsBadge(0, '')).toBe('');
      expect(calculateAdvancedOptionsBadge(0, null)).toBe('');
      
      expect(calculateReimbursementBadge('', '')).toBe('');
      expect(calculateReimbursementBadge('100', '')).toBe('');
      expect(calculateReimbursementBadge('', '50')).toBe('');
      
      expect(calculateInsuranceBadge(false, 'not_claimed')).toBe('');
      expect(calculateInsuranceBadge(false, 'paid')).toBe('');
      
      expect(calculatePeopleBadge([])).toBe('');
      expect(calculatePeopleBadge(null)).toBe('');
      expect(calculatePeopleBadge(undefined)).toBe('');
      
      expect(calculateInvoiceBadge([], [])).toBe('');
      expect(calculateInvoiceBadge(null, null)).toBe('');
      expect(calculateInvoiceBadge(undefined, undefined)).toBe('');
    });
  });
});
