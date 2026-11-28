import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UnlinkFromBank from './UnlinkFromBank';
import { unlinkBankTransaction } from '../../services/plaidApi';

vi.mock('../../services/plaidApi', () => ({ unlinkBankTransaction: vi.fn() }));

describe('UnlinkFromBank', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders nothing without a bank transaction', () => {
    const { container } = render(<UnlinkFromBank bankTransactionId={null} what="expense" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('unlinks after confirming and tells the parent', async () => {
    unlinkBankTransaction.mockResolvedValue({});
    const onUnlinked = vi.fn();
    render(<UnlinkFromBank bankTransactionId={7} what="fixed expense" onUnlinked={onUnlinked} />);

    fireEvent.click(screen.getByRole('button', { name: 'Unlink from bank' }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('the fixed expense stays as it is'));
    await waitFor(() => expect(onUnlinked).toHaveBeenCalled());
    expect(unlinkBankTransaction).toHaveBeenCalledWith(7);
  });

  it('does nothing when the confirm is cancelled, and shows a refusal', async () => {
    window.confirm.mockReturnValueOnce(false);
    unlinkBankTransaction.mockRejectedValue(new Error('This bank charge is split across several expenses'));
    render(<UnlinkFromBank bankTransactionId={7} what="expense" />);

    fireEvent.click(screen.getByRole('button', { name: 'Unlink from bank' }));
    expect(unlinkBankTransaction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Unlink from bank' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('split across several expenses');
  });
});
