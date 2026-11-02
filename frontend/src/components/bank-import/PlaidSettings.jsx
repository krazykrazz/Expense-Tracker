import { useState, useEffect, useCallback } from 'react';
import { getPlaidSettings, savePlaidSettings, testPlaidSettings, clearPlaidSettings } from '../../services/plaidApi';
import { useAuthContext } from '../../contexts/AuthContext';
import './BankImport.css';

const ENVIRONMENTS = [
  { value: 'sandbox', label: 'Sandbox', hint: 'Fake banks for testing (login user_good / pass_good). Free and unlimited.' },
  { value: 'production', label: 'Production', hint: 'Your real banks. On the free Trial plan, Plaid allows 10 bank logins in total, ever.' }
];

const statusText = (settings) => {
  if (settings.enabled) {
    return `Connected to Plaid ${settings.environment === 'production' ? 'Production' : 'Sandbox'}. The bank icon in the header opens Bank Import.`;
  }
  return settings.source === 'none' ? 'Not set up.' : 'Not working: see below.';
};

/**
 * Settings → Bank Import: enter Plaid keys, test them, and switch Sandbox/Production.
 * Read-only when the server is configured with PLAID_* environment variables.
 */
const PlaidSettings = () => {
  const { isPasswordRequired } = useAuthContext();
  const [settings, setSettings] = useState(null);
  const [fields, setFields] = useState({ clientId: '', secret: '', environment: 'sandbox' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const applySettings = useCallback((loaded) => {
    setSettings(loaded);
    setFields({ clientId: '', secret: '', environment: loaded.environment || 'sandbox' });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getPlaidSettings({ signal: controller.signal })
      .then(applySettings)
      .catch((err) => {
        if (err.name !== 'AbortError') setResult({ type: 'error', text: err.message });
      });
    return () => controller.abort();
  }, [applySettings]);

  const set = (name) => (event) => setFields(prev => ({ ...prev, [name]: event.target.value }));

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

  const handleTest = () => run(async () => {
    const outcome = await testPlaidSettings(fields);
    setResult({ type: outcome.ok ? 'success' : 'error', text: outcome.message });
  });

  const handleSave = () => run(async () => {
    const switchingToProduction = settings.environment !== 'production' && fields.environment === 'production';
    if (switchingToProduction && !window.confirm(
      'Switch to Production? Real bank connections count against the Plaid Trial limit of 10, and disconnecting does not give a slot back.'
    )) {
      return;
    }
    applySettings(await savePlaidSettings(fields));
    setResult({ type: 'success', text: 'Saved.' });
  });

  const handleRemove = () => run(async () => {
    if (!window.confirm('Remove the saved Plaid keys? Bank import will be turned off.')) return;
    applySettings(await clearPlaidSettings());
    setResult({ type: 'success', text: 'Plaid keys removed.' });
  });

  if (!settings) {
    return <div className="bank-import-empty">{result ? result.text : 'Loading bank import settings…'}</div>;
  }

  const { editable } = settings;
  const hasSaved = settings.source === 'settings';
  const banks = settings.connectedBanks.sandbox + settings.connectedBanks.production;
  const canSubmit = fields.clientId.trim() || fields.secret.trim() || hasSaved;

  return (
    <div className="plaid-settings">
      <div className="plaid-settings-section">
        <h3>Bank Import (Plaid)</h3>
        <p className="bank-import-muted">
          Pulls transactions from your bank so you can review and add them as expenses. It needs a free Plaid
          developer account: sign up at{' '}
          <a href="https://dashboard.plaid.com/signup" target="_blank" rel="noreferrer">dashboard.plaid.com</a>,
          apply for the Trial plan, then copy your keys from <em>Developers → Keys</em>.
        </p>

        <div className={`plaid-settings-status ${settings.enabled ? 'enabled' : ''}`} role="status" data-testid="plaid-settings-status">
          {statusText(settings)}
        </div>
        {settings.problems.length > 0 && (
          <ul className="bank-import-error plaid-settings-problems">
            {settings.problems.map(problem => <li key={problem}>{problem}</li>)}
          </ul>
        )}

        {!editable && (
          <div className="bank-import-message">
            These keys come from the server&apos;s <code>PLAID_*</code> environment variables, so they can&apos;t be changed here.
            Remove the variables and restart to manage them in this screen.
          </div>
        )}

        <fieldset className="plaid-settings-form" disabled={!editable || busy}>
          <div className="plaid-settings-environments" role="radiogroup" aria-label="Plaid environment">
            {ENVIRONMENTS.map(env => (
              <label key={env.value} className="plaid-settings-environment" htmlFor={`plaid-environment-${env.value}`}>
                <input
                  id={`plaid-environment-${env.value}`}
                  type="radio"
                  name="plaid-environment"
                  value={env.value}
                  checked={fields.environment === env.value}
                  onChange={set('environment')}
                />
                <strong>{env.label}</strong>
                <span className="bank-import-muted">{env.hint}</span>
              </label>
            ))}
          </div>

          <label className="plaid-settings-field">
            Client ID
            <input
              value={fields.clientId}
              onChange={set('clientId')}
              placeholder={settings.clientIdHint ? `Saved (${settings.clientIdHint}); leave blank to keep` : 'From Developers → Keys'}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className="plaid-settings-field">
            Secret ({fields.environment === 'production' ? 'Production' : 'Sandbox'})
            <input
              type="password"
              value={fields.secret}
              onChange={set('secret')}
              placeholder={settings.secretHint ? `Saved (${settings.secretHint}); leave blank to keep` : 'Each environment has its own secret'}
              autoComplete="new-password"
              spellCheck={false}
            />
          </label>

          <div className="plaid-settings-actions">
            <button type="button" className="bank-import-secondary" onClick={handleTest} disabled={!canSubmit}>Test connection</button>
            <button type="button" className="bank-import-primary" onClick={handleSave} disabled={!canSubmit}>Save</button>
            {hasSaved && (
              <button type="button" className="bank-import-link-danger" onClick={handleRemove} disabled={banks > 0} title={banks > 0 ? 'Disconnect your banks first' : undefined}>
                Remove keys
              </button>
            )}
          </div>
        </fieldset>

        {result && (
          <div className={result.type === 'error' ? 'bank-import-error' : 'bank-import-message'} role="alert">{result.text}</div>
        )}

        <p className="bank-import-muted plaid-settings-footnote">
          The secret and your bank logins are stored encrypted. The encryption key lives in <code>/config/secrets</code> and is
          not included in backups, so restoring a backup on another machine means re-entering the secret and reconnecting banks.
          {banks > 0 && ` ${banks} bank${banks === 1 ? ' is' : 's are'} connected; switching between Sandbox and Production requires disconnecting ${banks === 1 ? 'it' : 'them'} first.`}
        </p>
        {!isPasswordRequired && settings.environment === 'production' && settings.enabled && (
          <div className="bank-import-message">
            Tip: anyone on your network can open this app while it has no password. Set one under Settings → Security now that real banks can be connected.
          </div>
        )}
      </div>
    </div>
  );
};

export default PlaidSettings;
