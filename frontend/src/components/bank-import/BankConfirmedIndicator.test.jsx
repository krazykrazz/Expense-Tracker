import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BankConfirmedIndicator, { bankLinkState } from './BankConfirmedIndicator';
import { testEach } from '../../test-utils/parameterized';

const link = (overrides = {}) => ({ status: 'matched', name: 'Coffee Shop', rawName: 'SQ *COFFEE', date: '2026-10-10', amount: 25.5, ...overrides });

describe('bankLinkState', () => {
  testEach([
    { description: 'no link', expense: { amount: 10, bankLink: null }, expected: null },
    { description: 'same cents', expense: { amount: 25.5, bankLink: link() }, expected: 'confirmed' },
    { description: 'float noise', expense: { amount: 25.500000001, bankLink: link() }, expected: 'confirmed' },
    { description: 'edited amount', expense: { amount: 30, bankLink: link() }, expected: 'differs' },
    { description: 'reimbursed: bank charged the original cost', expense: { amount: 5, original_cost: 25.5, bankLink: link() }, expected: 'confirmed' },
  ]).it('returns $expected', ({ expense, expected }) => {
    expect(bankLinkState(expense)).toBe(expected);
  });
});

describe('BankConfirmedIndicator', () => {
  it('renders nothing for expenses without a bank link', () => {
    const { container } = render(<BankConfirmedIndicator expense={{ amount: 10, bankLink: null }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('describes a matched transaction', () => {
    render(<BankConfirmedIndicator expense={{ amount: 25.5, bankLink: link() }} />);
    const indicator = screen.getByTestId('bank-confirmed-indicator');
    expect(indicator).toHaveClass('confirmed');
    expect(indicator.getAttribute('title')).toContain('Confirmed by bank: Coffee Shop');
    expect(indicator.getAttribute('title')).toContain('Matched to bank transaction');
  });

  it('describes an expense added from the bank', () => {
    render(<BankConfirmedIndicator expense={{ amount: 25.5, bankLink: link({ status: 'added' }) }} />);
    expect(screen.getByTestId('bank-confirmed-indicator').getAttribute('title')).toContain('Added from bank');
  });

  it('warns when the amount no longer matches the bank', () => {
    render(<BankConfirmedIndicator expense={{ amount: 30, bankLink: link() }} />);
    const indicator = screen.getByTestId('bank-confirmed-indicator');
    expect(indicator).toHaveClass('differs');
    expect(indicator.getAttribute('title')).toMatch(/^Amount differs from bank: \$25\.50/);
  });
});
