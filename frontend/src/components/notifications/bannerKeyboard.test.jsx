import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OverPlannedBanner from './OverPlannedBanner';
import BankAttentionBanner from './BankAttentionBanner';
import { OPEN_BANK_IMPORT_EVENT } from '../../services/plaidApi';

/**
 * Clickable banners (`role="button"`) contain a dismiss button. Enter/Space on that button must dismiss,
 * not bubble up and run the banner's own action (which also cancelled the button press).
 */
describe('banner keyboard handling', () => {
  it('OverPlannedBanner: Enter on the banner opens it; Enter on × does not', () => {
    const onClick = vi.fn();
    render(<OverPlannedBanner amount={-10} monthName="November" onDismiss={vi.fn()} onClick={onClick} />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Dismiss reminder' }), { key: 'Enter' });
    expect(onClick).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByTestId('over-planned-banner'), { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('BankAttentionBanner: Enter on × does not open Bank Import', () => {
    const opened = vi.fn();
    window.addEventListener(OPEN_BANK_IMPORT_EVENT, opened);
    try {
      render(<BankAttentionBanner banks={[{ id: 1, institutionName: 'CIBC', status: 'needs_login' }]} onDismiss={vi.fn()} />);

      fireEvent.keyDown(screen.getByRole('button', { name: 'Dismiss reminder' }), { key: 'Enter' });
      expect(opened).not.toHaveBeenCalled();

      fireEvent.keyDown(screen.getByTestId('bank-attention-banner'), { key: ' ' });
      expect(opened).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(OPEN_BANK_IMPORT_EVENT, opened);
    }
  });
});
