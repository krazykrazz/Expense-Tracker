/**
 * Property tests for arbitraries module.
 * **Property 2: Arbitrary generators produce valid domain values**
 * **Validates: Requirements 3.1**
  *
 * @invariant Generator Validity: For any value produced by the arbitrary generators, the output conforms to the domain constraints (valid dates, positive amounts, non-empty strings, valid categories). Randomization inherently tests the generators themselves.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  safeDate, safeDateObject, dateRange,
  safeAmount, positiveAmount, amountWithCents,
  safeString, nonEmptyString, placeName,
  expenseCategory, taxDeductibleCategory, paymentMethod, insuranceStatus,
  expenseRecord, personRecord, budgetRecord,
  modalOperationSequence, stateTransitionSequence,
} from '../arbitraries';

const VALID_CATEGORIES = [
  'Groceries', 'Dining', 'Transportation', 'Entertainment', 'Shopping',
  'Utilities', 'Healthcare', 'Tax - Medical', 'Tax - Donation', 'Education',
  'Travel', 'Personal Care', 'Home', 'Gifts', 'Other'
];
const VALID_METHODS = ['cash', 'cheque', 'debit', 'credit_card'];
const VALID_INSURANCE = ['', 'pending', 'submitted', 'approved', 'denied'];
const VALID_TAX = ['Tax - Medical', 'Tax - Donation'];

describe('Property 2: Arbitrary generators produce valid domain values', () => {
  describe('Date generators', () => {
    it('safeDate produces valid YYYY-MM-DD strings', () => {
      fc.assert(fc.property(safeDate(), (d) => {
        expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const parsed = new Date(d + 'T00:00:00');
        expect(parsed.toString()).not.toBe('Invalid Date');
      }), { numRuns: 100 });
    });

    it('safeDateObject produces valid Date objects', () => {
      fc.assert(fc.property(safeDateObject(), (d) => {
        expect(d).toBeInstanceOf(Date);
        expect(isNaN(d.getTime())).toBe(false);
      }), { numRuns: 100 });
    });

    it('dateRange produces start <= end', () => {
      fc.assert(fc.property(dateRange(), ({ start, end }) => {
        expect(start <= end).toBe(true);
      }), { numRuns: 100 });
    });
  });

  describe('Amount generators', () => {
    it('safeAmount produces finite positive numbers', () => {
      fc.assert(fc.property(safeAmount(), (a) => {
        expect(Number.isFinite(a)).toBe(true);
        expect(a).toBeGreaterThanOrEqual(0.01);
        expect(a).toBeLessThanOrEqual(99999.99);
      }), { numRuns: 100 });
    });

    it('positiveAmount is always > 0', () => {
      fc.assert(fc.property(positiveAmount(), (a) => {
        expect(a).toBeGreaterThan(0);
      }), { numRuns: 100 });
    });

    it('amountWithCents has at most 2 decimal places', () => {
      fc.assert(fc.property(amountWithCents(), (a) => {
        const cents = Math.round(a * 100);
        expect(Math.abs(a - cents / 100)).toBeLessThan(0.001);
      }), { numRuns: 100 });
    });
  });

  describe('String generators', () => {
    it('safeString produces non-empty trimmed strings', () => {
      fc.assert(fc.property(safeString(), (s) => {
        expect(s.trim().length).toBeGreaterThan(0);
      }), { numRuns: 100 });
    });

    it('placeName produces strings of length >= 2', () => {
      fc.assert(fc.property(placeName(), (s) => {
        expect(s.trim().length).toBeGreaterThanOrEqual(2);
      }), { numRuns: 100 });
    });
  });

  describe('Domain-specific generators', () => {
    it('expenseCategory produces valid categories', () => {
      fc.assert(fc.property(expenseCategory(), (c) => {
        expect(VALID_CATEGORIES).toContain(c);
      }), { numRuns: 50 });
    });

    it('taxDeductibleCategory produces only tax categories', () => {
      fc.assert(fc.property(taxDeductibleCategory(), (c) => {
        expect(VALID_TAX).toContain(c);
      }), { numRuns: 50 });
    });

    it('paymentMethod produces valid methods', () => {
      fc.assert(fc.property(paymentMethod(), (m) => {
        expect(VALID_METHODS).toContain(m);
      }), { numRuns: 50 });
    });

    it('insuranceStatus produces valid statuses', () => {
      fc.assert(fc.property(insuranceStatus(), (s) => {
        expect(VALID_INSURANCE).toContain(s);
      }), { numRuns: 50 });
    });
  });

  describe('Composite generators', () => {
    it('expenseRecord has all required fields', () => {
      fc.assert(fc.property(expenseRecord(), (e) => {
        expect(e).toHaveProperty('id');
        expect(e).toHaveProperty('date');
        expect(e).toHaveProperty('place');
        expect(e).toHaveProperty('amount');
        expect(e).toHaveProperty('category');
        expect(e).toHaveProperty('payment_type');
        expect(typeof e.id).toBe('number');
        expect(e.amount).toBeGreaterThan(0);
        expect(VALID_CATEGORIES).toContain(e.category);
        expect(VALID_METHODS).toContain(e.payment_type);
      }), { numRuns: 50 });
    });

    it('personRecord has id, name, relationship', () => {
      fc.assert(fc.property(personRecord(), (p) => {
        expect(typeof p.id).toBe('number');
        expect(p.name.trim().length).toBeGreaterThan(0);
        expect(['self', 'spouse', 'child', 'parent', 'other']).toContain(p.relationship);
      }), { numRuns: 50 });
    });

    it('budgetRecord has valid category and positive amount', () => {
      fc.assert(fc.property(budgetRecord(), (b) => {
        expect(VALID_CATEGORIES).toContain(b.category);
        expect(b.amount).toBeGreaterThan(0);
        expect(b.year).toBeGreaterThanOrEqual(2020);
        expect(b.month).toBeGreaterThanOrEqual(1);
        expect(b.month).toBeLessThanOrEqual(12);
      }), { numRuns: 50 });
    });
  });

  describe('Sequence generators', () => {
    it('modalOperationSequence contains only open/close', () => {
      fc.assert(fc.property(modalOperationSequence(), (ops) => {
        expect(ops.length).toBeGreaterThanOrEqual(1);
        ops.forEach(op => expect(['open', 'close']).toContain(op));
      }), { numRuns: 50 });
    });

    it('stateTransitionSequence contains only provided states', () => {
      const states = ['idle', 'loading', 'error', 'success'];
      fc.assert(fc.property(stateTransitionSequence(states), (seq) => {
        expect(seq.length).toBeGreaterThanOrEqual(1);
        seq.forEach(s => expect(states).toContain(s));
      }), { numRuns: 50 });
    });
  });
});
