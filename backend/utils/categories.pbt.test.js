/**
 * Property-Based Tests for Category Validation
 * Using fast-check library for property-based testing
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');
const { CATEGORIES, BUDGETABLE_CATEGORIES, TAX_DEDUCTIBLE_CATEGORIES, isValid, isBudgetable, isTaxDeductible } = require('./categories');

describe('Categories - Property-Based Tests', () => {
  /**
   * Feature: expanded-expense-categories, Property 4: Category validation enforcement
   * Validates: Requirements 2.2, 2.3, 2.4, 2.5
   * 
   * For any string value, the system should accept it as a category if and only if 
   * it appears in the approved category list
   */
  test('Property 4: Category validation enforcement - valid categories accepted, invalid rejected', () => {
    // Test 1: All valid categories should be accepted
    fc.assert(
      fc.property(
        fc.constantFrom(...CATEGORIES),
        (category) => {
          // For any valid category, isValid should return true
          expect(isValid(category)).toBe(true);
          return true;
        }
      ),
      pbtOptions()
    );

    // Test 2: Invalid categories should be rejected
    // Generate random strings that are NOT in the approved list
    const invalidCategoryArbitrary = fc.string({ minLength: 1, maxLength: 50 })
      .filter(str => !CATEGORIES.includes(str));

    fc.assert(
      fc.property(
        invalidCategoryArbitrary,
        (category) => {
          // For any invalid category, isValid should return false
          expect(isValid(category)).toBe(false);
          return true;
        }
      ),
      pbtOptions()
    );

    // Test 3: Case sensitivity - categories with different casing should be rejected
    fc.assert(
      fc.property(
        fc.constantFrom(...CATEGORIES),
        (category) => {
          // Test uppercase version
          const uppercase = category.toUpperCase();
          if (uppercase !== category && !CATEGORIES.includes(uppercase)) {
            expect(isValid(uppercase)).toBe(false);
          }
          
          // Test lowercase version
          const lowercase = category.toLowerCase();
          if (lowercase !== category && !CATEGORIES.includes(lowercase)) {
            expect(isValid(lowercase)).toBe(false);
          }
          
          return true;
        }
      ),
      pbtOptions()
    );

    // Test 4: Categories with extra whitespace should be rejected
    fc.assert(
      fc.property(
        fc.constantFrom(...CATEGORIES),
        (category) => {
          const withLeadingSpace = ' ' + category;
          const withTrailingSpace = category + ' ';
          const withBothSpaces = ' ' + category + ' ';
          
          // Unless the category with spaces is actually in the list, it should be rejected
          if (!CATEGORIES.includes(withLeadingSpace)) {
            expect(isValid(withLeadingSpace)).toBe(false);
          }
          if (!CATEGORIES.includes(withTrailingSpace)) {
            expect(isValid(withTrailingSpace)).toBe(false);
          }
          if (!CATEGORIES.includes(withBothSpaces)) {
            expect(isValid(withBothSpaces)).toBe(false);
          }
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Additional property test: Budgetable category validation
   * Validates that budgetable categories are a subset of all categories
   */
  test('Property: Budgetable categories are valid categories', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...BUDGETABLE_CATEGORIES),
        (category) => {
          // Every budgetable category must be a valid category
          expect(isValid(category)).toBe(true);
          expect(isBudgetable(category)).toBe(true);
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Additional property test: Tax-deductible category validation
   * Validates that tax-deductible categories are a subset of all categories
   */
  test('Property: Tax-deductible categories are valid categories', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TAX_DEDUCTIBLE_CATEGORIES),
        (category) => {
          // Every tax-deductible category must be a valid category
          expect(isValid(category)).toBe(true);
          expect(isTaxDeductible(category)).toBe(true);
          // Tax-deductible categories should start with "Tax - "
          expect(category.startsWith('Tax - ')).toBe(true);
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Additional property test: Mutual exclusivity of budgetable and tax-deductible
   * Validates that no category is both budgetable and tax-deductible
   */
  test('Property: Budgetable and tax-deductible categories are mutually exclusive', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CATEGORIES),
        (category) => {
          // A category cannot be both budgetable and tax-deductible
          const isBudget = isBudgetable(category);
          const isTax = isTaxDeductible(category);
          
          // If it's tax-deductible, it should not be budgetable
          if (isTax) {
            expect(isBudget).toBe(false);
          }
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Additional property test: Category list completeness
   * Validates that all categories are accounted for in either budgetable or tax-deductible lists
   */
  test('Property: All categories are either budgetable or tax-deductible (or neither)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CATEGORIES),
        (category) => {
          const isBudget = isBudgetable(category);
          const isTax = isTaxDeductible(category);
          
          // Every category should be valid
          expect(isValid(category)).toBe(true);
          
          // Category should be in at least one of the lists or be "Other"
          // (Some categories might not be budgetable or tax-deductible)
          const isInSomeList = isBudget || isTax || 
            BUDGETABLE_CATEGORIES.includes(category) || 
            TAX_DEDUCTIBLE_CATEGORIES.includes(category);
          
          // This should always be true for our current category structure
          expect(isInSomeList || category === 'Other').toBe(true);
          
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: personal-care-category, Property 1: Category validation accepts Personal Care
   * Validates: Requirements 1.2, 3.3
   * 
   * For any expense with category "Personal Care", the validation function isValid("Personal Care") 
   * should return true
   */
  test('Property 1: Category validation accepts Personal Care', () => {
    fc.assert(
      fc.property(
        fc.constant('Personal Care'),
        (category) => {
          // Personal Care should be a valid category
          expect(isValid(category)).toBe(true);
          // Personal Care should be in the CATEGORIES array
          expect(CATEGORIES.includes(category)).toBe(true);
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: personal-care-category, Property 2: Personal Care is budgetable
   * Validates: Requirements 1.5, 3.2
   * 
   * For any budget creation request with category "Personal Care", the validation function 
   * isBudgetable("Personal Care") should return true
   */
  test('Property 2: Personal Care is budgetable', () => {
    fc.assert(
      fc.property(
        fc.constant('Personal Care'),
        (category) => {
          // Personal Care should be budgetable
          expect(isBudgetable(category)).toBe(true);
          // Personal Care should be in the BUDGETABLE_CATEGORIES array
          expect(BUDGETABLE_CATEGORIES.includes(category)).toBe(true);
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: personal-care-category, Property 3: Personal Care is not tax-deductible
   * Validates: Requirements 3.3
   * 
   * For any expense with category "Personal Care", the function isTaxDeductible("Personal Care") 
   * should return false
   */
  test('Property 3: Personal Care is not tax-deductible', () => {
    fc.assert(
      fc.property(
        fc.constant('Personal Care'),
        (category) => {
          // Personal Care should NOT be tax-deductible
          expect(isTaxDeductible(category)).toBe(false);
          // Personal Care should NOT be in the TAX_DEDUCTIBLE_CATEGORIES array
          expect(TAX_DEDUCTIBLE_CATEGORIES.includes(category)).toBe(false);
          return true;
        }
      ),
      pbtOptions()
    );
  });

  /**
   * Feature: personal-care-category, Property 7: Category list ordering is maintained
   * Validates: Requirements 1.1, 3.1
   * 
   * For any category list retrieval, "Personal Care" should appear in alphabetical order 
   * between "Insurance" and "Pet Care"
   */
  test('Property 7: Category list ordering is maintained', () => {
    fc.assert(
      fc.property(
        fc.constant(CATEGORIES),
        (categories) => {
          // Find the indices of the relevant categories
          const insuranceIndex = categories.indexOf('Insurance');
          const personalCareIndex = categories.indexOf('Personal Care');
          const petCareIndex = categories.indexOf('Pet Care');
          
          // All three categories should exist in the list
          expect(insuranceIndex).toBeGreaterThanOrEqual(0);
          expect(personalCareIndex).toBeGreaterThanOrEqual(0);
          expect(petCareIndex).toBeGreaterThanOrEqual(0);
          
          // Personal Care should come after Insurance
          expect(personalCareIndex).toBeGreaterThan(insuranceIndex);
          
          // Personal Care should come before Pet Care
          expect(personalCareIndex).toBeLessThan(petCareIndex);
          
          // Verify alphabetical ordering for the non-tax category list
          // (Tax categories are at the end and follow a different pattern)
          // Note: "Other" is intentionally placed at the end before tax categories
          const nonTaxCategories = categories.filter(cat => !cat.startsWith('Tax - '));
          const nonTaxWithoutOther = nonTaxCategories.filter(cat => cat !== 'Other');
          
          // Check that all categories except "Other" are in alphabetical order
          for (let i = 1; i < nonTaxWithoutOther.length; i++) {
            const prev = nonTaxWithoutOther[i - 1];
            const curr = nonTaxWithoutOther[i];
            // Each category should be alphabetically after the previous one
            expect(prev.localeCompare(curr)).toBeLessThan(0);
          }
          
          // Verify "Other" comes after all alphabetically sorted categories but before tax categories
          const otherIndex = categories.indexOf('Other');
          const firstTaxIndex = categories.findIndex(cat => cat.startsWith('Tax - '));
          
          if (otherIndex >= 0 && firstTaxIndex >= 0) {
            // "Other" should come before tax categories
            expect(otherIndex).toBeLessThan(firstTaxIndex);
            // "Other" should come after all other non-tax categories
            expect(otherIndex).toBeGreaterThan(personalCareIndex);
          }
          
          return true;
        }
      ),
      pbtOptions()
    );
  });
});
