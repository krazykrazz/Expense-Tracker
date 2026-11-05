import { useState } from 'react';
import { importBankFile } from '../../services/plaidApi';
import './BankImport.css';

/** The server accepts up to 2 MB; years of history are well under that. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * Import a CSV exported from the bank's website into one connected account: a fallback for when Plaid can't
 * fetch from the bank. Previews first (what's new, what Plaid already sent, what's before the start date),
 * then stages the new rows in the Inbox. Plaid takes those rows over when it catches up.
 * @param {{account: {id: number, name: string, mask: (string|null)}, onImported: (message: string) => void, onClose: Function}} props
 */
const BankFileImport = ({ account, onImported, onClose }) => {
  const [csv, setCsv] = useState(null);
  const [fileName, setFileName] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const runPreview = async (text, from) => {
    setBusy(true);
    setError(null);
    try {
      const result = await importBankFile(account.id, { csv: text, fromDate: from, dryRun: true });
      setPreview(result);
      setFromDate(result.fromDate);
    } catch (err) {
      setPreview(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    setPreview(null);
    if (file.size > MAX_FILE_BYTES) {
      setCsv(null);
      setError('That file is larger than 2 MB. Download a shorter date range from the bank.');
      return;
    }
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    await runPreview(text, undefined);
  };

  const handleImport = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await importBankFile(account.id, { csv, fromDate, dryRun: false });
      const parts = [`${plural(result.added, 'new transaction')} in the Inbox`];
      if (result.updated > 0) parts.push(`${result.updated} updated${result.settled > 0 ? ` (${result.settled} settled)` : ''}`);
      onImported(`Imported ${fileName}: ${parts.join(', ')}.`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const toImport = preview ? preview.added + preview.updated : 0;

  return (
    <div className="bank-file-import" data-testid="bank-file-import">
      <div className="bank-file-import-header">
        <strong>Import a file into {account.name}{account.mask ? ` ••${account.mask}` : ''}</strong>
        <button type="button" className="bank-import-link" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
      <p className="bank-import-muted">
        For when Plaid isn&apos;t getting new data from the bank. Download your recent activity as a CSV from the bank&apos;s
        website (Wealthsimple: Activity → Export; CIBC: Download transactions → CSV) and choose it here. Transactions Plaid
        already sent are matched rather than added again, and Plaid takes over the imported ones when it catches up, so
        nothing is counted twice. Whichever source has more detail (settled amount, dates, merchant) is kept.
      </p>
      <label className="bank-file-import-picker">
        <span>CSV file</span>
        <input type="file" accept=".csv,text/csv" onChange={handleFile} disabled={busy} aria-label={`CSV file for ${account.name}`} />
      </label>

      {preview && (
        <div className="bank-file-import-preview" data-testid="bank-file-import-preview">
          <div>{preview.formatLabel} file: {plural(preview.total, 'row')}.</div>
          <label className="bank-file-import-from">
            Import from
            <input
              type="date"
              value={fromDate}
              onChange={(event) => {
                setFromDate(event.target.value);
                if (event.target.value) runPreview(csv, event.target.value);
              }}
              disabled={busy}
              aria-label="Import from date"
            />
          </label>
          <ul>
            {preview.beforeFrom > 0 && <li>{plural(preview.beforeFrom, 'row')} before then: skipped{preview.fromDate === preview.defaultFromDate ? ' (already in the tracker from before the bank was connected)' : ''}</li>}
            {preview.alreadyFromBank > 0 && <li>{preview.alreadyFromBank} already received from the bank: skipped</li>}
            {preview.unchanged > 0 && <li>{preview.unchanged} imported before, unchanged</li>}
            {preview.updated > 0 && <li>{preview.updated} already here, to update with the file&apos;s details{preview.settled > 0 ? ` (${preview.settled} now settled)` : ''}</li>}
            <li><strong>{plural(preview.added, 'new transaction')}</strong>{preview.pendingAdded > 0 ? ` (${preview.pendingAdded} pending)` : ''}</li>
          </ul>
          <div className="bank-connection-actions">
            <button type="button" className="bank-import-primary" onClick={handleImport} disabled={busy || toImport === 0}>
              {toImport === 0 ? 'Nothing new to import' : `Import ${plural(toImport, 'transaction')}`}
            </button>
          </div>
        </div>
      )}
      {error && <div className="bank-import-error" role="alert">{error}</div>}
    </div>
  );
};

export default BankFileImport;
