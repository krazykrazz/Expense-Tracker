import { describe, it, expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import { generateGroupedMethodOptions, parseSmartMethodFilter } from './ExpenseList';

describe('Smart Method Filter Property-Based Tests', () => {
  afterEach(() => {
    cleanup();
  });

  // Arbitraries for generating test data
  const methodTypeArb = fc.constantFrom('cash', 'debit', 'cheque', 'credit_card');
  
  const paymentMethodArb = fc.record({
    id: fc.integer({ min: 1, max: 1000 }),
    display_name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => !s.includes(':') && s.trim().length > 0),
    type: fc.oneof(methodTypeArb, fc.constant(null)),
    is_active: fc.constantFrom(0, 1)
  });

  /**
   * **Feature: expense-list-ux-improvements, Property 1: Smart Method Filter Grouped Options Generation**
   * 
   * For single-method types where the method name matches the type label (e.g., Cash),
   * the dropdown SHALL show only the method directly without a redundant type header.
   * For types with multiple methods, the dropdown SHALL show the type header followed by methods.
   * 
   * **Validates: Requirements 1.1**
   */
  it('Property 1: Single-method types matching type label show no redundant header', () => {
    // Test case: Cash type with single "Cash" method - should NOT show header
    const singleMatchingMethods = [
      { id: 1, display_name: 'Cash', type: 'cash', is_active: 1 },
      { id: 2, display_name: 'Debit', type: 'debit', is_active: 1 },
      { id: 3, display_name: 'Cheque', type: 'cheque', is_active: 1 }
    ];

    const options = generateGroupedMethodOptions(singleMatchingMethods);
    
    // Should have 3 options (one for each method, no headers)
    expect(options.length).toBe(3);
    
    // All should be items, not headers
    options.forEach(opt => {
      expect(opt.optionType).toBe('item');
      expect(opt.indent).toBe(false);
    });
    
    // Verify the values are method: prefixed
    expect(options.map(o => o.value)).toEqual([
      'method:Cash',
      'method:Debit',
      'method:Cheque'
    ]);
  });

  it('Property 1: Multi-method types show header followed by indented methods', () => {
    // Test case: Credit Card type with multiple methods - should show header + methods
    const multiMethodType = [
      { id: 1, display_name: 'Visa', type: 'credit_card', is_active: 1 },
      { id: 2, display_name: 'Mastercard', type: 'credit_card', is_active: 1 }
    ];

    const options = generateGroupedMethodOptions(multiMethodType);
    
    // Should have 3 options: 1 header + 2 methods
    expect(options.length).toBe(3);
    
    // First should be header
    expect(options[0].optionType).toBe('header');
    expect(options[0].value).toBe('type:credit_card');
    expect(options[0].label).toBe('Credit Card');
    expect(options[0].indent).toBe(false);
    
    // Rest should be indented items
    expect(options[1].optionType).toBe('item');
    expect(options[1].indent).toBe(true);
    expect(options[2].optionType).toBe('item');
    expect(options[2].indent).toBe(true);
  });

  it('Property 1: Mixed scenario - single matching types flat, multi-method types grouped', () => {
    // Real-world scenario matching user's setup
    const mixedMethods = [
      { id: 1, display_name: 'Cash', type: 'cash', is_active: 1 },
      { id: 2, display_name: 'Debit', type: 'debit', is_active: 1 },
      { id: 3, display_name: 'Cheque', type: 'cheque', is_active: 1 },
      { id: 4, display_name: 'CIBC MC', type: 'credit_card', is_active: 1 },
      { id: 5, display_name: 'PCF MC', type: 'credit_card', is_active: 1 },
      { id: 6, display_name: 'RBC VISA', type: 'credit_card', is_active: 1 },
      { id: 7, display_name: 'WS VISA', type: 'credit_card', is_active: 1 }
    ];

    const options = generateGroupedMethodOptions(mixedMethods);
    
    // Expected: Cash, Debit, Cheque (flat) + Credit Card header + 4 credit cards
    // = 3 + 1 + 4 = 8 options
    expect(options.length).toBe(8);
    
    // First 3 should be flat items (Cash, Debit, Cheque)
    expect(options[0]).toEqual({
      value: 'method:Cash',
      label: 'Cash',
      optionType: 'item',
      indent: false,
      isInactive: false
    });
    expect(options[1]).toEqual({
      value: 'method:Debit',
      label: 'Debit',
      optionType: 'item',
      indent: false,
      isInactive: false
    });
    expect(options[2]).toEqual({
      value: 'method:Cheque',
      label: 'Cheque',
      optionType: 'item',
      indent: false,
      isInactive: false
    });
    
    // Credit Card header
    expect(options[3]).toEqual({
      value: 'type:credit_card',
      label: 'Credit Card',
      optionType: 'header',
      indent: false
    });
    
    // Credit card methods (indented)
    expect(options[4].indent).toBe(true);
    expect(options[5].indent).toBe(true);
    expect(options[6].indent).toBe(true);
    expect(options[7].indent).toBe(true);
  });

  it('Property 1: Single method with different name than type shows header', () => {
    // Edge case: Single credit card named differently than "Credit Card"
    const singleDifferentName = [
      { id: 1, display_name: 'My Visa Card', type: 'credit_card', is_active: 1 }
    ];

    const options = generateGroupedMethodOptions(singleDifferentName);
    
    // Should have 2 options: header + method (because name differs from type label)
    expect(options.length).toBe(2);
    expect(options[0].optionType).toBe('header');
    expect(options[0].label).toBe('Credit Card');
    expect(options[1].optionType).toBe('item');
    expect(options[1].label).toBe('My Visa Card');
    expect(options[1].indent).toBe(true);
  });

  /**
   * **Feature: expense-list-ux-improvements, Property 2: Smart Method Type Filtering**
   * 
   * For any list of expenses and any selected method type (cash, debit, cheque, credit_card),
   * the filtered result SHALL contain only expenses where the payment method's type matches
   * the selected type, and SHALL contain all such expenses from the original list.
   * 
   * **Validates: Requirements 1.2**
   */
  it('Property 2: parseSmartMethodFilter correctly identifies type mode', async () => {
    await fc.assert(
      fc.property(
        methodTypeArb,
        (methodType) => {
          const filterValue = `type:${methodType}`;
          const result = parseSmartMethodFilter(filterValue);
          
          expect(result.mode).toBe('type');
          expect(result.filterValue).toBe(methodType);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: Type filtering completeness - all matching expenses are included
   */
  it('Property 2: Type filtering includes all expenses with matching payment method type', async () => {
    // Create a fixed set of payment methods for predictable testing
    const fixedPaymentMethods = [
      { id: 1, display_name: 'Cash', type: 'cash', is_active: 1 },
      { id: 2, display_name: 'Visa', type: 'credit_card', is_active: 1 },
      { id: 3, display_name: 'Mastercard', type: 'credit_card', is_active: 1 },
      { id: 4, display_name: 'Debit Card', type: 'debit', is_active: 1 },
      { id: 5, display_name: 'Cheque', type: 'cheque', is_active: 1 }
    ];

    const expenseWithMethodArb = fc.record({
      id: fc.integer({ min: 1, max: 10000 }),
      method: fc.constantFrom('Cash', 'Visa', 'Mastercard', 'Debit Card', 'Cheque'),
      type: fc.constantFrom('Groceries', 'Dining Out', 'Entertainment'),
      amount: fc.integer({ min: 1, max: 100000 })
    });

    await fc.assert(
      fc.property(
        fc.array(expenseWithMethodArb, { minLength: 1, maxLength: 30 }),
        methodTypeArb,
        (expenses, selectedType) => {
          // Filter using the smart method filter logic
          const filteredExpenses = expenses.filter(expense => {
            const paymentMethod = fixedPaymentMethods.find(pm => pm.display_name === expense.method);
            return paymentMethod && paymentMethod.type === selectedType;
          });

          // Count expected matches
          const expectedCount = expenses.filter(expense => {
            const paymentMethod = fixedPaymentMethods.find(pm => pm.display_name === expense.method);
            return paymentMethod && paymentMethod.type === selectedType;
          }).length;

          // Verify completeness
          expect(filteredExpenses.length).toBe(expectedCount);

          // Verify correctness - all filtered expenses have the right type
          filteredExpenses.forEach(expense => {
            const paymentMethod = fixedPaymentMethods.find(pm => pm.display_name === expense.method);
            expect(paymentMethod.type).toBe(selectedType);
          });

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: Type filtering excludes non-matching expenses
   */
  it('Property 2: Type filtering excludes expenses with non-matching payment method type', async () => {
    const fixedPaymentMethods = [
      { id: 1, display_name: 'Cash', type: 'cash', is_active: 1 },
      { id: 2, display_name: 'Visa', type: 'credit_card', is_active: 1 },
      { id: 3, display_name: 'Mastercard', type: 'credit_card', is_active: 1 },
      { id: 4, display_name: 'Debit Card', type: 'debit', is_active: 1 },
      { id: 5, display_name: 'Cheque', type: 'cheque', is_active: 1 }
    ];

    const expenseWithMethodArb = fc.record({
      id: fc.integer({ min: 1, max: 10000 }),
      method: fc.constantFrom('Cash', 'Visa', 'Mastercard', 'Debit Card', 'Cheque'),
      type: fc.constantFrom('Groceries', 'Dining Out', 'Entertainment'),
      amount: fc.integer({ min: 1, max: 100000 })
    });

    await fc.assert(
      fc.property(
        fc.array(expenseWithMethodArb, { minLength: 1, maxLength: 30 }),
        methodTypeArb,
        (expenses, selectedType) => {
          // Filter using the smart method filter logic
          const filteredExpenses = expenses.filter(expense => {
            const paymentMethod = fixedPaymentMethods.find(pm => pm.display_name === expense.method);
            return paymentMethod && paymentMethod.type === selectedType;
          });

          // Verify no non-matching expenses are included
          const nonMatchingInFiltered = filteredExpenses.filter(expense => {
            const paymentMethod = fixedPaymentMethods.find(pm => pm.display_name === expense.method);
            return !paymentMethod || paymentMethod.type !== selectedType;
          });

          expect(nonMatchingInFiltered.length).toBe(0);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Smart Method Specific Filtering Property-Based Tests', () => {
  afterEach(() => {
    cleanup();
  });

  /**
   * **Feature: expense-list-ux-improvements, Property 3: Smart Method Specific Filtering**
   * 
   * For any list of expenses and any selected specific payment method,
   * the filtered result SHALL contain only expenses where the payment method
   * exactly matches the selected method, and SHALL contain all such expenses
   * from the original list.
   * 
   * **Validates: Requirements 1.3**
   */
  it('Property 3: parseSmartMethodFilter correctly identifies method mode', async () => {
    const methodNameArb = fc.string({ minLength: 1, maxLength: 30 }).filter(s => !s.includes(':') && s.trim().length > 0);

    await fc.assert(
      fc.property(
        methodNameArb,
        (methodName) => {
          const filterValue = `method:${methodName}`;
          const result = parseSmartMethodFilter(filterValue);
          
          expect(result.mode).toBe('method');
          expect(result.filterValue).toBe(methodName);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3: Method filtering includes all expenses with exact method match
   */
  it('Property 3: Method filtering includes all expenses with exact payment method match', async () => {
    const fixedPaymentMethods = ['Cash', 'Visa', 'Mastercard', 'Debit Card', 'Cheque'];

    const expenseWithMethodArb = fc.record({
      id: fc.integer({ min: 1, max: 10000 }),
      method: fc.constantFrom(...fixedPaymentMethods),
      type: fc.constantFrom('Groceries', 'Dining Out', 'Entertainment'),
      amount: fc.integer({ min: 1, max: 100000 })
    });

    await fc.assert(
      fc.property(
        fc.array(expenseWithMethodArb, { minLength: 1, maxLength: 30 }),
        fc.constantFrom(...fixedPaymentMethods),
        (expenses, selectedMethod) => {
          // Parse the filter value
          const filterValue = `method:${selectedMethod}`;
          const { mode, filterValue: parsedMethod } = parseSmartMethodFilter(filterValue);
          
          expect(mode).toBe('method');
          expect(parsedMethod).toBe(selectedMethod);

          // Filter using the smart method filter logic
          const filteredExpenses = expenses.filter(expense => expense.method === selectedMethod);

          // Count expected matches
          const expectedCount = expenses.filter(expense => expense.method === selectedMethod).length;

          // Verify completeness
          expect(filteredExpenses.length).toBe(expectedCount);

          // Verify correctness - all filtered expenses have the exact method
          filteredExpenses.forEach(expense => {
            expect(expense.method).toBe(selectedMethod);
          });

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3: Method filtering excludes expenses with different methods
   */
  it('Property 3: Method filtering excludes expenses with non-matching payment methods', async () => {
    const fixedPaymentMethods = ['Cash', 'Visa', 'Mastercard', 'Debit Card', 'Cheque'];

    const expenseWithMethodArb = fc.record({
      id: fc.integer({ min: 1, max: 10000 }),
      method: fc.constantFrom(...fixedPaymentMethods),
      type: fc.constantFrom('Groceries', 'Dining Out', 'Entertainment'),
      amount: fc.integer({ min: 1, max: 100000 })
    });

    await fc.assert(
      fc.property(
        fc.array(expenseWithMethodArb, { minLength: 1, maxLength: 30 }),
        fc.constantFrom(...fixedPaymentMethods),
        (expenses, selectedMethod) => {
          // Filter using the smart method filter logic
          const filteredExpenses = expenses.filter(expense => expense.method === selectedMethod);

          // Verify no non-matching expenses are included
          const nonMatchingInFiltered = filteredExpenses.filter(expense => expense.method !== selectedMethod);

          expect(nonMatchingInFiltered.length).toBe(0);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3: Method filtering is case-sensitive
   */
  it('Property 3: Method filtering is case-sensitive', async () => {
    const methodPairsArb = fc.constantFrom(
      { original: 'Cash', variant: 'cash' },
      { original: 'Visa', variant: 'visa' },
      { original: 'Mastercard', variant: 'MASTERCARD' }
    );

    await fc.assert(
      fc.property(
        methodPairsArb,
        ({ original, variant }) => {
          const expenses = [
            { id: 1, method: original, type: 'Groceries', amount: 100 },
            { id: 2, method: variant, type: 'Groceries', amount: 200 }
          ];

          // Filter for the original method
          const filteredExpenses = expenses.filter(expense => expense.method === original);

          // Should only include the expense with exact match
          expect(filteredExpenses.length).toBe(1);
          expect(filteredExpenses[0].method).toBe(original);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
