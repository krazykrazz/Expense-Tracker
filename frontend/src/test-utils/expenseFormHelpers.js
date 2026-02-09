/**
 * @module test-utils/expenseFormHelpers
 * @description
 * Shared test utilities for ExpenseForm component tests.
 * Provides common mock data, setup functions, and interaction helpers
 * to reduce duplication across split ExpenseForm test files.
 *
 * This module supports the test suite optimization effort by extracting
 * common patterns from the monolithic ExpenseForm.test.jsx file.
 *
 * @example <caption>Basic usage with mock setup</caption>
 * import { setupExpenseFormMocks, fillBasicFields } from '../test-utils/expenseFormHelpers';
 *
 * beforeEach(() => {
 *   setupExpenseFormMocks();
 * });
 *
 * it('should submit form with valid data', async () => {
 *   render(<ExpenseForm onExpenseAdded={vi.fn()} />);
 *   await fillBasicFields();
 *   fireEvent.submit(screen.getByRole('button', { name: /add expense/i }));
 *   // assertions...
 * });
 *
 * @example <caption>Expanding collapsible sections</caption>
 * import { expandSection } from '../test-utils/expenseFormHelpers';
 *
 * it('should show advanced options', async () => {
 *   const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);
 *   await expandSection(container, 'Advanced Options');
 *   expect(screen.getByLabelText(/posted date/i)).toBeInTheDocument();
 * });
 */

import { fireEvent, screen, waitFor } from '@testing-library/react';
import * as peopleApi from '../services/peopleApi.js';
import * as expenseApi from '../services/expenseApi.js';
import * as categorySuggestionApi from '../services/categorySuggestionApi.js';
import * as categoriesApi from '../services/categoriesApi.js';
import * as paymentMethodApi from '../services/paymentMethodApi.js';

// ── Mock Data ──

/**
 * Standard category list used across ExpenseForm tests.
 * Includes regular categories and tax-deductible categories.
 */
export const mockCategories = [
  'Other',
  'Groceries',
  'Gas',
  'Dining Out',
  'Tax - Medical',
  'Tax - Donation'
];

/**
 * Standard payment methods list used across ExpenseForm tests.
 * Includes Cash, Credit Card, and Debit Card with realistic structure.
 */
export const mockPaymentMethods = [
  { id: 1, display_name: 'Cash', type: 'cash', is_active: 1 },
  { id: 2, display_name: 'Credit Card', type: 'credit_card', is_active: 1 },
  { id: 3, display_name: 'Debit Card', type: 'debit', is_active: 1 }
];

/**
 * Standard people list used for medical expense assignment tests.
 * Includes realistic names and dates of birth.
 */
export const mockPeople = [
  { id: 1, name: 'John Doe', dateOfBirth: '1990-01-01' },
  { id: 2, name: 'Jane Smith', dateOfBirth: '1985-05-15' },
  { id: 3, name: 'Bob Johnson', dateOfBirth: '1992-12-10' }
];

// ── Setup Functions ──

/**
 * Sets up all API mocks required for ExpenseForm tests.
 * Call this in beforeEach to ensure consistent mock state.
 *
 * Mocks the following APIs:
 * - peopleApi.getPeople → mockPeople
 * - expenseApi.createExpense → { id: 1, type: 'Tax - Medical' }
 * - expenseApi.getPlaces → []
 * - categoriesApi.getCategories → mockCategories
 * - categorySuggestionApi.fetchCategorySuggestion → { category: null }
 * - paymentMethodApi.getActivePaymentMethods → mockPaymentMethods
 * - paymentMethodApi.getPaymentMethod → mockPaymentMethods[0] (Cash)
 * - global.fetch → handles /api/categories, /places, /api/people
 *
 * @example
 * beforeEach(() => {
 *   vi.clearAllMocks();
 *   setupExpenseFormMocks();
 * });
 */
