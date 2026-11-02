import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PlaidSettings from './PlaidSettings';
import * as plaidApi from '../../services/plaidApi';

vi.mock('../../services/plaidApi', () => ({
  getPlaidSettings: vi.fn(),
  savePlaidSettings: vi.fn(),
  testPlaidSettings: vi.fn(),
  clearPlaidSettings: vi.fn(),
}));

const auth = { isPasswordRequired: false };
vi.mock('../../contexts/AuthContext', () => ({ useAuthContext: () => auth }));

const base = {
  source: 'none', editable: true, enabled: false, environment: null, clientIdHint: null, secretHint: null,
  problems: [], keySource: 'none', connectedBanks: { sandbox: 0, production: 0 }
};
const saved = { ...base, source: 'settings', enabled: true, environment: 'sandbox', clientIdHint: '••••4567', secretHint: '••••2345', keySource: 'file' };

describe('PlaidSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.isPasswordRequired = false;
  });

  afterEach(() => vi.restoreAllMocks());

  it('guides first-time setup and saves the entered keys', async () => {
    plaidApi.getPlaidSettings.mockResolvedValue(base);
    plaidApi.savePlaidSettings.mockResolvedValue(saved);

    render(<PlaidSettings />);
    expect(await screen.findByTestId('plaid-settings-status')).toHaveTextContent('Not set up.');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Client ID'), { target: { value: 'client-id-123' } });
    fireEvent.change(screen.getByLabelText(/Secret/), { target: { value: 'secret-456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(plaidApi.savePlaidSettings).toHaveBeenCalledWith({ clientId: 'client-id-123', secret: 'secret-456', environment: 'sandbox' }));
    expect(await screen.findByTestId('plaid-settings-status')).toHaveTextContent('Connected to Plaid Sandbox');
    // Inputs are cleared after saving; only masked hints remain
    expect(screen.getByLabelText(/Secret/)).toHaveValue('');
    expect(screen.getByLabelText(/Secret/)).toHaveAttribute('placeholder', expect.stringContaining('••••2345'));
  });

  it('tests keys without saving and shows Plaid\'s answer', async () => {
    plaidApi.getPlaidSettings.mockResolvedValue(saved);
    plaidApi.testPlaidSettings.mockResolvedValue({ ok: false, environment: 'sandbox', message: 'Plaid rejected these keys: invalid client_id or secret provided' });

    render(<PlaidSettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Test connection' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('invalid client_id or secret');
    expect(plaidApi.testPlaidSettings).toHaveBeenCalledWith({ clientId: '', secret: '', environment: 'sandbox' });
    expect(plaidApi.savePlaidSettings).not.toHaveBeenCalled();
  });

  it('asks for confirmation before switching to Production', async () => {
    plaidApi.getPlaidSettings.mockResolvedValue(saved);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<PlaidSettings />);
    fireEvent.click(await screen.findByRole('radio', { name: /Production/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Trial limit of 10'));
    expect(plaidApi.savePlaidSettings).not.toHaveBeenCalled();
  });

  it('shows server refusals such as connected banks blocking a switch', async () => {
    plaidApi.getPlaidSettings.mockResolvedValue({ ...saved, connectedBanks: { sandbox: 1, production: 0 } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    plaidApi.savePlaidSettings.mockRejectedValue(new Error('Disconnect your 1 Sandbox bank (Bank Import → Connections) before switching to Production.'));

    render(<PlaidSettings />);
    fireEvent.click(await screen.findByRole('radio', { name: /Production/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Disconnect your 1 Sandbox bank');
    expect(screen.getByRole('button', { name: 'Remove keys' })).toBeDisabled();
  });

  it('is read-only when configured by environment variables', async () => {
    plaidApi.getPlaidSettings.mockResolvedValue({ ...saved, source: 'env', editable: false });

    render(<PlaidSettings />);

    expect(await screen.findByText(/PLAID_\*/)).toBeInTheDocument();
    expect(screen.getByLabelText('Client ID')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Remove keys' })).not.toBeInTheDocument();
  });

  it('lists configuration problems', async () => {
    plaidApi.getPlaidSettings.mockResolvedValue({ ...saved, enabled: false, problems: ['The saved Plaid secret cannot be decrypted. Re-enter the secret.'] });

    render(<PlaidSettings />);

    expect(await screen.findByText(/Re-enter the secret/)).toBeInTheDocument();
    expect(screen.getByTestId('plaid-settings-status')).toHaveTextContent('Not working');
  });

  it('recommends a password once Production is enabled in open mode', async () => {
    plaidApi.getPlaidSettings.mockResolvedValue({ ...saved, environment: 'production' });

    const { unmount } = render(<PlaidSettings />);
    expect(await screen.findByText(/no password/)).toBeInTheDocument();
    unmount();

    auth.isPasswordRequired = true;
    render(<PlaidSettings />);
    await screen.findByTestId('plaid-settings-status');
    expect(screen.queryByText(/no password/)).not.toBeInTheDocument();
  });
});
