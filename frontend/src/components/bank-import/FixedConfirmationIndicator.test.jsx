import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import FixedConfirmationIndicator from './FixedConfirmationIndicator';
import { testEach } from '../../test-utils/parameterized';

const confirmation = (overrides = {}) => ({
  landedDate: '2026-10-03', amount: 1500, plannedAmount: 1500, name: 'MORTGAGE PMT', expectedDate: '2026-10-01', daysFromDue: 2, ...overrides
});

describe('FixedConfirmationIndicator', () => {
  it('renders nothing for unconfirmed fixed expenses', () => {
    const { container } = render(<FixedConfirmationIndicator fixedExpense={{ amount: 1500, bankConfirmation: null }} />);
    expect(container).toBeEmptyDOMElement();
  });

  testEach([
    { description: 'late', daysFromDue: 2, expected: '2 days after the due date' },
    { description: 'one day early', daysFromDue: -1, expected: '1 day before the due date' },
    { description: 'on time', daysFromDue: 0, expected: '(on the due date)' },
    { description: 'no due day', daysFromDue: null, expected: 'landed Oct 3, 2026 ·' },
  ]).it('describes when it landed: $description', ({ daysFromDue, expected }) => {
    render(<FixedConfirmationIndicator fixedExpense={{ amount: 1500, bankConfirmation: confirmation({ daysFromDue }) }} />);
    const indicator = screen.getByTestId('fixed-confirmation-indicator');
    expect(indicator).toHaveClass('confirmed');
    expect(indicator.getAttribute('title')).toContain(expected);
  });

  it('mentions an amount that was updated from the plan', () => {
    render(<FixedConfirmationIndicator fixedExpense={{ amount: 17.78, bankConfirmation: confirmation({ amount: 17.78, plannedAmount: 17.47 }) }} />);
    expect(screen.getByTestId('fixed-confirmation-indicator').getAttribute('title')).toContain('Planned $17.47, updated to the bank amount');
  });

  it('warns when the planned amount was edited away from the bank amount', () => {
    render(<FixedConfirmationIndicator fixedExpense={{ amount: 1600, bankConfirmation: confirmation() }} />);
    const indicator = screen.getByTestId('fixed-confirmation-indicator');
    expect(indicator).toHaveClass('differs');
    expect(indicator.getAttribute('title')).toMatch(/^Amount differs from bank: \$1,500\.00/);
  });
});
