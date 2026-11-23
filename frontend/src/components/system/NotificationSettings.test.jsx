import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NotificationSettings from './NotificationSettings';
import * as notificationApi from '../../services/notificationApi';

vi.mock('../../services/notificationApi', () => ({
  getNotificationSettings: vi.fn(),
  saveNotificationSettings: vi.fn(),
  testNotificationSettings: vi.fn(),
  clearNotificationSettings: vi.fn(),
}));

const events = [
  { key: 'plaid_needs_attention', label: 'Bank needs login or was removed', enabled: true },
  { key: 'plaid_sync_changes', label: 'A bank sync brought new activity', enabled: false },
  { key: 'backup_failed', label: 'Backup failed', enabled: true },
];
const blank = { enabled: false, configured: false, keyHint: null, keyError: null, channelId: '', pingUserId: '', events };
const saved = { ...blank, enabled: true, configured: true, keyHint: '••••a9f1', channelId: '1234567890123456789' };

describe('NotificationSettings', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('guides first-time setup and saves the entered key, channel, switch and events', async () => {
    notificationApi.getNotificationSettings.mockResolvedValue(blank);
    notificationApi.saveNotificationSettings.mockResolvedValue(saved);

    render(<NotificationSettings />);
    expect(await screen.findByTestId('notification-settings-status')).toHaveTextContent('Not set up.');
    expect(screen.getByRole('button', { name: 'Send test message' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Notifiarr API key'), { target: { value: ' my-api-key ' } });
    fireEvent.change(screen.getByLabelText('Discord channel ID'), { target: { value: '1234567890123456789' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Send notifications' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'A bank sync brought new activity' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Backup failed' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(notificationApi.saveNotificationSettings).toHaveBeenCalledWith({
      apiKey: 'my-api-key', channelId: '1234567890123456789', enabled: true, events: ['plaid_needs_attention', 'plaid_sync_changes']
    }));
    expect(await screen.findByTestId('notification-settings-status')).toHaveTextContent('Notifications are on.');
    // The key field is cleared after saving; only the masked hint remains
    expect(screen.getByLabelText('Notifiarr API key')).toHaveValue('');
    expect(screen.getByLabelText('Notifiarr API key')).toHaveAttribute('placeholder', expect.stringContaining('••••a9f1'));
  });

  it('shows the saved state without ever showing the key, and keeps it when the field is left blank', async () => {
    notificationApi.getNotificationSettings.mockResolvedValue(saved);
    notificationApi.saveNotificationSettings.mockResolvedValue(saved);

    render(<NotificationSettings />);
    expect(await screen.findByLabelText('Discord channel ID')).toHaveValue('1234567890123456789');
    expect(screen.getByRole('checkbox', { name: 'Send notifications' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Backup failed' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'A bank sync brought new activity' })).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(notificationApi.saveNotificationSettings).toHaveBeenCalledWith(expect.objectContaining({ apiKey: '' })));
  });

  it('sends a test message with what is typed, without saving, and shows the answer', async () => {
    notificationApi.getNotificationSettings.mockResolvedValue(saved);
    notificationApi.testNotificationSettings.mockResolvedValue({ ok: false, message: 'Notifiarr did not accept the message: HTTP 401: invalid api key' });

    render(<NotificationSettings />);
    fireEvent.change(await screen.findByLabelText('Notifiarr API key'), { target: { value: 'new-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send test message' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('invalid api key');
    expect(notificationApi.testNotificationSettings).toHaveBeenCalledWith({ apiKey: 'new-key', channelId: '1234567890123456789' });
    expect(notificationApi.saveNotificationSettings).not.toHaveBeenCalled();
  });

  it('shows server refusals, such as turning on without a key', async () => {
    notificationApi.getNotificationSettings.mockResolvedValue(blank);
    notificationApi.saveNotificationSettings.mockRejectedValue(new Error('Enter the Notifiarr API key and the Discord channel ID before turning notifications on'));

    render(<NotificationSettings />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Send notifications' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('before turning notifications on');
  });

  it('says so when the saved key cannot be decrypted', async () => {
    notificationApi.getNotificationSettings.mockResolvedValue({ ...blank, channelId: '1234567890123456789', keyError: 'The saved Notifiarr API key cannot be decrypted. Re-enter the API key.' });

    render(<NotificationSettings />);

    expect(await screen.findByTestId('notification-settings-status')).toHaveTextContent('Not working: see below.');
    expect(screen.getByRole('alert')).toHaveTextContent('Re-enter the API key');
  });

  it('removes the saved settings only after confirmation', async () => {
    notificationApi.getNotificationSettings.mockResolvedValue(saved);
    notificationApi.clearNotificationSettings.mockResolvedValue(blank);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);

    render(<NotificationSettings />);
    const remove = await screen.findByRole('button', { name: 'Remove' });
    fireEvent.click(remove);
    expect(notificationApi.clearNotificationSettings).not.toHaveBeenCalled();

    fireEvent.click(remove);

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(await screen.findByTestId('notification-settings-status')).toHaveTextContent('Not set up.');
    expect(screen.getByLabelText('Discord channel ID')).toHaveValue('');
  });

  it('shows why the settings could not be loaded', async () => {
    notificationApi.getNotificationSettings.mockRejectedValue(new Error('Failed to fetch notification settings'));

    render(<NotificationSettings />);

    expect(await screen.findByText('Failed to fetch notification settings')).toBeInTheDocument();
  });
});
