import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BankImportModal from './BankImportModal';

vi.mock('./ImportInbox', () => ({ default: () => <div>inbox tab</div> }));
vi.mock('./BankConnections', () => ({ default: () => <div>connections tab</div> }));

const renderModal = (onClose = vi.fn()) => render(
  <header data-testid="header">
    <BankImportModal status={{ enabled: true, environment: 'sandbox', trial: null }} onStatusChange={vi.fn()} onExpensesChanged={vi.fn()} onClose={onClose} />
  </header>
);

describe('BankImportModal', () => {
  it('renders into document.body so the sticky header cannot clip the overlay', () => {
    renderModal();

    const dialog = screen.getByRole('dialog', { name: /Bank Import/ });
    expect(screen.getByTestId('header')).not.toContainElement(dialog);
    expect(dialog.closest('.bank-import-overlay').parentElement).toBe(document.body);
  });

  it('switches tabs and closes on Escape', () => {
    const onClose = vi.fn();
    renderModal(onClose);

    expect(screen.getByText('inbox tab')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Connections' }));
    expect(screen.getByText('connections tab')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
