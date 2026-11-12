import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BankReimbursements from './BankReimbursements';
import InsuranceStatusIndicator from './InsuranceStatusIndicator';
import * as plaidApi from '../../services/plaidApi';

vi.mock('../../services/plaidApi', () => ({ undoInsuranceReimbursement: vi.fn() }));

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

  it('the claim status hover lists the deposits', () => {
    render(<InsuranceStatusIndicator insuranceEligible claimStatus="paid" originalCost={117} outOfPocket={11.7} reimbursements={[dsf]} />);

    expect(screen.getByRole('status').getAttribute('title')).toContain('Reimbursed $105.30 on Nov 12, 2026 (bank)');
  });
});
