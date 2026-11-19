import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BankReimbursements from './BankReimbursements';
import InsuranceStatusIndicator from './InsuranceStatusIndicator';
import * as plaidApi from '../../services/plaidApi';

vi.mock('../../services/plaidApi', () => ({ undoInsuranceReimbursement: vi.fn(), undoReimbursement: vi.fn() }));

const dsf = { plaidTransactionId: 144, amount: 105.3, date: '2026-11-12', name: 'DSF - Direct deposit' };

describe('insurer deposits on an expense', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists each deposit and undoes it: the list reloads and the form closes', async () => {
    plaidApi.undoInsuranceReimbursement.mockResolvedValue({});
    const onUndone = vi.fn();
    const reload = vi.fn();
    window.addEventListener('expensesUpdated', reload);

    render(<BankReimbursements reimbursements={[dsf]} onUndone={onUndone} />);
    expect(screen.getByTestId('bank-reimbursements')).toHaveTextContent('Reimbursed $105.30 on Nov 12, 2026 (bank: DSF - Direct deposit)');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(onUndone).toHaveBeenCalled());
    expect(plaidApi.undoInsuranceReimbursement).toHaveBeenCalledWith(144);
    expect(reload).toHaveBeenCalled();
    window.removeEventListener('expensesUpdated', reload);
  });

  it('shows a failed undo and keeps the form open; nothing without deposits', async () => {
    plaidApi.undoInsuranceReimbursement.mockRejectedValue(new Error('Not found'));
    const onUndone = vi.fn();

    const { container, rerender } = render(<BankReimbursements reimbursements={[dsf]} onUndone={onUndone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Not found');
    expect(onUndone).not.toHaveBeenCalled();
    rerender(<BankReimbursements reimbursements={[]} onUndone={onUndone} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('refunds and deposits on other expenses say so and use their own undo, never the insurance one', async () => {
    plaidApi.undoReimbursement.mockResolvedValue({});
    const onUndone = vi.fn();
    const refund = { plaidTransactionId: 7, kind: 'refund', amount: 13.74, date: '2026-11-16', name: 'HomeSense' };
    const repaid = { plaidTransactionId: 8, kind: 'deposit', amount: 40, date: '2026-11-17', name: 'Interac e-Transfer from Jordan' };

    render(<BankReimbursements reimbursements={[refund, repaid]} onUndone={onUndone} />);
    const note = screen.getByTestId('bank-reimbursements');
    expect(note).toHaveTextContent('Refunded $13.74 on Nov 16, 2026 (bank: HomeSense)');
    expect(note).toHaveTextContent('Repaid $40.00 on Nov 17, 2026 (bank: Interac e-Transfer from Jordan)');
    fireEvent.click(screen.getAllByRole('button', { name: 'Undo' })[1]);

    await waitFor(() => expect(onUndone).toHaveBeenCalled());
    expect(plaidApi.undoReimbursement).toHaveBeenCalledWith(8);
    expect(plaidApi.undoInsuranceReimbursement).not.toHaveBeenCalled();
  });

  it('the claim status hover lists the deposits', () => {
    render(<InsuranceStatusIndicator insuranceEligible claimStatus="paid" originalCost={117} outOfPocket={11.7} reimbursements={[dsf]} />);

    expect(screen.getByRole('status').getAttribute('title')).toContain('Reimbursed $105.30 on Nov 12, 2026 (bank)');
  });
});