export const setupExpenseFormMocks = () => {
  // Mock people API
  peopleApi.getPeople.mockResolvedValue(mockPeople);

  // Mock expense API
  expenseApi.createExpense.mockResolvedValue({ id: 1, type: 'Tax - Medical' });
  expenseApi.getPlaces.mockResolvedValue([]);

  // Mock categories API
  categoriesApi.getCategories.mockResolvedValue(mockCategories);

  // Mock category suggestion API
  categorySuggestionApi.fetchCategorySuggestion.mockResolvedValue({ category: null });

  // Mock payment methods API
  paymentMethodApi.getActivePaymentMethods.mockResolvedValue(mockPaymentMethods);
  paymentMethodApi.getPaymentMethod.mockResolvedValue(mockPaymentMethods[0]);

  // Mock global fetch for additional API calls
  global.fetch.mockImplementation((url) => {
    if (url.includes('/api/categories')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          categories: mockCategories,
          budgetableCategories: [],
          taxDeductibleCategories: []
        })
      });
    }
    if (url.includes('/places')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([])
      });
    }
    if (url.includes('/api/people')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockPeople)
      });
    }
    return Promise.reject(new Error('Unknown URL'));
  });
};

// ── Interaction Helpers ──

/**
 * Expands a collapsible section in the ExpenseForm by clicking its header.
 * Waits for the section to be fully expanded (aria-expanded="true").
 *
 * @param {HTMLElement} container - The container element from render()
 * @param {string} sectionName - The visible name of the section (e.g., "Advanced Options", "Reimbursement")
 * @returns {Promise<HTMLElement>} The header element that was clicked
 * @throws {Error} If the section with the given name is not found
 *
 * @example
 * const { container } = render(<ExpenseForm onExpenseAdded={vi.fn()} />);
 * await expandSection(container, 'Advanced Options');
 * expect(screen.getByLabelText(/posted date/i)).toBeInTheDocument();
 *
 * @example
 * // Expand multiple sections
 * await expandSection(container, 'Reimbursement');
 * await expandSection(container, 'Insurance');
 */
export const expandSection = async (container, sectionName) => {
  const header = Array.from(container.querySelectorAll('.collapsible-header'))
    .find(h => h.textContent.includes(sectionName));
  
  if (!header) {
    throw new Error(`Section "${sectionName}" not found`);
  }
  
  fireEvent.click(header);
  
  await waitFor(() => {
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });
  
  return header;
};

/**
 * Fills in all required fields in the ExpenseForm with valid test data.
 * Uses default values that will pass validation.
 *
 * Fields filled:
 * - Date: 2025-01-15
 * - Amount: 100.00
 * - Type: Other
 * - Payment Method: 1 (Cash)
 *
 * Note: This function does NOT submit the form. Call fireEvent.submit() separately.
 *
 * @returns {Promise<void>}
 *
 * @example
 * render(<ExpenseForm onExpenseAdded={vi.fn()} />);
 * await fillBasicFields();
 * fireEvent.submit(screen.getByRole('button', { name: /add expense/i }));
 *
 * @example
 * // Fill basic fields then modify specific fields
 * await fillBasicFields();
 * fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'Tax - Medical' } });
 */
export const fillBasicFields = async () => {
  // Wait for form to be ready
  await waitFor(() => {
    expect(screen.getByLabelText(/^Date \*/i)).toBeInTheDocument();
  });

  fireEvent.change(screen.getByLabelText(/^Date \*/i), { 
    target: { value: '2025-01-15' } 
  });
  fireEvent.change(screen.getByLabelText(/Amount/i), { 
    target: { value: '100.00' } 
  });
  fireEvent.change(screen.getByLabelText(/Type/i), { 
    target: { value: 'Other' } 
  });
  fireEvent.change(screen.getByLabelText(/Payment Method/i), { 
    target: { value: '1' } 
  });
};

/**
 * Fills in all required fields with specific values.
 * Provides more control than fillBasicFields() for tests that need custom data.
 *
 * @param {Object} fields - Field values to fill
 * @param {string} fields.date - Date in YYYY-MM-DD format
 * @param {string} fields.amount - Amount as string (e.g., "100.00")
 * @param {string} fields.type - Expense type (must be in mockCategories)
 * @param {string} fields.paymentMethod - Payment method ID as string (e.g., "1")
 * @returns {Promise<void>}
 *
 * @example
 * await fillBasicFieldsWithValues({
 *   date: '2025-02-01',
 *   amount: '250.00',
 *   type: 'Tax - Medical',
 *   paymentMethod: '2'
 * });
 */
