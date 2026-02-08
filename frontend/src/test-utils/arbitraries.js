/**
 * Reusable fast-check arbitrary generators for common domain objects.
 * Reduces boilerplate in PBT tests by providing pre-built generators.
 */
import fc from 'fast-check';

// ── Date Generators ──

/**
 * Generate a safe date string in YYYY-MM-DD format.
 * @param {Object} options - { minYear, maxYear }
 */
export const safeDate = ({ minYear = 2020, maxYear = 2030 } = {}) =>
  fc.record({
    year: fc.integer({ min: minYear, max: maxYear }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }) // 28 avoids invalid month-end dates
  }).map(({ year, month, day }) =>
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  );

/**
 * Generate a safe Date object.
 */
export const safeDateObject = (options = {}) =>
  safeDate(options).map(s => new Date(s + 'T00:00:00'));

/**
 * Generate a date range { start, end } where start <= end.
 */
export const dateRange = (options = {}) =>
  fc.tuple(safeDate(options), safeDate(options))
    .map(([a, b]) => a <= b ? { start: a, end: b } : { start: b, end: a });

// ── Amount Generators ──

/**
 * Generate a safe positive dollar amount (0.01 – 99999.99).
 */
export const safeAmount = ({ min = 0.01, max = 99999.99 } = {}) =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true })
    .map(v => Math.round(v * 100) / 100)
    .filter(v => v >= min);

export const positiveAmount = () => safeAmount({ min: 0.01 });

export const amountWithCents = () =>
  fc.tuple(fc.integer({ min: 0, max: 99999 }), fc.integer({ min: 0, max: 99 }))
    .map(([dollars, cents]) => dollars + cents / 100);

// ── String Generators ──

export const safeString = ({ minLength = 1, maxLength = 50 } = {}) =>
  fc.string({ minLength, maxLength }).filter(s => s.trim().length > 0);

export const nonEmptyString = (options = {}) => safeString(options);

export const placeName = () =>
  fc.string({ minLength: 2, maxLength: 40 })
    .map(s => s.replace(/[^a-zA-Z0-9 ]/g, 'a'))
    .filter(s => s.trim().length >= 2);

// ── Domain-Specific Generators ──

const EXPENSE_CATEGORIES = [
  'Groceries', 'Dining', 'Transportation', 'Entertainment', 'Shopping',
  'Utilities', 'Healthcare', 'Tax - Medical', 'Tax - Donation', 'Education',
  'Travel', 'Personal Care', 'Home', 'Gifts', 'Other'
];

const TAX_DEDUCTIBLE_CATEGORIES = ['Tax - Medical', 'Tax - Donation'];

const PAYMENT_METHODS = ['cash', 'cheque', 'debit', 'credit_card'];

const INSURANCE_STATUSES = ['', 'pending', 'submitted', 'approved', 'denied'];

export const expenseCategory = () => fc.constantFrom(...EXPENSE_CATEGORIES);
export const taxDeductibleCategory = () => fc.constantFrom(...TAX_DEDUCTIBLE_CATEGORIES);
export const paymentMethod = () => fc.constantFrom(...PAYMENT_METHODS);
export const insuranceStatus = () => fc.constantFrom(...INSURANCE_STATUSES);

// ── Composite Generators ──

export const expenseRecord = (overrides = {}) =>
  fc.record({
    id: fc.integer({ min: 1, max: 100000 }),
    date: safeDate(),
    place: placeName(),
    amount: positiveAmount(),
    category: expenseCategory(),
    payment_type: paymentMethod(),
    payment_method: fc.constant(''),
    week: fc.integer({ min: 1, max: 5 }),
    notes: fc.constant(''),
    tax_deductible: fc.constant(0),
    insurance_status: fc.constant(''),
    reimbursement_status: fc.constant('none'),
    ...overrides
  });

export const personRecord = () =>
  fc.record({
    id: fc.integer({ min: 1, max: 1000 }),
    name: safeString({ minLength: 2, maxLength: 30 }),
    relationship: fc.constantFrom('self', 'spouse', 'child', 'parent', 'other')
  });

export const budgetRecord = () =>
  fc.record({
    id: fc.integer({ min: 1, max: 1000 }),
    category: expenseCategory(),
    amount: positiveAmount(),
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 })
  });

// ── Sequence Generators ──

export const modalOperationSequence = ({ minLength = 1, maxLength = 20 } = {}) =>
  fc.array(fc.constantFrom('open', 'close'), { minLength, maxLength });

export const stateTransitionSequence = (states) =>
  fc.array(fc.constantFrom(...states), { minLength: 1, maxLength: 20 });
