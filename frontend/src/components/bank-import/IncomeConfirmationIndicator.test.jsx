import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import IncomeConfirmationIndicator from './IncomeConfirmationIndicator';

const confirmation = (overrides = {}) => ({
  landedDate: '2026-10-29', amount: 10848.23, plannedAmount: 10848.23, name: 'JAT - Direct deposit', ...overrides
});

describe('IncomeConfirmationIndicator', () => {
  it('renders nothing for income not received in the bank', () => {
    const { container } = render(<IncomeConfirmationIndicator incomeSource={{ amount: 100, bankConfirmation: null }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the deposit and when it landed', () => {
    render(<IncomeConfirmationIndicator incomeSource={{ amount: 10848.23, bankConfirmation: confirmation() }} />);
    const indicator = screen.getByTestId('income-confirmation-indicator');
    expect(indicator).toHaveClass('confirmed');
    expect(indicator.getAttribute('title')).toBe('Received in bank: JAT - Direct deposit\nlanded Oct 29, 2026 · $10,848.23');
  });

  it('mentions an expected amount that was updated to the deposit', () => {
    render(<IncomeConfirmationIndicator incomeSource={{ amount: 10848.23, bankConfirmation: confirmation({ plannedAmount: 10500 }) }} />);
    expect(screen.getByTestId('income-confirmation-indicator').getAttribute('title')).toContain('Expected $10,500.00, updated to the deposit amount');
  });

  it('warns when the income amount differs from the deposit (update declined or edited later)', () => {
    render(<IncomeConfirmationIndicator incomeSource={{ amount: 10500, bankConfirmation: confirmation({ plannedAmount: 10500 }) }} />);
    const indicator = screen.getByTestId('income-confirmation-indicator');
    expect(indicator).toHaveClass('differs');
    expect(indicator.getAttribute('title')).toMatch(/^Amount differs from deposit: \$10,848\.23/);
    expect(indicator.getAttribute('title')).not.toContain('updated to the deposit amount');
  });
});