export const fillBasicFieldsWithValues = async ({ date, amount, type, paymentMethod }) => {
  // Wait for form to be ready
  await waitFor(() => {
    expect(screen.getByLabelText(/^Date \*/i)).toBeInTheDocument();
  });

  fireEvent.change(screen.getByLabelText(/^Date \*/i), { 
    target: { value: date } 
  });
  fireEvent.change(screen.getByLabelText(/Amount/i), { 
    target: { value: amount } 
  });
  fireEvent.change(screen.getByLabelText(/Type/i), { 
    target: { value: type } 
  });
  fireEvent.change(screen.getByLabelText(/Payment Method/i), { 
    target: { value: paymentMethod } 
  });
};

/**
 * Selects a single person from the people dropdown.
 * Assumes the People Assignment section is already expanded.
 *
 * @param {number} personIndex - Index of the person in mockPeople (0-based)
 * @returns {Promise<void>}
 *
 * @example
 * await expandSection(container, 'People Assignment');
 * await selectSinglePerson(0); // Selects John Doe
 */
export const selectSinglePerson = async (personIndex) => {
  await waitFor(() => {
    expect(screen.getByLabelText(/assign to people/i)).toBeInTheDocument();
  });

  const peopleSelect = screen.getByLabelText(/assign to people/i);
  const options = peopleSelect.querySelectorAll('option');
  // +1 because first option is the disabled placeholder
  options[personIndex + 1].selected = true;
  fireEvent.change(peopleSelect);
};

/**
 * Selects multiple people from the people dropdown.
 * Assumes the People Assignment section is already expanded.
 *
 * @param {number[]} personIndices - Array of person indices in mockPeople (0-based)
 * @returns {Promise<void>}
 *
 * @example
 * await expandSection(container, 'People Assignment');
 * await selectMultiplePeople([0, 1]); // Selects John Doe and Jane Smith
 */
export const selectMultiplePeople = async (personIndices) => {
  await waitFor(() => {
    expect(screen.getByLabelText(/assign to people/i)).toBeInTheDocument();
  });

  const peopleSelect = screen.getByLabelText(/assign to people/i);
  const options = peopleSelect.querySelectorAll('option');
  
  personIndices.forEach(index => {
    // +1 because first option is the disabled placeholder
    options[index + 1].selected = true;
  });
  
  fireEvent.change(peopleSelect);
};

/**
 * Waits for the allocation modal to appear after selecting multiple people.
 * Useful for tests that need to interact with the modal.
 *
 * @returns {Promise<void>}
 *
 * @example
 * await selectMultiplePeople([0, 1]);
 * fireEvent.submit(screen.getByRole('button', { name: /add expense/i }));
 * await waitForAllocationModal();
 * expect(screen.getByText(/split equally/i)).toBeInTheDocument();
 */
export const waitForAllocationModal = async () => {
  await waitFor(() => {
    expect(screen.getByText(/allocate expense amount/i)).toBeInTheDocument();
  });
};

/**
 * Submits the ExpenseForm by clicking the submit button.
 * Waits for the button to be available before clicking.
 *
 * @returns {Promise<void>}
 *
 * @example
 * await fillBasicFields();
 * await submitForm();
 * await waitFor(() => {
 *   expect(expenseApi.createExpense).toHaveBeenCalled();
 * });
 */
export const submitForm = async () => {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /add expense/i })).toBeInTheDocument();
  });
  
  const submitButton = screen.getByRole('button', { name: /add expense/i });
  fireEvent.click(submitButton);
};

// ── Enhanced Test Helpers (Task 1.3) ──

