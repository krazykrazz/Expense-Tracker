import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FixedCandidate from './FixedCandidate';

const txn = { id: 5, amount: 1500, date: '2026-10-03', postedDate: '2026-10-03' };
const fixed = (extra = {}) => ({
  id: 9, name: 'Mortgage', amount: 1500, dueDay: 1, year: 2026, month: 10, expectedDate: '2026-10-01', amountDiffers: false, ...extra
});
const offer = (existing) => ({ loanId: 3, loanName: 'Home loan', existing });
const renderCandidate = (candidate, onConfirm = vi.fn()) => {
  render(<ul><FixedCandidate fixed={candidate} txn={txn} busy={false} onConfirm={onConfirm} /></ul>);
  return onConfirm;
};

describe('FixedCandidate', () => {
  it('a fixed expense without a loan just confirms', () => {
    const onConfirm = renderCandidate(fixed());

    expect(screen.queryByTestId('loan-payment-choice')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledWith();
  });

  it('with a payment already logged near the date, links it unless another choice is made', () => {
    const onConfirm = renderCandidate(fixed({ loanPayment: offer({ id: 41, date: '2026-10-01', amount: 1500 }) }));

    expect(screen.getByLabelText(/It is the payment already logged/)).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenLastCalledWith({ loanPayment: 'link', loanPaymentId: 41 });

    fireEvent.click(screen.getByLabelText(/Record a payment of \$1,500\.00/));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenLastCalledWith({ loanPayment: 'log' });

    fireEvent.click(screen.getByLabelText('Leave the payment history alone'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenLastCalledWith();
  });

  it('with nothing logged yet, records the payment by default and offers no link', () => {
    const onConfirm = renderCandidate(fixed({ loanPayment: offer(null) }));

    expect(screen.queryByLabelText(/It is the payment already logged/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Record a payment of/)).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledWith({ loanPayment: 'log' });
  });
});
