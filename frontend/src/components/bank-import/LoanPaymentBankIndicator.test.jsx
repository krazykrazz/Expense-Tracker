import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoanPaymentBankIndicator from './LoanPaymentBankIndicator';

const confirmation = { landedDate: '2026-10-27', amount: 17.78, plannedAmount: 17.47, name: 'LOAN PMT', fixedExpenseName: 'HELOC interest' };

describe('LoanPaymentBankIndicator', () => {
  it('renders nothing for a payment the bank did not confirm', () => {
    const { container } = render(<LoanPaymentBankIndicator payment={{ amount: 17.78, bankConfirmation: null }} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows when it landed and which fixed expense it confirmed, green when the amounts agree', () => {
    render(<LoanPaymentBankIndicator payment={{ amount: 17.78, bankConfirmation: confirmation }} />);

    const indicator = screen.getByTestId('loan-payment-bank-indicator');
    expect(indicator).toHaveClass('confirmed');
    expect(indicator).toHaveAttribute('title', expect.stringContaining('Fixed expense: HELOC interest'));
    expect(indicator).toHaveAttribute('title', expect.stringContaining('$17.78'));
  });

  it('is amber and says so when the payment is not what the bank paid', () => {
    render(<LoanPaymentBankIndicator payment={{ amount: 17.47, bankConfirmation: confirmation }} />);

    const indicator = screen.getByTestId('loan-payment-bank-indicator');
    expect(indicator).toHaveClass('differs');
    expect(indicator.getAttribute('title')).toMatch(/^Amount differs from bank: \$17\.78/);
  });
});
