import { describe, it, expect } from 'vitest';
import {
  bankLinkState, bankLinkTitle, fixedConfirmationState, fixedConfirmationTitle, bankPillProps
} from './bankConfirmation';
import { testEach } from '../../test-utils/parameterized';

const link = (overrides = {}) => ({ status: 'matched', name: 'Coffee Shop', rawName: 'SQ *COFFEE', date: '2026-10-10', amount: 25.5, ...overrides });
const confirmation = (overrides = {}) => ({
  landedDate: '2026-10-03', amount: 1500, plannedAmount: 1500, name: 'MORTGAGE PMT', expectedDate: '2026-10-01', daysFromDue: 2, ...overrides
});

describe('expense bank link', () => {
  testEach([
    { description: 'no link', expense: { amount: 10, bankLink: null }, expected: null },
    { description: 'same cents', expense: { amount: 25.5, bankLink: link() }, expected: 'confirmed' },
    { description: 'float noise', expense: { amount: 25.500000001, bankLink: link() }, expected: 'confirmed' },
    { description: 'edited amount', expense: { amount: 30, bankLink: link() }, expected: 'differs' },
    { description: 'reimbursed: bank charged the original cost', expense: { amount: 5, original_cost: 25.5, bankLink: link() }, expected: 'confirmed' },
  ]).it('state is $expected: $description', ({ expense, expected }) => {
    expect(bankLinkState(expense)).toBe(expected);
  });

  it('describes a matched transaction, an added one, and a differing amount', () => {
    expect(bankLinkTitle({ amount: 10, bankLink: null })).toBeNull();
    expect(bankLinkTitle({ amount: 25.5, bankLink: link() })).toBe('Confirmed by bank: Coffee Shop\nOct 10, 2026 · $25.50\nMatched to bank transaction');
    expect(bankLinkTitle({ amount: 25.5, bankLink: link({ status: 'added' }) })).toContain('Added from bank');
    expect(bankLinkTitle({ amount: 30, bankLink: link() })).toMatch(/^Amount differs from bank: \$25\.50/);
  });
});

describe('fixed expense confirmation', () => {
  it('state compares the current amount to the bank amount', () => {
    expect(fixedConfirmationState({ amount: 1500, bankConfirmation: null })).toBeNull();
    expect(fixedConfirmationState({ amount: 1500, bankConfirmation: confirmation() })).toBe('confirmed');
    expect(fixedConfirmationState({ amount: 1600, bankConfirmation: confirmation() })).toBe('differs');
  });

  testEach([
    { description: 'late', daysFromDue: 2, expected: '2 days after the due date' },
    { description: 'one day early', daysFromDue: -1, expected: '1 day before the due date' },
    { description: 'on time', daysFromDue: 0, expected: '(on the due date)' },
    { description: 'no due day', daysFromDue: null, expected: 'landed Oct 3, 2026 ·' },
  ]).it('describes when it landed: $description', ({ daysFromDue, expected }) => {
    expect(fixedConfirmationTitle({ amount: 1500, bankConfirmation: confirmation({ daysFromDue }) })).toContain(expected);
  });

  it('mentions an updated plan, and warns when the amount was edited away from the bank amount', () => {
    expect(fixedConfirmationTitle({ amount: 17.78, bankConfirmation: confirmation({ amount: 17.78, plannedAmount: 17.47 }) }))
      .toContain('Planned $17.47, updated to the bank amount');
    expect(fixedConfirmationTitle({ amount: 1600, bankConfirmation: confirmation() })).toMatch(/^Amount differs from bank: \$1,500\.00/);
  });
});

describe('bankPillProps', () => {
  it('adds nothing without a bank state', () => {
    expect(bankPillProps(null, null)).toEqual({ className: '', attrs: {}, srText: null });
  });

  it('colours the pill and puts the details in its hover text', () => {
    expect(bankPillProps('confirmed', 'Confirmed by bank')).toEqual({
      className: ' bank-pill-confirmed',
      attrs: { title: 'Confirmed by bank', 'data-testid': 'bank-method-pill', 'data-bank-state': 'confirmed' },
      srText: ' (confirmed by bank)'
    });
    expect(bankPillProps('differs', 'x').className).toBe(' bank-pill-differs');
  });
});
