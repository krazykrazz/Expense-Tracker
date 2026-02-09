/**
 * @module test-utils
 * @description
 * Unified exports for shared test utilities across the frontend test suite.
 * This module consolidates reusable testing infrastructure to reduce boilerplate
 * and improve consistency in component tests, hook tests, and property-based tests.
 *
 * The test-utils module provides five categories of utilities:
 * - **Arbitraries**: fast-check generators for domain objects (dates, amounts, expenses, etc.)
 * - **Wrappers**: React context provider factories for rendering components/hooks in tests
 * - **Assertions**: Async helpers for waiting on state changes and validating sequences
 * - **Mocks**: API mock factories with call tracking for service layer testing
 * - **Parameterized**: testEach helper for running the same test logic with multiple inputs
 *
 * @example <caption>Basic import - single utility</caption>
 * import { safeDate } from '../test-utils';
 *
 * fc.assert(
 *   fc.property(safeDate(), (date) => {
 *     expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
 *   })
 * );
 *
 * @example <caption>Multiple imports - mixed utilities</caption>
 * import { createModalWrapper, waitForState, expenseRecord } from '../test-utils';
 *
 * const wrapper = createModalWrapper();
 * const { result } = renderHook(() => useModal(), { wrapper });
 *
 * await waitForState(() => result.current.isOpen, true);
 *
 * @example <caption>Parameterized testing</caption>
 * import { testEach } from '../test-utils';
 *
 * testEach([
 *   { input: '', expected: false, description: 'empty string' },
 *   { input: 'valid', expected: true, description: 'valid input' }
 * ]).test('validates $description', ({ input, expected }) => {
 *   expect(validate(input)).toBe(expected);
 * });
 *
 * @example <caption>Fluent wrapper builder</caption>
 * import { wrapperBuilder } from '../test-utils';
 *
 * const wrapper = wrapperBuilder()
 *   .withFilter({ initialYear: 2024 })
 *   .withExpense()
 *   .withModal()
 *   .build();
 *
 * @example <caption>API mocking with call tracking</caption>
 * import { createExpenseApiMock, createCallTracker } from '../test-utils';
 *
 * const tracker = createCallTracker();
 * const mockApi = createExpenseApiMock({
 *   fetchExpenses: tracker.track(vi.fn().mockResolvedValue({ data: [] }))
 * });
 *
 * @example <caption>Property-based testing with domain generators</caption>
 * import { expenseRecord, positiveAmount, safeDate } from '../test-utils';
 *
 * fc.assert(
 *   fc.property(expenseRecord(), (expense) => {
 *     expect(expense.amount).toBeGreaterThan(0);
 *     expect(expense.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
 *   })
 * );
 */

/**
 * @see module:test-utils/arbitraries
 * @description
 * Fast-check generators for property-based testing.
 * Provides arbitraries for dates, amounts, strings, and domain objects (expenses, people, budgets).
 * All generators produce valid, realistic test data that respects domain constraints.
 *
 * Key exports:
 * - safeDate, safeDateObject, dateRange - Date generators with configurable year ranges
 * - safeAmount, positiveAmount, amountWithCents - Monetary value generators
 * - safeString, nonEmptyString, placeName - String generators with validation
 * - expenseCategory, taxDeductibleCategory, paymentMethod - Domain constant generators
 * - expenseRecord, personRecord, budgetRecord - Composite object generators
 * - modalOperationSequence, stateTransitionSequence - Sequence generators for state machine testing
 */
export * from './arbitraries';

/**
 * @see module:test-utils/wrappers
 * @description
 * React context provider wrapper factories for testing components and hooks.
 * Reduces boilerplate when rendering components that depend on context providers.
 * Supports both individual context wrappers and composite multi-context wrappers.
 *
 * Key exports:
 * - createModalWrapper, createFilterWrapper, createExpenseWrapper, createSharedDataWrapper - Single context wrappers
 * - createFullContextWrapper - All contexts in standard nesting order
 * - createMinimalWrapper - Custom subset of contexts with configurable order
 * - wrapperBuilder - Fluent API for building multi-context wrappers with props
 */
export * from './wrappers.jsx';

/**
 * @see module:test-utils/assertions
 * @description
 * Async assertion helpers and sequence validators for testing asynchronous behavior.
 * Wraps @testing-library/react waitFor with domain-specific helpers for common patterns.
 *
 * Key exports:
 * - waitForState - Wait until a getter returns an expected value
 * - waitForStateChange - Wait until a getter's value changes from its initial value
 * - waitForApiCall - Wait until a mock function has been called N times
 * - assertModalOpen, assertModalClosed, assertAllModalsClosed - Modal state assertions
 * - assertSequenceResult - Validate final state after a sequence of operations
 * - assertIdempotence - Verify repeated operations produce identical results
 */
export * from './assertions';

/**
 * @see module:test-utils/mocks
 * @description
 * API mock factories and response builders for service layer testing.
 * Provides pre-configured vi.fn() mocks with realistic default implementations.
 * All mocks return resolved promises by default to avoid unhandled rejections.
 *
 * Key exports:
 * - createExpenseApiMock, createPaymentMethodApiMock, createPeopleApiMock - Service API mocks
 * - createCategorySuggestionApiMock, createCategoriesApiMock, createInvoiceApiMock - Feature-specific mocks
 * - createBudgetApiMock - Budget service mock
 * - mockExpenseResponse, mockErrorResponse, mockSuccessResponse - Response builders
 * - createCallTracker - Manual call tracking for non-vi.fn() functions
 */
export * from './mocks';

/**
 * @see module:test-utils/parameterized
 * @description
 * Parameterized test helper for running the same test logic with multiple inputs.
 * Provides a clean, declarative API for table-driven tests with Vitest.
 * Supports test.only, test.skip, and dynamic test name generation via template strings.
 *
 * Key export:
 * - testEach - Create parameterized tests from an array of test cases
 *
 * @example
 * testEach([
 *   { input: 0, expected: 'zero' },
 *   { input: 1, expected: 'one' }
 * ]).test('converts $input to $expected', ({ input, expected }) => {
 *   expect(convert(input)).toBe(expected);
 * });
 */
export { testEach } from './parameterized';
