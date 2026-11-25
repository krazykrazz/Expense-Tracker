import { useState, useEffect, useCallback } from 'react';
import {
  getNotificationSettings, saveNotificationSettings, testNotificationSettings, clearNotificationSettings
} from '../../services/notificationApi';
import './NotificationSettings.css';

const statusText = (settings) => {
  if (settings.keyError) return 'Not working: see below.';
  if (!settings.configured) return 'Not set up.';
  return settings.enabled ? 'Notifications are on.' : 'Set up, but turned off.';
};

const fieldsFrom = (settings) => ({
  apiKey: '',
  channelId: settings.channelId || '',
  enabled: settings.enabled,
  events: settings.events.filter(event => event.enabled).map(event => event.key)
});

/**
 * Settings → Notifications: Discord messages (through Notifiarr's Passthrough integration) for bank problems and
 * backups. The API key is only ever shown as a masked hint.
 */
const NotificationSettings = () => {
  const [settings, setSettings] = useState(null);
  const [fields, setFields] = useState({ apiKey: '', channelId: '', enabled: false, events: [] });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const applySettings = useCallback((loaded) => {
    setSettings(loaded);
    setFields(fieldsFrom(loaded));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getNotificationSettings({ signal: controller.signal })
      .then(applySettings)
      .catch((err) => {
        if (err.name !== 'AbortError') setResult({ type: 'error', text: err.message });
      });
    return () => controller.abort();
  }, [applySettings]);

  const run = async (action) => {
    setBusy(true);
    setResult(null);
    try {
      await action();
    } catch (err) {
      setResult({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const toggleEvent = (key) => setFields(prev => ({
    ...prev,
    events: prev.events.includes(key) ? prev.events.filter(k => k !== key) : [...prev.events, key]
  }));

  const credentials = { apiKey: fields.apiKey.trim(), channelId: fields.channelId.trim() };

  const handleTest = () => run(async () => {
    const outcome = await testNotificationSettings(credentials);
    setResult({ type: outcome.ok ? 'success' : 'error', text: outcome.message });
  });

  const handleSave = () => run(async () => {
    applySettings(await saveNotificationSettings({ ...credentials, enabled: fields.enabled, events: fields.events }));
    setResult({ type: 'success', text: 'Saved.' });
  });

  const handleRemove = () => run(async () => {
    if (!window.confirm('Remove the saved Notifiarr API key and channel? Notifications will be turned off.')) return;
    applySettings(await clearNotificationSettings());
    setResult({ type: 'success', text: 'Notification settings removed.' });
  });

  if (!settings) {
    return <div className="notification-settings-empty">{result ? result.text : 'Loading notification settings…'}</div>;
  }

  const hasKey = Boolean(settings.keyHint) || credentials.apiKey !== '';
  const canTest = hasKey && credentials.channelId !== '';
  const hasSaved = Boolean(settings.keyHint) || Boolean(settings.channelId);

  return (
    <div className="notification-settings">
      <div className="notification-settings-section">
        <h3>Notifications (Discord)</h3>
        <p className="notification-settings-muted">
          Sends a Discord message when a bank needs attention (login, removed, not updating) and for backups. It goes
          through the Passthrough integration of{' '}
          <a href="https://notifiarr.wiki/pages/integrations/passthrough/" target="_blank" rel="noreferrer">Notifiarr</a>:
          use your Notifiarr API key and the ID of the Discord channel to post to (Discord → Developer Mode → right-click
          the channel → Copy Channel ID).
        </p>

        <div className={`notification-settings-status ${settings.configured && settings.enabled ? 'enabled' : ''}`} role="status" data-testid="notification-settings-status">
          {statusText(settings)}
        </div>
        {settings.keyError && <div className="notification-settings-error" role="alert">{settings.keyError}</div>}

        <fieldset className="notification-settings-form" disabled={busy}>
          <label className="notification-settings-field">
            Notifiarr API key
            <input
              type="password"
              value={fields.apiKey}
              onChange={(event) => setFields(prev => ({ ...prev, apiKey: event.target.value }))}
              placeholder={settings.keyHint ? `Saved (${settings.keyHint}); leave blank to keep` : 'notifiarr.com → Profile'}
              autoComplete="new-password"
              spellCheck={false}
            />
          </label>
          <label className="notification-settings-field">
            Discord channel ID
            <input
              value={fields.channelId}
              onChange={(event) => setFields(prev => ({ ...prev, channelId: event.target.value }))}
              placeholder="17 to 20 digits"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <label className="notification-settings-switch">
            <input
              type="checkbox"
              checked={fields.enabled}
              onChange={(event) => setFields(prev => ({ ...prev, enabled: event.target.checked }))}
            />
            <strong>Send notifications</strong>
          </label>

          <div className="notification-settings-events" role="group" aria-label="Notify me about">
            <span className="notification-settings-legend">Notify me about</span>
            {settings.events.map(event => (
              <label key={event.key} className="notification-settings-event">
                <input
                  type="checkbox"
                  checked={fields.events.includes(event.key)}
                  onChange={() => toggleEvent(event.key)}
                />
                <span>{event.label}</span>
              </label>
            ))}
          </div>

          <div className="notification-settings-actions">
            <button type="button" className="notification-settings-secondary" onClick={handleTest} disabled={!canTest}>
              Send test message
            </button>
            <button type="button" className="notification-settings-primary" onClick={handleSave}>Save</button>
            {hasSaved && (
              <button type="button" className="notification-settings-danger" onClick={handleRemove}>Remove</button>
            )}
          </div>
        </fieldset>

        {result && (
          <div className={result.type === 'error' ? 'notification-settings-error' : 'notification-settings-message'} role="alert">{result.text}</div>
        )}

        <p className="notification-settings-muted notification-settings-footnote">
          Messages pass through Notifiarr and Discord. They include bank and account names, error codes and balance
          changes, but never card or account numbers. A bank error is only announced once it has lasted an hour, and
          &quot;not updating&quot; once Plaid has had no data for 24 hours. The API key is stored encrypted with the same
          key as your bank logins (see Settings → Bank Import).
        </p>
      </div>
    </div>
  );
};

export default NotificationSettings;
