import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StuckBanks from './StuckBanks';

const reconnect = vi.fn();
const loginAgain = vi.fn();
vi.mock('../connections/usePlaidLinkFlow', () => ({ usePlaidLinkFlow: () => ({ reconnect, loginAgain }) }));
vi.mock('../../../services/plaidApi', () => ({ getPlaidStatus: vi.fn() }));

const bank = (overrides = {}) => ({ id: 1, institutionName: 'CIBC', bankUpdatedAt: null, ...overrides });

describe('StuckBanks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows nothing when every bank is current', () => {
    const { container } = render(<StuckBanks status={{ needsAttention: [], staleData: [] }} onReload={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers the fix for each stuck bank, listing a bank once', () => {
    const onOpenConnections = vi.fn();
    render(
      <StuckBanks
        status={{
          needsAttention: [bank({ id: 2, institutionName: 'Tangerine', status: 'needs_login' }), bank({ id: 3, institutionName: 'Old Bank', status: 'gone' })],
          staleData: [bank(), bank({ id: 2, institutionName: 'Tangerine' })]
        }}
        onReload={vi.fn()}
        onOpenConnections={onOpenConnections}
      />
    );

    expect(screen.getByTestId('inbox-stuck-banks')).toHaveTextContent('CIBC hasn\'t sent anything new for a while');
    expect(screen.getAllByText('Tangerine')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Log in again' }));
    expect(loginAgain).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(reconnect).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Connections' }));
    expect(onOpenConnections).toHaveBeenCalled();
  });
});