/**
 * Documentation for mocking CollapsibleSection in tests.
 * 
 * **Why mock CollapsibleSection?**
 * The real CollapsibleSection uses CSS display properties to show/hide content.
 * In jsdom, CSS is not fully evaluated, so visibility checks fail. MockCollapsibleSection
 * always renders children, allowing tests to focus on user-facing behavior.
 *
 * **How to mock CollapsibleSection:**
 * Add this at the TOP of your test file, before any imports of components that use CollapsibleSection:
 * 
 * ```javascript
 * import { vi } from 'vitest';
 * import { MockCollapsibleSection } from '../test-utils';
 * 
 * vi.mock('../components/CollapsibleSection', () => ({
 *   default: MockCollapsibleSection
 * }));
 * ```
 *
 * **When to use:**
 * - Integration tests that need to interact with fields inside collapsible sections
 * - Tests that verify conditional field display based on form state
 * - Tests that verify form submission with data from multiple sections
 *
 * **When NOT to use:**
 * - Unit tests specifically testing CollapsibleSection behavior (use real component)
 * - E2E tests in real browsers (use real component)
 *
 * @example <caption>Basic usage at top of test file</caption>
 * import { vi } from 'vitest';
 * import { MockCollapsibleSection } from '../test-utils';
 * 
 * // Mock BEFORE importing components that use CollapsibleSection
 * vi.mock('../components/CollapsibleSection', () => ({
 *   default: MockCollapsibleSection
 * }));
 * 
 * import ExpenseForm from '../components/ExpenseForm';
 *
 * describe('ExpenseForm', () => {
 *   it('should show insurance fields when Tax - Medical is selected', async () => {
 *     render(<ExpenseForm onExpenseAdded={vi.fn()} />);
 *     // No need to expand section - fields are always visible in tests
 *     const insuranceField = screen.getByLabelText('Insurance Status');
 *     expect(insuranceField).toBeInTheDocument();
 *   });
 * });
 */

/**
 * Asserts that a form field is visible in the document.
 * Queries by label text first, then falls back to role-based queries.
 *
 * This helper provides a consistent way to verify field visibility without
 * coupling to implementation details like test IDs or CSS selectors.
 *
 * @param {string} fieldName - The accessible name of the field (label text or aria-label)
 * @returns {void}
 * @throws {Error} If the field is not found or not visible
 *
 * @example <caption>Verify field appears after category selection</caption>
 * const categorySelect = screen.getByLabelText('Category');
 * await userEvent.selectOptions(categorySelect, 'Tax - Medical');
 * assertFieldVisible('Insurance Status');
 *
 * @example <caption>Verify multiple fields are visible</caption>
 * assertFieldVisible('Date');
 * assertFieldVisible('Amount');
 * assertFieldVisible('Category');
 * assertFieldVisible('Payment Method');
 */
export const assertFieldVisible = (fieldName) => {
  // Try label text first (most accessible)
  let field = screen.queryByLabelText(fieldName, { exact: false });
  
  // Fall back to role-based queries
  if (!field) {
    field = screen.queryByRole('textbox', { name: new RegExp(fieldName, 'i') });
  }
  if (!field) {
    field = screen.queryByRole('combobox', { name: new RegExp(fieldName, 'i') });
  }
  if (!field) {
    field = screen.queryByRole('spinbutton', { name: new RegExp(fieldName, 'i') });
  }
  
  expect(field).toBeInTheDocument();
  expect(field).toBeVisible();
};

/**
 * Asserts that a form field is not present in the document.
 * Queries by label text first, then falls back to role-based queries.
 *
 * This helper provides a consistent way to verify conditional field hiding
 * without coupling to implementation details.
 *
 * @param {string} fieldName - The accessible name of the field (label text or aria-label)
 * @returns {void}
 *
 * @example <caption>Verify field is hidden when category changes</caption>
 * const categorySelect = screen.getByLabelText('Category');
 * await userEvent.selectOptions(categorySelect, 'Groceries');
 * assertFieldHidden('Insurance Status');
 *
 * @example <caption>Verify conditional fields are hidden by default</caption>
 * render(<ExpenseForm onExpenseAdded={vi.fn()} />);
 * assertFieldHidden('Posted Date');
 * assertFieldHidden('Reimbursement Amount');
 */
