/**
 * Property-Based Tests for Tax Credit Calculator
 * Tests universal properties of tax credit calculation functions
 * 
 * **Validates: Requirements 4.1, 4.2, 4.6, 5.1, 5.2, 5.4, 6.3, 6.4, 6.6**
  *
 * @invariant Tax Credit Math: For any combination of medical expenses, income, and province, the calculated tax credits are non-negative; the AGI threshold is correctly applied; federal and provincial credits follow their respective rate formulas. Randomization covers diverse financial scenarios.
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


/**
 * **Feature: tax-deductible-analytics, Property 11: Year-Specific Rate Usage**
 * **Validates: Requirements 7.5**
 * 
 * For any tax year Y with configured rates, all calculations for year Y
 * should use the rates configured for year Y, not rates from any other year.
 */
describe('Year-Specific Rate Usage Property Tests', () => {
  // Years with configured rates
  const configuredYears = [2022, 2023, 2024, 2025, 2026];
  
  test('Property 11: AGI threshold uses year-specific federal max', () => {
    fc.assert(
      fc.property(
        safeIncome.filter(n => n > 100000), // High income to hit the max threshold
        fc.constantFrom(...configuredYears),
        (netIncome, year) => {
          const { federal } = getTaxRatesForYear(year);
          const threshold = calculateAGIThreshold(netIncome, year);
          
          // For high income, threshold should equal the year-specific max
          expect(threshold).toBe(federal.agiThresholdMax);
          
          // Verify the max is different for different years
          const otherYears = configuredYears.filter(y => y !== year);
          const otherMaxes = otherYears.map(y => getTaxRatesForYear(y).federal.agiThresholdMax);
          
          // At least some years should have different thresholds
          const hasDifferentThresholds = otherMaxes.some(max => max !== federal.agiThresholdMax);
          // This is expected to be true since thresholds change with inflation
          expect(hasDifferentThresholds || otherMaxes.length === 0).toBe(true);
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  test('Property 11: Federal rates are year-specific', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...configuredYears),
        (year) => {
          const { federal } = getTaxRatesForYear(year);
          
          // Verify the rates object has all required properties
          expect(federal).toHaveProperty('medicalCreditRate');
          expect(federal).toHaveProperty('donationFirstTierRate');
          expect(federal).toHaveProperty('donationSecondTierRate');
          expect(federal).toHaveProperty('donationFirstTierLimit');
          expect(federal).toHaveProperty('agiThresholdPercent');
          expect(federal).toHaveProperty('agiThresholdMax');
          
          // Verify the rates are from the correct year's configuration
          expect(TAX_RATES.federal[year]).toBeDefined();
          expect(federal.agiThresholdMax).toBe(TAX_RATES.federal[year].agiThresholdMax);
        }
      ),
      pbtOptions({ numRuns: 20 })
    );
  });

  test('Property 11: Provincial rates are year-specific', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...configuredYears),
        provinceCode,
        (year, province) => {
          const { provincial } = getTaxRatesForYear(year);
          
          // Verify the provincial rates for this year and province exist
          expect(provincial[province]).toBeDefined();
          expect(provincial[province]).toHaveProperty('medicalCreditRate');
          expect(provincial[province]).toHaveProperty('donationFirstTierRate');
          expect(provincial[province]).toHaveProperty('donationSecondTierRate');
          expect(provincial[province]).toHaveProperty('name');
          
          // Verify the rates match the year's configuration
          expect(TAX_RATES.provincial[year][province]).toBeDefined();
          expect(provincial[province].medicalCreditRate).toBe(
            TAX_RATES.provincial[year][province].medicalCreditRate
          );
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });

  test('Property 11: calculateAllTaxCredits uses year-specific rates', () => {
    fc.assert(
      fc.property(
        safeExpenseAmount,
        safeExpenseAmount,
        safeIncome,
        fc.constantFrom(...configuredYears),
        provinceCode,
        (medicalTotal, donationTotal, netIncome, year, province) => {
          const result = calculateAllTaxCredits({
            medicalTotal,
            donationTotal,
            netIncome,
            year,
            provinceCode: province
          });
          
          // Verify the rates in the result match the year's configuration
          expect(result.federal.rates.agiThresholdMax).toBe(
            TAX_RATES.federal[year].agiThresholdMax
          );
          expect(result.provincial.rates.medicalCreditRate).toBe(
            TAX_RATES.provincial[year][province].medicalCreditRate
          );
          
          // Verify fallbackUsed is false for configured years
          expect(result.fallbackUsed).toBe(false);
        }
      ),
      pbtOptions({ numRuns: 50 })
    );
  });
});

