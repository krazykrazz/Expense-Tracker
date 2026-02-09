import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import * as fc from 'fast-check';
import ExpenseForm from './ExpenseForm';
import { CATEGORIES } from '../../../backend/utils/categories';
import { createPaymentMethodApiMock } from '../test-utils';

// Mock fetch globally
global.fetch = vi.fn();

// Mock payment methods for testing (simulating API response)
const MOCK_PAYMENT_METHODS = [
  { id: 1, display_name: 'Cash', type: 'cash', is_active: 1 },
  { id: 2, display_name: 'Debit', type: 'debit', is_active: 1 },
  { id: 3, display_name: 'VISA', type: 'credit_card', is_active: 1 },
  { id: 4, display_name: 'Mastercard', type: 'credit_card', is_active: 1 },
  { id: 5, display_name: 'Cheque', type: 'cheque', is_active: 1 }
];

// Delegate to shared mock factory
const paymentMethodApiMock = createPaymentMethodApiMock({
  getActivePaymentMethods: vi.fn(() => Promise.resolve(MOCK_PAYMENT_METHODS)),
  getPaymentMethod: vi.fn(() => Promise.resolve(null)),
  getPaymentMethods: vi.fn(() => Promise.resolve(MOCK_PAYMENT_METHODS)),
});

// Mock the paymentMethodApi module used by usePaymentMethods hook
vi.mock('../services/paymentMethodApi', () => ({
  getActivePaymentMethods: vi.fn(() => Promise.resolve([
    { id: 1, display_name: 'Cash', type: 'cash', is_active: 1 },
    { id: 2, display_name: 'Debit', type: 'debit', is_active: 1 },
    { id: 3, display_name: 'VISA', type: 'credit_card', is_active: 1 },
    { id: 4, display_name: 'Mastercard', type: 'credit_card', is_active: 1 },
    { id: 5, display_name: 'Cheque', type: 'cheque', is_active: 1 }
  ])),
  getPaymentMethod: vi.fn(() => Promise.resolve(null)),
  getPaymentMethods: vi.fn(() => Promise.resolve([
    { id: 1, display_name: 'Cash', type: 'cash', is_active: 1 },
    { id: 2, display_name: 'Debit', type: 'debit', is_active: 1 },
    { id: 3, display_name: 'VISA', type: 'credit_card', is_active: 1 },
    { id: 4, display_name: 'Mastercard', type: 'credit_card', is_active: 1 },
    { id: 5, display_name: 'Cheque', type: 'cheque', is_active: 1 }
  ])),
}));

// Mock the logger to suppress output in tests
vi.mock('../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock scrollIntoView for jsdom (not supported natively)
Element.prototype.scrollIntoView = vi.fn();

// Helper to create a comprehensive mock implementation
const createMockFetch = (additionalHandlers = {}) => {
  return (url) => {
    // Categories API
    if (url.includes('/api/categories') || url.includes('/categories')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          categories: CATEGORIES,
          budgetableCategories: [],
          taxDeductibleCategories: []
        })
      });
    }
    // Payment methods API (active only)
    if (url.includes('/api/payment-methods/active')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          paymentMethods: MOCK_PAYMENT_METHODS
        })
      });
    }
    // Payment methods API (all)
    if (url.includes('/api/payment-methods')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          paymentMethods: MOCK_PAYMENT_METHODS
        })
      });
    }
    // Places API
    if (url.includes('/places')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      });
    }
    // People API
    if (url.includes('/people')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      });
    }
    // Category suggestion API
    if (url.includes('/suggest-category')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ category: null, confidence: 0 })
      });
    }
    // Check for additional handlers
    for (const [pattern, handler] of Object.entries(additionalHandlers)) {
      if (url.includes(pattern)) {
        return handler(url);
      }
    }
    // Default response for any other URL
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([])
    });
  };
};


