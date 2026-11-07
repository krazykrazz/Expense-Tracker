import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import BankFileImport from './BankFileImport';
import { importBankFile } from '../../services/plaidApi';

vi.mock('../../services/plaidApi', () => ({
  importBankFile: vi.fn(),
}));

const account = { id: 7, name: 'Credit Card', mask: 'KL54' };
const csvFile = (text = 'transaction_date,transaction_type,status,merchant,amount\n', name = 'card.csv') =>
  new File([text], name, { type: 'text/csv' });

const preview = {
  formatLabel: 'Wealthsimple credit card', fromDate: '2026-10-03', defaultFromDate: '2026-10-03', total: 166,
  beforeFrom: 111, alreadyFromBank: 51, unchanged: 0, updated: 0, added: 4, pendingAdded: 1, settled: 0, dryRun: true
};

const chooseFile = (file) => fireEvent.change(screen.getByLabelText('CSV file for Credit Card'), { target: { files: [file] } });

describe('BankFileImport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('previews the file, then imports the new rows', async () => {
    importBankFile.mockResolvedValueOnce(preview).mockResolvedValueOnce({ ...preview, dryRun: false });
    const onImported = vi.fn();
    render(<BankFileImport account={account} onImported={onImported} onClose={vi.fn()} />);

    chooseFile(csvFile('header\nrow', 'credit-card-activities.csv'));

    const summary = await screen.findByTestId('bank-file-import-preview');
    expect(importBankFile).toHaveBeenCalledWith(7, { csv: 'header\nrow', fromDate: undefined, dryRun: true });
    expect(summary).toHaveTextContent('Wealthsimple credit card file: 166 rows.');
    expect(summary).toHaveTextContent('111 rows before then: skipped (already in the tracker from before the bank was connected)');
    expect(summary).toHaveTextContent('51 already received from the bank: skipped');
    expect(summary).toHaveTextContent('4 new transactions (1 pending)');
    expect(screen.getByLabelText('Import from date')).toHaveValue('2026-10-03');

    fireEvent.click(screen.getByRole('button', { name: 'Import 4 transactions' }));

    await waitFor(() => expect(onImported).toHaveBeenCalledWith('Imported credit-card-activities.csv: 4 new transactions in the Inbox.'));
    expect(importBankFile).toHaveBeenLastCalledWith(7, { csv: 'header\nrow', fromDate: '2026-10-03', dryRun: false });
  });

  it('previews again once a new start date is entered, not on every keystroke', async () => {
    importBankFile.mockResolvedValueOnce(preview).mockResolvedValueOnce({ ...preview, fromDate: '2026-11-01', beforeFrom: 160, alreadyFromBank: 2, added: 4 });
    render(<BankFileImport account={account} onImported={vi.fn()} onClose={vi.fn()} />);
    chooseFile(csvFile());
    await screen.findByTestId('bank-file-import-preview');
    const dateInput = screen.getByLabelText('Import from date');

    fireEvent.change(dateInput, { target: { value: '2026-11-01' } });
    expect(importBankFile).toHaveBeenCalledTimes(1);
    expect(dateInput).not.toBeDisabled();
    fireEvent.blur(dateInput);

    await waitFor(() => expect(importBankFile).toHaveBeenLastCalledWith(7, expect.objectContaining({ fromDate: '2026-11-01', dryRun: true })));
    expect(await screen.findByText(/160 rows before then: skipped$/)).toBeInTheDocument();
  });

  it('ignores a slower, older preview that arrives after a newer one', async () => {
    let resolveOld;
    importBankFile
      .mockResolvedValueOnce(preview)
      .mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ ...preview, fromDate: '2026-11-01', beforeFrom: 160 });
    render(<BankFileImport account={account} onImported={vi.fn()} onClose={vi.fn()} />);
    chooseFile(csvFile());
    await screen.findByTestId('bank-file-import-preview');
    const dateInput = screen.getByLabelText('Import from date');

    fireEvent.change(dateInput, { target: { value: '2026-10-20' } });
    fireEvent.keyDown(dateInput, { key: 'Enter' });
    fireEvent.change(dateInput, { target: { value: '2026-11-01' } });
    fireEvent.keyDown(dateInput, { key: 'Enter' });
    expect(await screen.findByText(/160 rows before then: skipped$/)).toBeInTheDocument();

    await act(async () => resolveOld({ ...preview, fromDate: '2026-10-20', beforeFrom: 99 }));
    expect(screen.getByText(/160 rows before then: skipped$/)).toBeInTheDocument();
    expect(dateInput).toHaveValue('2026-11-01');
  });

  it('says when there is nothing new, and shows what the server refused', async () => {
    importBankFile.mockResolvedValueOnce({ ...preview, added: 0, pendingAdded: 0, unchanged: 4 });
    render(<BankFileImport account={account} onImported={vi.fn()} onClose={vi.fn()} />);
    chooseFile(csvFile());

    expect(await screen.findByRole('button', { name: 'Nothing new to import' })).toBeDisabled();

    importBankFile.mockRejectedValueOnce(new Error('Unrecognised file. Supported: Wealthsimple credit card and Wealthsimple chequing CSV exports.'));
    chooseFile(csvFile('nope'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unrecognised file');
    expect(screen.queryByTestId('bank-file-import-preview')).not.toBeInTheDocument();
  });

  it('refuses a file over 2 MB without sending it', async () => {
    render(<BankFileImport account={account} onImported={vi.fn()} onClose={vi.fn()} />);
    const big = csvFile('x');
    Object.defineProperty(big, 'size', { value: 3 * 1024 * 1024 });

    chooseFile(big);

    expect(await screen.findByRole('alert')).toHaveTextContent('larger than 2 MB');
    expect(importBankFile).not.toHaveBeenCalled();
  });
});