/**
 * **Feature: tax-deductible-analytics, Property 12: Rate Fallback Behavior**
 * **Validates: Requirements 7.6**
 * 
 * For any tax year Y without configured rates, the system should use rates
 * from the most recent configured year and set the fallbackUsed flag to true.
 */
describe('Rate Fallback Behavior Property Tests', () => {
  // Years without configured rates (future years beyond configuration)
  const unconfiguredYears = [2027, 2028, 2029, 2030];
  
  // Most recent configured year
  const mostRecentYear = Math.max(...Object.keys(TAX_RATES.federal).map(Number));
  
  test('Property 12: Unconfigured years use most recent rates', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...unconfiguredYears),
        (year) => {
          const { federal, provincial, fallbackUsed, fallbackYear } = getTaxRatesForYear(year);
          
          // Should use fallback
          expect(fallbackUsed).toBe(true);
          expect(fallbackYear).toBe(mostRecentYear);
          
          // Rates should match the most recent year
          expect(federal.agiThresholdMax).toBe(TAX_RATES.federal[mostRecentYear].agiThresholdMax);
          expect(federal.medicalCreditRate).toBe(TAX_RATES.federal[mostRecentYear].medicalCreditRate);
        }
      ),
      pbtOptions({ numRuns: 20 })
    );
  });

  test('Property 12: Fallback provincial rates match most recent year', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...unconfiguredYears),
        provinceCode,
        (year, province) => {
          const { provincial, fallbackUsed } = getTaxRatesForYear(year);
          
          expect(fallbackUsed).toBe(true);
          
          // Provincial rates should match the most recent year
          expect(provincial[province].medicalCreditRate).toBe(
            TAX_RATES.provincial[mostRecentYear][province].medicalCreditRate
          );
          expect(provincial[province].donationFirstTierRate).toBe(
            TAX_RATES.provincial[mostRecentYear][province].donationFirstTierRate
          );
        }
      ),
      pbtOptions({ numRuns: 30 })
    );
  });

  test('Property 12: calculateAllTaxCredits sets fallbackUsed for unconfigured years', () => {
    fc.assert(
      fc.property(
        safeExpenseAmount,
        safeExpenseAmount,
        safeIncome,
        fc.constantFrom(...unconfiguredYears),
        provinceCode,
        (medicalTotal, donationTotal, netIncome, year, province) => {
          const result = calculateAllTaxCredits({
            medicalTotal,
            donationTotal,
            netIncome,
            year,
            provinceCode: province
          });
          
          // Verify fallbackUsed is true for unconfigured years
          expect(result.fallbackUsed).toBe(true);
          expect(result.fallbackYear).toBe(mostRecentYear);
          
          // Verify calculations still work correctly with fallback rates
          expect(result.totalTaxSavings).toBeGreaterThanOrEqual(0);
          expect(result.federal.total).toBeGreaterThanOrEqual(0);
          expect(result.provincial.total).toBeGreaterThanOrEqual(0);
        }
      ),
      pbtOptions({ numRuns: 30 })
    );
  });

  test('Property 12: Fallback calculations produce valid results', () => {
    fc.assert(
      fc.property(
        safeExpenseAmount.filter(n => n > 0),
        safeExpenseAmount.filter(n => n > 0),
        safeIncome.filter(n => n > 0),
        fc.constantFrom(...unconfiguredYears),
        provinceCode,
        (medicalTotal, donationTotal, netIncome, year, province) => {
          const result = calculateAllTaxCredits({
            medicalTotal,
            donationTotal,
            netIncome,
            year,
            provinceCode: province
          });
          
          // Even with fallback, calculations should be valid
          expect(result.agiThreshold).toBeGreaterThan(0);
          expect(result.federal.rates).toBeDefined();
          expect(result.provincial.rates).toBeDefined();
          expect(result.provincial.provinceName).toBeDefined();
          
          // Total should equal sum of federal and provincial
          expect(result.totalTaxSavings).toBeCloseTo(
            result.federal.total + result.provincial.total,
            2
          );
        }
      ),
      pbtOptions({ numRuns: 30 })
    );
  });

  test('Property 12: Very old years also use fallback (oldest configured)', () => {
    // Years before the oldest configured year
    const veryOldYears = [2018, 2019, 2020, 2021];
    const oldestConfiguredYear = Math.min(...Object.keys(TAX_RATES.federal).map(Number));
    
    fc.assert(
      fc.property(
        fc.constantFrom(...veryOldYears.filter(y => y < oldestConfiguredYear)),
        (year) => {
          // Skip if year is actually configured
          if (TAX_RATES.federal[year]) return true;
          
          const { fallbackUsed } = getTaxRatesForYear(year);
          
          // Should use fallback for years before configuration
          expect(fallbackUsed).toBe(true);
        }
      ),
      pbtOptions({ numRuns: 10 })
    );
  });
});
