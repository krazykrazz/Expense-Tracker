/**
 * Property-Based Tests for Category Validation
 * Using fast-check library for property-based testing
 */

const fc = require('fast-check');
const { CATEGORIES } = require('../utils/categories');
const { isValid: isValidCategory } = require('../utils/categories');

describe('Category Validation - Property-Based Tests', () => {
  /**
   * Feature: expanded-expense-categories, Property 9: Category validation
   * Validates: Requirements 5.1, 5.3, 5.4
   * 
   * For any category value, validation should succeed if and only if 
   * the category is in the approved list
   */
  test('Property 9: Category validation - valid categories accepted, invalid rejected', () => {
    // Test 1: All valid categories should pass validation
    fc.assert(
      fc.property(
        fc.constantFrom(...CATEGORIES),
        (category) => {
          // For any valid category, validation should pass
          const isValid = isValidCategory(category);
          expect(isValid).toBe(true);
          
          // The category should be in the approved list
          expect(CATEGORIES.includes(category)).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );

    // Test 2: Invalid categories should fail validation
    const invalidCategoryArbitrary = fc.string({ minLength: 1, maxLength: 50 })
      .filter(str => !CATEGORIES.includes(str) && str.trim().length > 0);

    fc.assert(
      fc.property(
        invalidCategoryArbitrary,
        (category) => {
          // For any invalid category, validation should fail
          const isValid = isValidCategory(category);
          expect(isValid).toBe(false);
          
          // The category should NOT be in the approved list
          expect(CATEGORIES.includes(category)).toBe(false);
          
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
          // Test uppercase version (unless it's already the valid form)
          const uppercase = category.toUpperCase();
          if (uppercase !== category && !CATEGORIES.includes(uppercase)) {
            expect(isValidCategory(uppercase)).toBe(false);
          }
          
          // Test lowercase version (unless it's already the valid form)
          const lowercase = category.toLowerCase();
          if (lowercase !== category && !CATEGORIES.includes(lowercase)) {
            expect(isValidCategory(lowercase)).toBe(false);
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
            expect(isValidCategory(withLeadingSpace)).toBe(false);
          }
          if (!CATEGORIES.includes(withTrailingSpace)) {
            expect(isValidCategory(withTrailingSpace)).toBe(false);
          }
          if (!CATEGORIES.includes(withBothSpaces)) {
            expect(isValidCategory(withBothSpaces)).toBe(false);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );

    // Test 5: Empty string and null should be rejected
    expect(isValidCategory('')).toBe(false);
    expect(isValidCategory(null)).toBe(false);
    expect(isValidCategory(undefined)).toBe(false);
  });

  /**
   * Additional property test: Category validation is consistent with categories module
   */
  test('Property: Category validation matches categories module', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 100 }),
        (category) => {
          // The validation logic should be consistent
          const isValidInModule = isValidCategory(category);
          
          // If it's valid in the module, it should be in CATEGORIES
          if (isValidInModule) {
            expect(CATEGORIES.includes(category)).toBe(true);
          }
          
          // If it's in CATEGORIES, it should be valid in the module
          if (CATEGORIES.includes(category)) {
            expect(isValidInModule).toBe(true);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Additional property test: Legacy "Food" category is rejected
   * Validates that the old "Food" category is no longer accepted after migration
   */
  test('Property: Legacy "Food" category is rejected', () => {
    // "Food" should not be in the valid categories list
    expect(CATEGORIES.includes('Food')).toBe(false);
    expect(isValidCategory('Food')).toBe(false);
    
    // "Dining Out" should be the replacement
    expect(CATEGORIES.includes('Dining Out')).toBe(true);
    expect(isValidCategory('Dining Out')).toBe(true);
  });

  /**
   * Feature: personal-care-category, Property 6: Personal Care category validation
   * Validates: Requirements 4.1, 4.2
   * 
   * Personal Care should be accepted as a valid category
   */
  test('Property 6: Personal Care is a valid category', () => {
    // Test that "Personal Care" is in the valid categories list
    expect(CATEGORIES.includes('Personal Care')).toBe(true);
    
    // Test that "Personal Care" passes validation
    expect(isValidCategory('Personal Care')).toBe(true);
    
    // Property test: For any number of CSV rows with "Personal Care" category,
    // all should pass validation
    fc.assert(
      fc.property(
        fc.array(fc.constant('Personal Care'), { minLength: 1, maxLength: 100 }),
        (categories) => {
          // For any array of "Personal Care" categories, all should be valid
          const allValid = categories.every(cat => isValidCategory(cat));
          expect(allValid).toBe(true);
          
          // All should be in the CATEGORIES list
          const allInList = categories.every(cat => CATEGORIES.includes(cat));
          expect(allInList).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
    
    // Test that "Personal Care" appears in alphabetical order between "Insurance" and "Pet Care"
    const personalCareIndex = CATEGORIES.indexOf('Personal Care');
    const insuranceIndex = CATEGORIES.indexOf('Insurance');
    const petCareIndex = CATEGORIES.indexOf('Pet Care');
    
    expect(personalCareIndex).toBeGreaterThan(-1); // Personal Care exists
    expect(insuranceIndex).toBeGreaterThan(-1); // Insurance exists
    expect(petCareIndex).toBeGreaterThan(-1); // Pet Care exists
    expect(personalCareIndex).toBeGreaterThan(insuranceIndex); // Personal Care comes after Insurance
    expect(personalCareIndex).toBeLessThan(petCareIndex); // Personal Care comes before Pet Care
  });
});
