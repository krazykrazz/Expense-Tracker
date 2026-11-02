import { useState, useEffect } from 'react';
import { getAutoSyncSettings, saveAutoSyncSettings } from '../../services/plaidApi';

const INTERVALS = [30, 60, 120];
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;
const START_HOURS = Array.from({ length: 24 }, (_, h) => h);
const END_HOURS = Array.from({ length: 24 }, (_, h) => h + 1);

/**
 * Connections tab: automatic sync schedule (business timezone). The app also syncs stale banks when it is
 * opened, whatever the schedule says.
 */
const AutoSyncSettings = () => {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    getAutoSyncSettings({ signal: controller.signal })
      .then(setSettings)
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, []);

  if (!settings) {
    return error ? <div className="bank-import-error" role="alert">{error}</div> : null;
  }

  const save = async (changes) => {
    const next = { ...settings, ...changes };
    if (next.startHour >= next.endHour) {
      setError('Start must be before end.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      setSettings(await saveAutoSyncSettings(next));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="auto-sync-settings" data-testid="auto-sync-settings">
      <label className="auto-sync-toggle">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) => save({ enabled: event.target.checked })}
          disabled={saving}
        />
        {' '}Automatic sync
      </label>
      {settings.enabled ? (
        <span className="auto-sync-schedule">
          every{' '}
          <select
            aria-label="Sync interval"
            value={settings.intervalMinutes}
            onChange={(event) => save({ intervalMinutes: Number(event.target.value) })}
            disabled={saving}
          >
            {INTERVALS.map(minutes => <option key={minutes} value={minutes}>{minutes} min</option>)}
          </select>
          {' '}from{' '}
          <select
            aria-label="Sync from"
            value={settings.startHour}
            onChange={(event) => save({ startHour: Number(event.target.value) })}
            disabled={saving}
          >
            {START_HOURS.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
          {' '}to{' '}
          <select
            aria-label="Sync until"
            value={settings.endHour}
            onChange={(event) => save({ endHour: Number(event.target.value) })}
            disabled={saving}
          >
            {END_HOURS.map(h => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
        </span>
      ) : (
        <span className="bank-import-muted">Off: banks sync when the app is opened, or with Sync now.</span>
      )}
      {error && <div className="bank-import-error" role="alert">{error}</div>}
    </div>
  );
};

export default AutoSyncSettings;