export const assertFieldHidden = (fieldName) => {
  // Try label text first (most accessible)
  let field = screen.queryByLabelText(fieldName, { exact: false });
  
  // Fall back to role-based queries
  if (!field) {
    field = screen.queryByRole('textbox', { name: new RegExp(fieldName, 'i') });
  }
  if (!field) {
    field = screen.queryByRole('combobox', { name: new RegExp(fieldName, 'i') });
  }
  if (!field) {
    field = screen.queryByRole('spinbutton', { name: new RegExp(fieldName, 'i') });
  }
  
  expect(field).not.toBeInTheDocument();
};

/**
 * Asserts that a mock function was called with data matching the expected structure.
 * Uses expect.objectContaining to allow partial matching, making tests less brittle.
 *
 * This helper simplifies form submission verification by focusing on the data
 * that matters for the test, ignoring implementation details like computed fields.
 *
 * @param {Function} mockFn - The mock function to verify (e.g., expenseApi.createExpense)
 * @param {Object} expectedData - The expected data structure (partial match)
 * @returns {void}
 * @throws {Error} If the mock was not called with matching data
 *
 * @example <caption>Verify basic expense submission</caption>
 * await fillBasicFields();
 * await submitForm();
 * assertSubmittedData(expenseApi.createExpense, {
 *   date: '2025-01-15',
 *   amount: 100.00,
 *   type: 'Other',
 *   paymentMethod: 1
 * });
 *
 * @example <caption>Verify tax-deductible expense with insurance</caption>
 * await fillBasicFieldsWithValues({
 *   date: '2025-02-01',
 *   amount: 250.00,
 *   type: 'Tax - Medical',
 *   paymentMethod: '2'
 * });
 * fireEvent.change(screen.getByLabelText('Insurance Status'), {
 *   target: { value: 'pending' }
 * });
 * await submitForm();
 * assertSubmittedData(expenseApi.createExpense, {
 *   type: 'Tax - Medical',
 *   insuranceStatus: 'pending'
 * });
 *
 * @example <caption>Verify reimbursement data</caption>
 * await expandSection(container, 'Reimbursement');
 * fireEvent.change(screen.getByLabelText('Reimbursement Amount'), {
 *   target: { value: '50.00' }
 * });
 * await submitForm();
 * assertSubmittedData(expenseApi.createExpense, {
 *   reimbursementAmount: 50.00,
 *   reimbursementStatus: 'pending'
 * });
 */
export const assertSubmittedData = (mockFn, expectedData) => {
  expect(mockFn).toHaveBeenCalledWith(
    expect.objectContaining(expectedData)
  );
};

/**
 * Asserts that a validation error message is displayed in the document.
 * Waits for the error to appear (useful for async validation).
 *
 * This helper provides a consistent way to verify form validation without
 * coupling to implementation details like error message container structure.
 *
 * @param {string} message - The error message text or pattern to match
 * @returns {Promise<void>}
 * @throws {Error} If the error message does not appear within the timeout
 *
 * @example <caption>Verify required field validation</caption>
 * render(<ExpenseForm onExpenseAdded={vi.fn()} />);
 * await submitForm();
 * await assertValidationError('Date is required');
 * await assertValidationError('Amount is required');
 *
 * @example <caption>Verify amount validation</caption>
 * fireEvent.change(screen.getByLabelText('Amount'), {
 *   target: { value: '-10' }
 * });
 * await submitForm();
 * await assertValidationError('Amount must be positive');
 *
 * @example <caption>Verify custom validation with regex</caption>
 * fireEvent.change(screen.getByLabelText('Amount'), {
 *   target: { value: 'abc' }
 * });
 * await submitForm();
 * await assertValidationError(/invalid.*amount/i);
 */
export const assertValidationError = async (message) => {
  await waitFor(() => {
    const errorElement = typeof message === 'string'
      ? screen.getByText(message, { exact: false })
      : screen.getByText(message);
    expect(errorElement).toBeInTheDocument();
  });
};