describe('ExpenseForm Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Wait for any pending state updates to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    cleanup();
    vi.restoreAllMocks();
  });

  /**
   * **Feature: expanded-expense-categories, Property 1: Category dropdown completeness**
   * 
   * Property 1: Category dropdown completeness
   * For any valid category from the approved list, the expense form dropdown 
   * should include that category as an option
   * **Validates: Requirements 1.1**
   */
  it('Property 1: should include all valid categories in the dropdown', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a random subset of categories to verify
        fc.subarray(CATEGORIES, { minLength: 1, maxLength: CATEGORIES.length }),
        async (categoriesToCheck) => {
          // Mock the API responses
          global.fetch.mockImplementation(createMockFetch());

          // Render the component
          const { container } = render(<ExpenseForm onExpenseAdded={() => {}} />);

          // Wait for categories to be fetched and rendered
          await waitFor(() => {
            const typeSelect = container.querySelector('select[name="type"]');
            expect(typeSelect).toBeTruthy();
            // Check that we have more than just the default "Other" option
            expect(typeSelect.options.length).toBeGreaterThan(1);
          });

          // Get the type dropdown
          const typeSelect = container.querySelector('select[name="type"]');
          const optionValues = Array.from(typeSelect.options).map(opt => opt.value);

          // Verify that each category in our random subset is present in the dropdown
          for (const category of categoriesToCheck) {
            expect(optionValues).toContain(category);
          }
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * **Feature: smart-expense-entry, Property 5: Payment Method Persistence**
   * 
   * Property 5: Payment Method Persistence
   * For any expense submission, the payment method used SHALL be stored 
   * and pre-selected on the next form open.
   * **Validates: Requirements 5.1, 5.3**
   */
  it('Property 5: should persist payment method to localStorage and pre-select on next form open', async () => {
    // Generator for valid payment method IDs (using IDs from mock)
    const validMethodIdArb = fc.constantFrom(...MOCK_PAYMENT_METHODS.map(m => String(m.id)));

    // The localStorage key used by ExpenseForm (updated to match the new key)
    const LAST_PAYMENT_METHOD_KEY = 'expense-tracker-last-payment-method-id';

    await fc.assert(
      fc.asyncProperty(
        validMethodIdArb,
        async (methodId) => {
          // Clear localStorage before each test
          localStorage.clear();

          // Mock the API responses with expense creation handler
          global.fetch.mockImplementation(createMockFetch({
            '/expenses': () => Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ id: 1, payment_method_id: parseInt(methodId) })
            })
          }));

          // Render the first form instance
          const { container, unmount } = render(<ExpenseForm onExpenseAdded={() => {}} />);

          // Wait for categories and payment methods to be fetched
          await waitFor(() => {
            const typeSelect = container.querySelector('select[name="type"]');
            expect(typeSelect).toBeTruthy();
          });

          // Wait for payment methods to load
          await waitFor(() => {
            const methodSelect = container.querySelector('select[name="payment_method_id"]');
            expect(methodSelect).toBeTruthy();
            // Check that we have more than just the placeholder option
            const options = methodSelect.querySelectorAll('option');
            expect(options.length).toBeGreaterThan(1);
          });

          // Fill in required fields
          const dateInput = container.querySelector('input[name="date"]');
          const amountInput = container.querySelector('input[name="amount"]');
          const methodSelect = container.querySelector('select[name="payment_method_id"]');

          await act(async () => {
            fireEvent.change(dateInput, { target: { value: '2025-01-15' } });
            fireEvent.change(amountInput, { target: { value: '50.00' } });
            fireEvent.change(methodSelect, { target: { value: methodId } });
          });

          // Submit the form
          await act(async () => {
            const form = container.querySelector('form');
            fireEvent.submit(form);
          });

          // Wait for submission to complete
          await waitFor(() => {
            // Check that localStorage was updated with the payment method ID
            const savedMethod = localStorage.getItem(LAST_PAYMENT_METHOD_KEY);
            expect(savedMethod).toBe(methodId);
          });

          // Wait for any pending state updates before unmount
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
          });

          // Unmount the first form
          unmount();

          // Render a new form instance (simulating opening the form again)
          const { container: newContainer, unmount: unmount2 } = render(<ExpenseForm onExpenseAdded={() => {}} />);

          // Wait for the new form to render and payment methods to load
          await waitFor(() => {
            const newMethodSelect = newContainer.querySelector('select[name="payment_method_id"]');
            expect(newMethodSelect).toBeTruthy();
            const options = newMethodSelect.querySelectorAll('option');
            expect(options.length).toBeGreaterThan(1);
          });

          // Wait for the payment method to be pre-selected from localStorage
          await waitFor(() => {
            const newMethodSelect = newContainer.querySelector('select[name="payment_method_id"]');
            expect(newMethodSelect.value).toBe(methodId);
          });

          // Wait for any pending state updates before cleanup
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
          });

          // Clean up
          unmount2();
          localStorage.clear();
        }
      ),
      // Reduced numRuns due to async operations (localStorage, form rendering, unmounting)
      // Each iteration involves multiple async waits which can be slow on CI
      { numRuns: 25 }
    );
  }, 60000);


  /**
   * **Feature: smart-expense-entry, Property 4: Form Validation Enables Submit**
   * 
   * Property 4: Form Validation Enables Submit
   * For any form state where all required fields (date, place, type, amount, method) 
   * have valid values, the submit button SHALL be enabled.
   * **Validates: Requirements 3.3**
   */
  it('Property 4: should enable submit button when all required fields have valid values', async () => {
    // Generator for valid date strings (YYYY-MM-DD format)
    // Use integer-based generation to avoid invalid dates
    const validDateArb = fc.tuple(
      fc.integer({ min: 2020, max: 2030 }), // year
      fc.integer({ min: 1, max: 12 }),      // month
      fc.integer({ min: 1, max: 28 })       // day (use 28 to avoid invalid dates)
    ).map(([year, month, day]) => {
      const monthStr = month.toString().padStart(2, '0');
      const dayStr = day.toString().padStart(2, '0');
      return `${year}-${monthStr}-${dayStr}`;
    });

    // Generator for valid amounts (positive numbers)
    // Use Math.fround to ensure 32-bit float compatibility
    const validAmountArb = fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true })
      .filter(n => n > 0 && isFinite(n))
      .map(n => n.toFixed(2));

    // Generator for valid categories
    const validCategoryArb = fc.constantFrom(...CATEGORIES);

    // Generator for valid payment method IDs (using IDs from mock)
    const validMethodIdArb = fc.constantFrom(...MOCK_PAYMENT_METHODS.map(m => String(m.id)));

    // Generator for optional place (can be empty or have value)
    const validPlaceArb = fc.oneof(
      fc.constant(''),
      fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.length <= 200)
    );

    await fc.assert(
      fc.asyncProperty(
        validDateArb,
        validAmountArb,
        validCategoryArb,
        validMethodIdArb,
        validPlaceArb,
        async (date, amount, category, methodId, place) => {
          // Mock the API responses
          global.fetch.mockImplementation(createMockFetch());

          // Render the component
          const { container, unmount } = render(<ExpenseForm onExpenseAdded={() => {}} />);

          // Wait for categories and payment methods to be fetched
          await waitFor(() => {
            const typeSelect = container.querySelector('select[name="type"]');
            expect(typeSelect).toBeTruthy();
          });

          // Wait for payment methods to load
          await waitFor(() => {
            const methodSelect = container.querySelector('select[name="payment_method_id"]');
            expect(methodSelect).toBeTruthy();
            const options = methodSelect.querySelectorAll('option');
            expect(options.length).toBeGreaterThan(1);
          });

          // Fill in all required fields
          const dateInput = container.querySelector('input[name="date"]');
          const amountInput = container.querySelector('input[name="amount"]');
          const typeSelect = container.querySelector('select[name="type"]');
          const methodSelect = container.querySelector('select[name="payment_method_id"]');
          const placeInput = container.querySelector('input[name="place"]');

          // Set values using fireEvent wrapped in act
          await act(async () => {
            fireEvent.change(dateInput, { target: { value: date } });
            fireEvent.change(amountInput, { target: { value: amount } });
            fireEvent.change(typeSelect, { target: { value: category } });
            fireEvent.change(methodSelect, { target: { value: methodId } });
            if (place) {
              fireEvent.change(placeInput, { target: { value: place } });
            }
          });

          // Get the submit button
          const submitButton = container.querySelector('button[type="submit"]');
          
          // The submit button should be enabled (not disabled) when all required fields are valid
          // Note: The button is only disabled during submission (isSubmitting state)
          expect(submitButton.disabled).toBe(false);

          // Wait for any pending state updates before cleanup
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
          });

          // Clean up
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: expense-form-simplification, Property 7: Auto-expansion on validation errors**
   * 
   * NOTE: This property was converted from PBT to unit tests per frontend-test-simplification spec.
   * The complex conditional rendering dependencies make PBT inappropriate for this scenario.
   * See ExpenseForm.test.jsx for the unit test implementation.
   * 
   * Property 7: Auto-expansion on validation errors
   * For any validation error in a collapsed section, the section should automatically 
   * expand and display an error indicator on the section header.
   * **Validates: Requirements 2.4**
   */

  /**
   * **Feature: expense-form-simplification, Property 1: Initial visibility in create mode**
   * 
   * Property 1: Initial visibility in create mode
   * For any form render in create mode, only the core fields (Date, Place, Type, Amount, 
   * Payment Method, Notes) should be visible, and all advanced sections should be collapsed.
   * **Validates: Requirements 1.1**
   */
  it('Property 1: should render with all advanced sections collapsed in create mode', async () => {
    // Generator for random props that don't affect initial state
    // (people array can vary, but expense should always be null for create mode)
    const createModePropsArb = fc.record({
      people: fc.array(
        fc.record({
          id: fc.integer({ min: 1, max: 100 }),
          name: fc.string({ minLength: 1, maxLength: 50 })
        }),
        { maxLength: 10 }
      ),
      expense: fc.constant(null) // Always null for create mode
    });

    await fc.assert(
      fc.asyncProperty(
        createModePropsArb,
        async (props) => {
          // Clear sessionStorage to ensure clean state
          sessionStorage.clear();

          // Mock the API responses
          global.fetch.mockImplementation(createMockFetch());

          // Render the component in create mode
          const { container, unmount } = render(
            <ExpenseForm 
              onExpenseAdded={() => {}} 
              people={props.people}
              expense={props.expense}
            />
          );

          // Wait for the form to render and data to load
          await waitFor(() => {
            const typeSelect = container.querySelector('select[name="type"]');
            expect(typeSelect).toBeTruthy();
          });

          // Wait for payment methods to load
          await waitFor(() => {
            const methodSelect = container.querySelector('select[name="payment_method_id"]');
            expect(methodSelect).toBeTruthy();
            const options = methodSelect.querySelectorAll('option');
            expect(options.length).toBeGreaterThan(1);
          });

          // Verify core fields are visible
          const dateInput = container.querySelector('input[name="date"]');
          const placeInput = container.querySelector('input[name="place"]');
          const typeSelect = container.querySelector('select[name="type"]');
          const amountInput = container.querySelector('input[name="amount"]');
          const methodSelect = container.querySelector('select[name="payment_method_id"]');
          const notesTextarea = container.querySelector('textarea[name="notes"]');

          expect(dateInput).toBeTruthy();
          expect(placeInput).toBeTruthy();
          expect(typeSelect).toBeTruthy();
          expect(amountInput).toBeTruthy();
          expect(methodSelect).toBeTruthy();
          expect(notesTextarea).toBeTruthy();

          // Verify all advanced sections are collapsed (aria-expanded="false")
          const advancedOptionsSection = container.querySelector('[data-testid="section-advanced-options"]') 
            || container.querySelector('.collapsible-header');
          
          // Find all collapsible section headers
          const sectionHeaders = container.querySelectorAll('.collapsible-header');
          
          // All sections should be collapsed (aria-expanded="false")
          sectionHeaders.forEach(header => {
            const ariaExpanded = header.getAttribute('aria-expanded');
            expect(ariaExpanded).toBe('false');
          });

          // Verify section content is not visible when collapsed
          // The CollapsibleSection component should not render children when collapsed
          const sectionContents = container.querySelectorAll('.collapsible-section-content');
          sectionContents.forEach(content => {
            // Content should either not exist or be hidden
            const isVisible = content && window.getComputedStyle(content).display !== 'none';
            expect(isVisible).toBe(false);
          });

          // Wait for any pending state updates before cleanup
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
          });

          // Clean up
          unmount();
          sessionStorage.clear();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: expense-form-simplification, Property 2: Section expansion based on existing data**
   * 
   * Property 2: Section expansion based on existing data
   * For any expense object in edit mode, all sections containing non-null/non-empty data 
   * from that expense should be expanded, and sections without data should be collapsed.
   * **Validates: Requirements 1.2**
   */
  it('Property 2: should expand sections with data and collapse empty sections in edit mode', async () => {
    // Generator for expense objects with various data combinations
    const expenseWithDataArb = fc.record({
      id: fc.integer({ min: 1, max: 1000 }),
      date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
        .map(d => d.toISOString().split('T')[0]),
      place: fc.string({ minLength: 1, maxLength: 50 }),
      amount: fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }).map(n => parseFloat(n.toFixed(2))),
      type: fc.constantFrom(...CATEGORIES),
      payment_method_id: fc.constantFrom(...MOCK_PAYMENT_METHODS.map(m => m.id)),
      notes: fc.option(fc.string({ maxLength: 200 }), { nil: '' }),
      
      // Advanced Options section data
      future_months: fc.option(fc.integer({ min: 1, max: 12 }), { nil: 0 }),
      posted_date: fc.option(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
          .map(d => d.toISOString().split('T')[0]),
        { nil: null }
      ),
      
      // Reimbursement section data (for non-medical expenses)
      original_cost: fc.option(fc.float({ min: Math.fround(0.01), max: Math.fround(10000), noNaN: true }).map(n => parseFloat(n.toFixed(2))), { nil: null }),
      
      // Insurance section data (for medical expenses)
      insurance_eligible: fc.option(fc.constantFrom(0, 1), { nil: 0 }),
      claim_status: fc.option(fc.constantFrom('not_claimed', 'in_progress', 'paid', 'denied'), { nil: 'not_claimed' }),
      
      // People section data (for medical expenses)
      people: fc.option(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 100 }),
            name: fc.string({ minLength: 1, maxLength: 50 }),
            allocation_amount: fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true }).map(n => parseFloat(n.toFixed(2)))
          }),
          { minLength: 1, maxLength: 5 }
        ),
        { nil: [] }
      ),
      
      // Invoice section data (for tax-deductible expenses)
      invoices: fc.option(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 1000 }),
            filename: fc.string({ minLength: 5, maxLength: 50 }).map(s => `${s}.pdf`),
            person_id: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null })
          }),
          { minLength: 1, maxLength: 5 }
        ),
        { nil: [] }
      )
    });

    await fc.assert(
      fc.asyncProperty(
        expenseWithDataArb,
        async (expense) => {
          // Clear sessionStorage to ensure clean state
          sessionStorage.clear();

          // Mock the API responses including invoice fetch
          global.fetch.mockImplementation(createMockFetch({
            '/invoices': () => Promise.resolve({
              ok: true,
              json: () => Promise.resolve(expense.invoices || [])
            })
          }));

          // Render the component in edit mode
          const { container, unmount } = render(
            <ExpenseForm 
              onExpenseAdded={() => {}} 
              people={expense.people || []}
              expense={expense}
            />
          );

          // Wait for the form to render and data to load
          await waitFor(() => {
            const typeSelect = container.querySelector('select[name="type"]');
            expect(typeSelect).toBeTruthy();
          });

          // Wait for payment methods to load
          await waitFor(() => {
            const methodSelect = container.querySelector('select[name="payment_method_id"]');
            expect(methodSelect).toBeTruthy();
            const options = methodSelect.querySelectorAll('option');
            expect(options.length).toBeGreaterThan(1);
          });

          // Calculate expected expansion states based on data presence
          const expectedStates = {
            advancedOptions: (expense.future_months > 0) || !!expense.posted_date,
            reimbursement: !!expense.original_cost && expense.type !== 'Tax - Medical',
            insurance: expense.insurance_eligible === 1,
            people: expense.people?.length > 0,
            invoices: expense.invoices?.length > 0
          };

          // Find all collapsible section headers and verify their expansion states
          const sectionHeaders = container.querySelectorAll('.collapsible-header');
          
          // Map section titles to their expected states
          const sectionTitleMap = {
            'Advanced Options': expectedStates.advancedOptions,
            'Reimbursement': expectedStates.reimbursement,
            'Insurance Tracking': expectedStates.insurance,
            'People Assignment': expectedStates.people,
            'Invoice Attachments': expectedStates.invoices
          };

          sectionHeaders.forEach(header => {
            const titleElement = header.querySelector('.collapsible-title');
            if (titleElement) {
              const title = titleElement.textContent.trim();
              const expectedExpanded = sectionTitleMap[title];
              
              if (expectedExpanded !== undefined) {
                const ariaExpanded = header.getAttribute('aria-expanded');
                const actualExpanded = ariaExpanded === 'true';
                
                // Verify the section expansion matches the expected state
                expect(actualExpanded).toBe(expectedExpanded);
              }
            }
          });

          // Wait for any pending state updates before cleanup
          await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
          });

          // Clean up
          unmount();
          sessionStorage.clear();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: expense-form-simplification, Property 4: Data preservation during collapse**
   * 
   * Property 4: Data preservation during collapse
   * For any section with entered form data, collapsing the section should hide the UI elements 
   * but preserve all data values in the form state, and re-expanding should display the preserved data.
   * **Validates: Requirements 1.4**
   */
  it('Property 4: should preserve data when sections are collapsed and re-expanded', async () => {
    // Generator for section data that can be entered and preserved
    const sectionDataArb = fc.record({
      // Advanced Options section data
      futureMonths: fc.integer({ min: 1, max: 12 }),
      postedDate: fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') })
        .map(d => d.toISOString().split('T')[0]),
      
      // Reimbursement section data (non-medical)
      genericOriginalCost: fc.float({ min: Math.fround(10), max: Math.fround(1000), noNaN: true })
        .map(n => parseFloat(n.toFixed(2))),
      amount: fc.float({ min: Math.fround(1), max: Math.fround(500), noNaN: true })
        .map(n => parseFloat(n.toFixed(2))),
      
      // Insurance section data (medical)
      insuranceEligible: fc.boolean(),
      claimStatus: fc.constantFrom('not_claimed', 'in_progress', 'paid', 'denied'),
      insuranceOriginalCost: fc.float({ min: Math.fround(10), max: Math.fround(1000), noNaN: true })
        .map(n => parseFloat(n.toFixed(2))),
      
      // People section data (medical)
      selectedPeople: fc.array(
        fc.record({
          id: fc.integer({ min: 1, max: 10 }),
          name: fc.string({ minLength: 3, maxLength: 20 })
        }),
        { minLength: 1, maxLength: 3 }
      ),
      
      // Section to test
      sectionToTest: fc.constantFrom('advancedOptions', 'reimbursement', 'insurance', 'people')
    });

    await fc.assert(
      fc.asyncProperty(
        sectionDataArb,
        async (testData) => {
          // Clear sessionStorage to ensure clean state
          sessionStorage.clear();

          // Mock the API responses
          global.fetch.mockImplementation(createMockFetch());

          // Render the component in create mode
          const { container, unmount } = render(
            <ExpenseForm 
              onExpenseAdded={vi.fn()} 
              people={testData.selectedPeople}
            />
          );

          // Wait for component to load
          await waitFor(() => {
            expect(container.querySelector('#date')).toBeInTheDocument();
          });

          // Wait for payment methods to load
          await waitFor(() => {
            const methodSelect = container.querySelector('#payment_method_id');
            expect(methodSelect).toBeInTheDocument();
            // Ensure payment methods have loaded (more than just the placeholder option)
            expect(methodSelect.options.length).toBeGreaterThan(1);
          });

          // Set up the form based on which section we're testing
          const dateInput = container.querySelector('#date');
          const placeInput = container.querySelector('#place');
          const typeSelect = container.querySelector('#type');
          const amountInput = container.querySelector('#amount');
          const paymentMethodSelect = container.querySelector('#payment_method_id');

          // Fill in core fields
          await act(async () => {
            fireEvent.change(dateInput, { target: { value: '2024-06-15' } });
            fireEvent.change(placeInput, { target: { value: 'Test Place' } });
            fireEvent.change(amountInput, { target: { value: testData.amount.toString() } });
            
            // Select appropriate payment method based on section
            if (testData.sectionToTest === 'advancedOptions') {
              // Select credit card for posted date field
              fireEvent.change(paymentMethodSelect, { target: { value: '3' } }); // VISA
            } else {
              fireEvent.change(paymentMethodSelect, { target: { value: '1' } }); // Cash
            }
          });

          // Configure form based on section being tested
          if (testData.sectionToTest === 'advancedOptions') {
            // Test Advanced Options section
            await act(async () => {
              fireEvent.change(typeSelect, { target: { value: 'Other' } });
            });

            // Expand Advanced Options section
            const advancedHeader = container.querySelector('.collapsible-header');
            expect(advancedHeader).toBeInTheDocument();
            
            await act(async () => {
              fireEvent.click(advancedHeader);
            });

            await waitFor(() => {
              expect(container.querySelector('#posted_date')).toBeInTheDocument();
            });

            // Enter data in Advanced Options fields
            const postedDateInput = container.querySelector('#posted_date');
            await act(async () => {
              fireEvent.change(postedDateInput, { target: { value: testData.postedDate } });
            });

            // Verify data is entered
            expect(postedDateInput.value).toBe(testData.postedDate);

            // Collapse the section
            await act(async () => {
              fireEvent.click(advancedHeader);
            });

            // Verify section is collapsed (content not in DOM)
            await waitFor(() => {
              expect(container.querySelector('#posted_date')).not.toBeInTheDocument();
            });

            // Re-expand the section
            await act(async () => {
              fireEvent.click(advancedHeader);
            });

            // Wait for section to expand
            await waitFor(() => {
              expect(advancedHeader.getAttribute('aria-expanded')).toBe('true');
            });

            // Wait for the component to re-render with the credit card check
            // The posted date field should appear because payment method is still VISA
            await waitFor(() => {
              const paymentMethod = container.querySelector('#payment_method_id');
              expect(paymentMethod.value).toBe('3'); // Still VISA
            });

            // Verify data is preserved after re-expansion
            await waitFor(() => {
              const postedDateAfterExpand = container.querySelector('#posted_date');
              expect(postedDateAfterExpand).toBeInTheDocument();
              expect(postedDateAfterExpand.value).toBe(testData.postedDate);
            }, { timeout: 5000 });

          } else if (testData.sectionToTest === 'reimbursement') {
            // Test Reimbursement section (non-medical)
            await act(async () => {
              fireEvent.change(typeSelect, { target: { value: 'Other' } });
            });

            // Find and expand Reimbursement section
            const headers = container.querySelectorAll('.collapsible-header');
            const reimbursementHeader = Array.from(headers).find(h => 
              h.textContent.includes('Reimbursement')
            );
            
            if (reimbursementHeader) {
              await act(async () => {
                fireEvent.click(reimbursementHeader);
              });

              await waitFor(() => {
                expect(container.querySelector('#genericOriginalCost')).toBeInTheDocument();
              });

              // Enter data in Reimbursement field
              const originalCostInput = container.querySelector('#genericOriginalCost');
              await act(async () => {
                fireEvent.change(originalCostInput, { 
                  target: { value: testData.genericOriginalCost.toString() } 
                });
              });

              // Verify data is entered
              expect(originalCostInput.value).toBe(testData.genericOriginalCost.toString());

              // Collapse the section
              await act(async () => {
                fireEvent.click(reimbursementHeader);
              });

              // Verify section is collapsed
              await waitFor(() => {
                expect(container.querySelector('#genericOriginalCost')).not.toBeInTheDocument();
              });

              // Re-expand the section
              await act(async () => {
                fireEvent.click(reimbursementHeader);
              });

              // Verify data is preserved
              await waitFor(() => {
                const originalCostAfterExpand = container.querySelector('#genericOriginalCost');
                expect(originalCostAfterExpand).toBeInTheDocument();
                expect(originalCostAfterExpand.value).toBe(testData.genericOriginalCost.toString());
              });
            }

          } else if (testData.sectionToTest === 'insurance') {
            // Test Insurance section (medical)
            await act(async () => {
              fireEvent.change(typeSelect, { target: { value: 'Tax - Medical' } });
            });

            // Find and expand Insurance section
            const headers = container.querySelectorAll('.collapsible-header');
            const insuranceHeader = Array.from(headers).find(h => 
              h.textContent.includes('Insurance Tracking')
            );
            
            if (insuranceHeader) {
              await act(async () => {
                fireEvent.click(insuranceHeader);
              });

              await waitFor(() => {
                expect(container.querySelector('#insuranceEligible')).toBeInTheDocument();
              });

              // Enable insurance and enter data
              const insuranceCheckbox = container.querySelector('#insuranceEligible');
              await act(async () => {
                fireEvent.click(insuranceCheckbox);
              });

              await waitFor(() => {
                expect(container.querySelector('#originalCost')).toBeInTheDocument();
              });

              const originalCostInput = container.querySelector('#originalCost');
              const claimStatusSelect = container.querySelector('#claimStatus');
              
              await act(async () => {
                fireEvent.change(originalCostInput, { 
                  target: { value: testData.insuranceOriginalCost.toString() } 
                });
                fireEvent.change(claimStatusSelect, { 
                  target: { value: testData.claimStatus } 
                });
              });

              // Verify data is entered
              expect(originalCostInput.value).toBe(testData.insuranceOriginalCost.toString());
              expect(claimStatusSelect.value).toBe(testData.claimStatus);

              // Collapse the section
              await act(async () => {
                fireEvent.click(insuranceHeader);
              });

              // Verify section is collapsed
              await waitFor(() => {
                expect(container.querySelector('#originalCost')).not.toBeInTheDocument();
              });

              // Re-expand the section
              await act(async () => {
                fireEvent.click(insuranceHeader);
              });

              // Verify data is preserved
              await waitFor(() => {
                const originalCostAfterExpand = container.querySelector('#originalCost');
                const claimStatusAfterExpand = container.querySelector('#claimStatus');
                expect(originalCostAfterExpand).toBeInTheDocument();
                expect(claimStatusAfterExpand).toBeInTheDocument();
                expect(originalCostAfterExpand.value).toBe(testData.insuranceOriginalCost.toString());
                expect(claimStatusAfterExpand.value).toBe(testData.claimStatus);
              });
            }

          } else if (testData.sectionToTest === 'people') {
            // Test People section (medical)
            await act(async () => {
              fireEvent.change(typeSelect, { target: { value: 'Tax - Medical' } });
            });

            // Find and expand People section
            const headers = container.querySelectorAll('.collapsible-header');
            const peopleHeader = Array.from(headers).find(h => 
              h.textContent.includes('People Assignment')
            );
            
            if (peopleHeader && testData.selectedPeople.length > 0) {
              await act(async () => {
                fireEvent.click(peopleHeader);
              });

              await waitFor(() => {
                expect(container.querySelector('#people')).toBeInTheDocument();
              });

              // Select people
              const peopleSelect = container.querySelector('#people');
              const selectedIds = testData.selectedPeople.map(p => p.id.toString());
              
              await act(async () => {
                // Simulate multi-select
                Array.from(peopleSelect.options).forEach(option => {
                  option.selected = selectedIds.includes(option.value);
                });
                fireEvent.change(peopleSelect);
              });

              // Collapse the section
              await act(async () => {
                fireEvent.click(peopleHeader);
              });

              // Verify section is collapsed
              await waitFor(() => {
                expect(container.querySelector('#people')).not.toBeInTheDocument();
              });

              // Re-expand the section
              await act(async () => {
                fireEvent.click(peopleHeader);
              });

              // Verify people selection is preserved
              await waitFor(() => {
                const peopleSelectAfterExpand = container.querySelector('#people');
                expect(peopleSelectAfterExpand).toBeInTheDocument();
                const selectedOptions = Array.from(peopleSelectAfterExpand.selectedOptions);
                const selectedIdsAfterExpand = selectedOptions.map(opt => opt.value);
                
                // Verify at least some people are still selected
                expect(selectedIdsAfterExpand.length).toBeGreaterThan(0);
              });
            }
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: expense-form-simplification, Property 21: State reset after submission**
   * 
   * Property 21: State reset after submission
   * For any successful form submission in create mode, all section expansion states 
   * should reset to their default collapsed state, and sessionStorage should be updated accordingly.
   * **Validates: Requirements 11.3**
   */
  it('Property 21: should reset section expansion states after successful submission', async () => {
    // Generator for section expansion combinations (at least one should be expanded to test reset)
    const sectionExpansionArb = fc.record({
      advancedOptions: fc.boolean(),
      reimbursement: fc.boolean()
    }).filter(states => states.advancedOptions || states.reimbursement);

    // Generator for valid form data that will pass validation
    const validFormDataArb = fc.record({
      date: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
        .map(d => d.toISOString().split('T')[0]),
      place: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
      amount: fc.double({ min: 0.01, max: 10000, noNaN: true })
        .map(n => n.toFixed(2)),
      type: fc.constantFrom('Groceries', 'Dining Out', 'Gas', 'Other'),
      notes: fc.string({ maxLength: 200 })
    });

    await fc.assert(
      fc.asyncProperty(
        sectionExpansionArb,
        validFormDataArb,
        async (sectionStates, formData) => {
          // Clear sessionStorage before test
          sessionStorage.clear();

          // Mock successful expense creation
          global.fetch.mockImplementation((url, options) => {
            if (url.includes('/api/expenses') && options?.method === 'POST') {
              return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                  id: Math.floor(Math.random() * 10000),
                  ...formData,
                  payment_method_id: 1,
                  type: formData.type
                })
              });
            }
            return createMockFetch()(url);
          });

          const onExpenseAdded = vi.fn();
          const { container, unmount } = render(
            <ExpenseForm 
              onExpenseAdded={onExpenseAdded} 
              people={[]}
            />
          );

          // Wait for form to load and payment methods to be set
          await waitFor(() => {
            const paymentMethodSelect = container.querySelector('#payment_method_id');
            expect(paymentMethodSelect).toBeInTheDocument();
            expect(paymentMethodSelect.value).not.toBe('');
          }, { timeout: 3000 });

          // Get section headers (only Advanced Options and Reimbursement for non-medical)
          const advancedOptionsHeader = container.querySelector('.collapsible-section-header');
          const reimbursementHeader = container.querySelectorAll('.collapsible-section-header')[1];

          // Expand sections based on generated states
          if (sectionStates.advancedOptions && advancedOptionsHeader) {
            const isExpanded = advancedOptionsHeader.getAttribute('aria-expanded') === 'true';
            if (!isExpanded) {
              await act(async () => {
                fireEvent.click(advancedOptionsHeader);
              });
              await waitFor(() => {
                expect(advancedOptionsHeader.getAttribute('aria-expanded')).toBe('true');
              });
            }
          }

          if (sectionStates.reimbursement && reimbursementHeader) {
            const isExpanded = reimbursementHeader.getAttribute('aria-expanded') === 'true';
            if (!isExpanded) {
              await act(async () => {
                fireEvent.click(reimbursementHeader);
              });
              await waitFor(() => {
                expect(reimbursementHeader.getAttribute('aria-expanded')).toBe('true');
              });
            }
          }

          // Fill in form data
          await act(async () => {
            const dateInput = container.querySelector('#date');
            const placeInput = container.querySelector('#place');
            const amountInput = container.querySelector('#amount');
            const typeSelect = container.querySelector('#type');
            const notesInput = container.querySelector('#notes');

            fireEvent.change(dateInput, { target: { value: formData.date } });
            fireEvent.change(placeInput, { target: { value: formData.place } });
            fireEvent.change(amountInput, { target: { value: formData.amount } });
            fireEvent.change(typeSelect, { target: { value: formData.type } });
            if (notesInput) {
              fireEvent.change(notesInput, { target: { value: formData.notes } });
            }
          });

          // Submit the form
          const form = container.querySelector('form');
          await act(async () => {
            fireEvent.submit(form);
          });

          // Wait for submission to complete (callback should be called)
          await waitFor(() => {
            expect(onExpenseAdded).toHaveBeenCalled();
          }, { timeout: 3000 });

          // Verify all sections are collapsed after submission
          await waitFor(() => {
            if (advancedOptionsHeader) {
              expect(advancedOptionsHeader.getAttribute('aria-expanded')).toBe('false');
            }
            if (reimbursementHeader) {
              expect(reimbursementHeader.getAttribute('aria-expanded')).toBe('false');
            }
          });

          // Verify sessionStorage has been updated with collapsed states
          const storageKey = 'expenseForm_expansion_create';
          const storedStates = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
          
          // All sections should be false (collapsed)
          expect(storedStates.advancedOptions).toBe(false);
          expect(storedStates.reimbursement).toBe(false);

          // Verify payment method is preserved (not reset)
          const paymentMethodSelect = container.querySelector('#payment_method_id');
          expect(paymentMethodSelect.value).not.toBe('');

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
