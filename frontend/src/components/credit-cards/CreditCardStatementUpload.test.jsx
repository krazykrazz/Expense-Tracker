import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadStatement } from '../../services/creditCardApi';
import CreditCardStatementUpload from './CreditCardStatementUpload';

vi.mock('../../services/creditCardApi', () => ({
  uploadStatement: vi.fn()
}));

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn()
  })
}));

function selectFile(container, file) {
  fireEvent.change(container.querySelector('input[type="file"]'), {
    target: { files: [file] }
  });
}

describe('CreditCardStatementUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a non-PDF file without enabling upload', () => {
    const { container } = render(<CreditCardStatementUpload paymentMethodId={1} />);
    selectFile(container, new File(['not pdf'], 'statement.txt', { type: 'text/plain' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Only PDF files are allowed');
    expect(screen.getByRole('button', { name: 'Upload Statement' })).toBeDisabled();
  });

  it('uploads the selected statement with exact metadata and progress callback', async () => {
    const file = new File(['%PDF-1.4'], 'statement.pdf', { type: 'application/pdf' });
    const uploaded = vi.fn();
    uploadStatement.mockImplementation(async (_id, _file, _metadata, reportProgress) => {
      reportProgress(65);
      return { id: 42 };
    });
    const { container } = render(
      <CreditCardStatementUpload
        paymentMethodId={7}
        onStatementUploaded={uploaded}
      />
    );
    selectFile(container, file);
    fireEvent.change(container.querySelector('#statement-date'), {
      target: { value: '2026-02-25' }
    });
    fireEvent.change(container.querySelector('#period-start'), {
      target: { value: '2026-01-26' }
    });
    fireEvent.change(container.querySelector('#period-end'), {
      target: { value: '2026-02-25' }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Upload Statement' }));

    await waitFor(() => expect(uploaded).toHaveBeenCalledWith({ id: 42 }));
    expect(uploadStatement).toHaveBeenCalledWith(
      7,
      file,
      {
        statement_date: '2026-02-25',
        statement_period_start: '2026-01-26',
        statement_period_end: '2026-02-25'
      },
      expect.any(Function)
    );
    expect(screen.queryByText('statement.pdf')).not.toBeInTheDocument();
  });

  it('shows upload failures and can clear the error', async () => {
    uploadStatement.mockRejectedValue(new Error('Upload denied'));
    const { container } = render(<CreditCardStatementUpload paymentMethodId={1} />);
    selectFile(container, new File(['pdf'], 'statement.pdf', { type: 'application/pdf' }));
    fireEvent.click(screen.getByRole('button', { name: 'Upload Statement' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Upload denied');
    fireEvent.click(screen.getByRole('button', { name: 'Clear error' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
