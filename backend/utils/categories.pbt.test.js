/**
 * Property-Based Tests for Category Validation
 * Using fast-check library for property-based testing
 */

const fc = require('fast-check');
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
      { numRuns: 100 }
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
      { numRuns: 100 }
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
      { numRuns: 100 }
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
      { numRuns: 100 }
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
      { numRuns: 100 }
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
      { numRuns: 100 }
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
      { numRuns: 100 }
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
      { numRuns: 100 }
    );
  });
});
