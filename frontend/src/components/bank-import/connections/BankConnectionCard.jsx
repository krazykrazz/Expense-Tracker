import { Fragment } from 'react';
import { formatDateTime } from '../../../utils/formatters';
import BankFileImport from '../BankFileImport';
import BankFreshness from './BankFreshness';
import { STATUS_LABELS, STATUS_HELP } from './connectionStatus';

/**
 * One connected bank on the Connections tab: its status and freshness, Reconnect / Log in again / Disconnect, and
 * each account with its payment method (and Import file for mapped accounts).
 * @param {{item: object, paymentMethods: Array, busy: boolean, linkOpen: boolean, mappingId: (number|null),
 *   importAccountId: (number|null), onImportAccount: Function, onReconnect: Function, onLoginAgain: Function,
 *   onDisconnect: Function, onMap: Function, onImported: Function}} props
 *   importAccountId: the account whose Import file panel is open (one at a time across banks)
 */
const BankConnectionCard = ({
  item, paymentMethods, busy, linkOpen, mappingId, importAccountId, onImportAccount,
  onReconnect, onLoginAgain, onDisconnect, onMap, onImported
}) => (
    <section className="bank-connection">
      <div className="bank-connection-header">
        <div>
          <strong>{item.institutionName}</strong>
          {STATUS_LABELS[item.status] && (
            <span className={`bank-connection-status ${item.status}`} data-testid="bank-connection-status">
              {STATUS_LABELS[item.status]}
            </span>
          )}
          <div className="bank-import-muted">
            {item.lastSyncedAt ? `Last synced ${formatDateTime(item.lastSyncedAt.replace(' ', 'T') + 'Z')}` : 'Never synced'}
            {item.lastError && <span className="bank-connection-error"> · Last error: {item.lastError}</span>}
          </div>
          <BankFreshness item={item} />
          {STATUS_HELP[item.status] && <div className="bank-import-muted">{STATUS_HELP[item.status]}</div>}
        </div>
        <div className="bank-connection-actions">
          {item.status === 'needs_login' && (
            <button className="bank-import-primary" onClick={() => onReconnect(item)} disabled={busy || linkOpen}>
              Reconnect
            </button>
          )}
          {item.status === 'stale' && (
            <button
              className="bank-import-primary"
              onClick={() => onLoginAgain(item)}
              disabled={busy || linkOpen}
              title="Ask Plaid to fetch new transactions now. If the bank needs a login for that (CIBC does), the login opens: same connection, no new Trial slot."
            >
              Log in again
            </button>
          )}
          <button className="bank-import-link-danger" onClick={() => onDisconnect(item)} disabled={busy}>
            Disconnect
          </button>
        </div>
      </div>
      <ul className="bank-account-list">
        {item.accounts.map(account => (
          <Fragment key={account.id}>
            <li className="bank-account">
              <span>
                {account.name}{account.mask ? ` ••${account.mask}` : ''}
                <span className="bank-import-muted"> {account.subtype || account.type}</span>
              </span>
              <span className="bank-account-controls">
                {account.paymentMethodId != null && importAccountId !== account.id && (
                  <button
                    type="button"
                    className="bank-import-link"
                    onClick={() => onImportAccount(account.id)}
                    disabled={busy}
                    title="Import a CSV downloaded from the bank's website, for when Plaid isn't getting new data"
                  >
                    Import file
                  </button>
                )}
                <select
                  className="bank-account-mapping"
                  value={account.paymentMethodId ?? ''}
                  onChange={(event) => onMap(account.id, event.target.value)}
                  disabled={mappingId === account.id}
                  aria-label={`Payment method for ${account.name}`}
                >
                  <option value="">Don&apos;t import</option>
                  {paymentMethods.map(method => (
                    <option key={method.id} value={method.id}>{method.display_name}</option>
                  ))}
                </select>
              </span>
            </li>
            {importAccountId === account.id && (
              <li className="bank-account-import">
                <BankFileImport
                  account={account}
                  onClose={() => onImportAccount(null)}
                  onImported={(text) => {
                    onImportAccount(null);
                    onImported(text);
                  }}
                />
              </li>
            )}
          </Fragment>
        ))}
      </ul>
    </section>
);

export default BankConnectionCard;
