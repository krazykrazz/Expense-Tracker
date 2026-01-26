/**
 * Property-Based Tests for Tax Credit Calculator
 * Tests universal properties of tax credit calculation functions
 * 
 * **Validates: Requirements 4.1, 4.2, 4.6, 5.1, 5.2, 5.4, 6.3, 6.4, 6.6**
 */

import { describe, test, expect } from 'vitest';
import fc from 'fast-check';
import { pbtOptions, year } from '../test/pbtArbitraries';
import { getTaxRatesForYear, TAX_RATES } from './taxRatesConfig';
import {
  calculateAGIThreshold,
  calculateDeductibleMedical,
  calculateFederalMedicalCredit,
  calculateDonationCredit,
  calculateProvincialMedicalCredit,
  calculateAllTaxCredits
} from './taxCreditCalculator';

// Province code arbitrary
const provinceCode = fc.constantFrom('AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT');

// Safe income arbitrary (positive values)
const safeIncome = fc.integer({ min: 0, max: 500000 });

// Safe expense amount arbitrary
const safeExpenseAmount = fc.integer({ min: 0, max: 100000 });

// Tax year arbitrary (years with configured rates)
const taxYear = fc.constantFrom(2022, 2023, 2024, 2025, 2026);

describe('Tax Credit Calculator Property-Based Tests', () => {
  /**
   * **Feature: tax-deductible-analytics, Property 7: AGI Threshold Calculation**
   * **Validates: Requirements 4.1, 4.2**
   * 
   * For any net income N and tax year Y with configured federal threshold max M,
   * the calculated AGI threshold should equal min(N × 0.03, M).
   */
  test('Property 7: AGI threshold equals min(income × 0.03, federal max)', () => {
    fc.assert(
      fc.property(
        safeIncome,
        taxYear,
        (netIncome, year) => {
          const { federal } = getTaxRatesForYear(year);
          const threshold = calculateAGIThreshold(netIncome, year);
          
          const expectedThreshold = Math.min(
            netIncome * federal.agiThresholdPercent,
            federal.agiThresholdMax
          );
          
          expect(threshold).toBeCloseTo(expectedThreshold, 2);
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });

  /**
   * **Feature: tax-deductible-analytics, Property 7 (edge case): Zero/negative income**
   */
  test('Property 7 (edge case): AGI threshold is 0 for zero or negative income', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100000, max: 0 }),
        taxYear,
        (netIncome, year) => {
          const threshold = calculateAGIThreshold(netIncome, year);
          expect(threshold).toBe(0);
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  /**
   * **Feature: tax-deductible-analytics, Property 8: Deductible Amount Calculation**
   * **Validates: Requirements 4.6, 5.5**
   * 
   * For any medical expense total T and AGI threshold A,
   * the deductible amount should equal max(0, T - A).
   */
  test('Property 8: Deductible amount equals max(0, medical - threshold)', () => {
    fc.assert(
      fc.property(
        safeExpenseAmount,
        safeExpenseAmount,
        (medicalTotal, agiThreshold) => {
          const deductible = calculateDeductibleMedical(medicalTotal, agiThreshold);
          const expected = Math.max(0, medicalTotal - agiThreshold);
          
          expect(deductible).toBe(expected);
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });

  /**
   * **Feature: tax-deductible-analytics, Property 8 (invariant): Deductible is never negative**
   */
  test('Property 8 (invariant): Deductible amount is never negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10000, max: 100000 }),
        fc.integer({ min: -10000, max: 100000 }),
        (medicalTotal, agiThreshold) => {
          const deductible = calculateDeductibleMedical(medicalTotal, agiThreshold);
          expect(deductible).toBeGreaterThanOrEqual(0);
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });


  /**
   * **Feature: tax-deductible-analytics, Property 9: Federal Tax Credit Calculation**
   * **Validates: Requirements 5.1, 5.2, 5.4**
   * 
   * For any deductible medical amount D and donation total T:
   * - Medical credit = D × 0.15
   * - Donation credit = min(T, 200) × 0.15 + max(0, T - 200) × 0.29
   * - Total federal credit = Medical credit + Donation credit
   */
  test('Property 9: Federal medical credit equals deductible × 15%', () => {
    fc.assert(
      fc.property(
        safeExpenseAmount,
        taxYear,
        (deductibleAmount, year) => {
          const { federal } = getTaxRatesForYear(year);
          const credit = calculateFederalMedicalCredit(deductibleAmount, year);
          const expected = deductibleAmount * federal.medicalCreditRate;
          
          expect(credit).toBeCloseTo(expected, 2);
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });

  test('Property 9: Federal donation credit follows tiered calculation', () => {
    fc.assert(
      fc.property(
        safeExpenseAmount,
        taxYear,
        (donationTotal, year) => {
          const { federal } = getTaxRatesForYear(year);
          const credit = calculateDonationCredit(donationTotal, year, 'federal');
          
          const firstTier = Math.min(donationTotal, federal.donationFirstTierLimit);
          const secondTier = Math.max(0, donationTotal - federal.donationFirstTierLimit);
          const expected = (firstTier * federal.donationFirstTierRate) + 
                          (secondTier * federal.donationSecondTierRate);
          
          expect(credit).toBeCloseTo(expected, 2);
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });

  test('Property 9 (edge case): Zero deductible produces zero credit', () => {
    fc.assert(
      fc.property(
        taxYear,
        (year) => {
          const medicalCredit = calculateFederalMedicalCredit(0, year);
          const donationCredit = calculateDonationCredit(0, year, 'federal');
          
          expect(medicalCredit).toBe(0);
          expect(donationCredit).toBe(0);
        }
      ),
      pbtOptions({ numRuns: 20 })
    );
  });

  /**
   * **Feature: tax-deductible-analytics, Property 10: Provincial Tax Credit Calculation**
   * **Validates: Requirements 6.3, 6.4, 6.6**
   * 
   * For any deductible medical amount D, donation total T, and province P:
   * - Medical credit = D × provincial medical rate
   * - Donation credit = tiered calculation with provincial rates
   * - Total provincial credit = Medical credit + Donation credit
   * - Total tax savings = Federal total + Provincial total
   */
  test('Property 10: Provincial medical credit uses province-specific rate', () => {
    fc.assert(
      fc.property(
        safeExpenseAmount,
        taxYear,
        provinceCode,
        (deductibleAmount, year, province) => {
          const { provincial } = getTaxRatesForYear(year);
          const credit = calculateProvincialMedicalCredit(deductibleAmount, year, province);
          const expected = deductibleAmount * provincial[province].medicalCreditRate;
          
          expect(credit).toBeCloseTo(expected, 2);
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });

  test('Property 10: Provincial donation credit follows tiered calculation', () => {
    fc.assert(
      fc.property(
        safeExpenseAmount,
        taxYear,
        provinceCode,
        (donationTotal, year, province) => {
          const { provincial } = getTaxRatesForYear(year);
          const rates = provincial[province];
          const credit = calculateDonationCredit(donationTotal, year, province);
          
          const firstTier = Math.min(donationTotal, rates.donationFirstTierLimit);
          const secondTier = Math.max(0, donationTotal - rates.donationFirstTierLimit);
          const expected = (firstTier * rates.donationFirstTierRate) + 
                          (secondTier * rates.donationSecondTierRate);
          
          expect(credit).toBeCloseTo(expected, 2);
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });

  test('Property 10: Total tax savings equals federal + provincial', () => {
    fc.assert(
      fc.property(
        safeExpenseAmount,
        safeExpenseAmount,
        safeIncome,
        taxYear,
        provinceCode,
        (medicalTotal, donationTotal, netIncome, year, province) => {
          const result = calculateAllTaxCredits({
            medicalTotal,
            donationTotal,
            netIncome,
            year,
            provinceCode: province
          });
          
          const expectedTotal = result.federal.total + result.provincial.total;
          expect(result.totalTaxSavings).toBeCloseTo(expectedTotal, 2);
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });

  test('Property 10 (edge case): Invalid province returns zero credits', () => {
    fc.assert(
      fc.property(
        safeExpenseAmount,
        taxYear,
        (amount, year) => {
          const medicalCredit = calculateProvincialMedicalCredit(amount, year, 'INVALID');
          const donationCredit = calculateDonationCredit(amount, year, 'INVALID');
          
          expect(medicalCredit).toBe(0);
          expect(donationCredit).toBe(0);
        }
      ),
      pbtOptions({ numRuns: 20 })
    );
  });


  /**
   * **Feature: tax-deductible-analytics, calculateAllTaxCredits comprehensive tests**
   * **Validates: Requirements 5.4, 6.6**
   */
  test('calculateAllTaxCredits returns complete breakdown structure', () => {
    fc.assert(
      fc.property(
        safeExpenseAmount,
        safeExpenseAmount,
        safeIncome,
        taxYear,
        provinceCode,
        (medicalTotal, donationTotal, netIncome, year, province) => {
          const result = calculateAllTaxCredits({
            medicalTotal,
            donationTotal,
            netIncome,
            year,
            provinceCode: province
          });
          
          // Verify structure
          expect(result).toHaveProperty('agiThreshold');
          expect(result).toHaveProperty('agiThresholdMax');
          expect(result).toHaveProperty('deductibleMedical');
          expect(result).toHaveProperty('thresholdProgress');
          expect(result).toHaveProperty('federal');
          expect(result).toHaveProperty('provincial');
          expect(result).toHaveProperty('totalTaxSavings');
          expect(result).toHaveProperty('fallbackUsed');
          
          // Verify federal breakdown
          expect(result.federal).toHaveProperty('medicalCredit');
          expect(result.federal).toHaveProperty('donationCredit');
          expect(result.federal).toHaveProperty('total');
          expect(result.federal).toHaveProperty('rates');
          
          // Verify provincial breakdown
          expect(result.provincial).toHaveProperty('medicalCredit');
          expect(result.provincial).toHaveProperty('donationCredit');
          expect(result.provincial).toHaveProperty('total');
          expect(result.provincial).toHaveProperty('provinceName');
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  test('calculateAllTaxCredits threshold progress calculation', () => {
    fc.assert(
      fc.property(
        safeExpenseAmount,
        safeIncome.filter(n => n > 0), // Ensure positive income for valid threshold
        taxYear,
        provinceCode,
        (medicalTotal, netIncome, year, province) => {
          const result = calculateAllTaxCredits({
            medicalTotal,
            donationTotal: 0,
            netIncome,
            year,
            provinceCode: province
          });
          
          // Threshold progress should be medical / threshold
          if (result.agiThreshold > 0) {
            const expectedProgress = medicalTotal / result.agiThreshold;
            expect(result.thresholdProgress).toBeCloseTo(expectedProgress, 2);
          }
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  test('calculateAllTaxCredits federal total equals sum of credits', () => {
    fc.assert(
      fc.property(
        safeExpenseAmount,
        safeExpenseAmount,
        safeIncome,
        taxYear,
        provinceCode,
        (medicalTotal, donationTotal, netIncome, year, province) => {
          const result = calculateAllTaxCredits({
            medicalTotal,
            donationTotal,
            netIncome,
            year,
            provinceCode: province
          });
          
          const expectedFederalTotal = result.federal.medicalCredit + result.federal.donationCredit;
          expect(result.federal.total).toBeCloseTo(expectedFederalTotal, 2);
          
          const expectedProvincialTotal = result.provincial.medicalCredit + result.provincial.donationCredit;
          expect(result.provincial.total).toBeCloseTo(expectedProvincialTotal, 2);
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  /**
   * **Invariant tests: All credits should be non-negative**
   */
  test('Invariant: All calculated credits are non-negative', () => {
    fc.assert(
      fc.property(
        safeExpenseAmount,
        safeExpenseAmount,
        safeIncome,
        taxYear,
        provinceCode,
        (medicalTotal, donationTotal, netIncome, year, province) => {
          const result = calculateAllTaxCredits({
            medicalTotal,
            donationTotal,
            netIncome,
            year,
            provinceCode: province
          });
          
          expect(result.agiThreshold).toBeGreaterThanOrEqual(0);
          expect(result.deductibleMedical).toBeGreaterThanOrEqual(0);
          expect(result.federal.medicalCredit).toBeGreaterThanOrEqual(0);
          expect(result.federal.donationCredit).toBeGreaterThanOrEqual(0);
          expect(result.federal.total).toBeGreaterThanOrEqual(0);
          expect(result.provincial.medicalCredit).toBeGreaterThanOrEqual(0);
          expect(result.provincial.donationCredit).toBeGreaterThanOrEqual(0);
          expect(result.provincial.total).toBeGreaterThanOrEqual(0);
          expect(result.totalTaxSavings).toBeGreaterThanOrEqual(0);
        }
      ),
      pbtOptions({ numRuns: 100 })
    );
  });
});
