import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BankImportModal from './BankImportModal';
import { __resetModalStack } from '../../hooks/useModalBehavior';

vi.mock('./ImportInbox', () => ({ default: () => <div>inbox tab</div> }));
vi.mock('./BankConnections', () => ({ default: () => <div>connections tab</div> }));

const renderModal = (onClose = vi.fn()) => render(
  <header data-testid="header">
    <BankImportModal status={{ enabled: true, environment: 'sandbox', trial: null }} onStatusChange={vi.fn()} onExpensesChanged={vi.fn()} onClose={onClose} />
  </header>
);

describe('BankImportModal', () => {
  afterEach(() => __resetModalStack());

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

  it('moves focus into the dialog, keeps Tab inside it, and gives focus back to the trigger when it closes', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Bank';
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = renderModal();
    const dialog = screen.getByRole('dialog', { name: /Bank Import/ });
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');

    // Shift+Tab from the first control wraps to the last one inside the dialog
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(dialog).toContainElement(document.activeElement);
    expect(document.activeElement).not.toBe(close);

    unmount();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
    trigger.remove();
  });
});
