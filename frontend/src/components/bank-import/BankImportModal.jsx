import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import BankConnections from './BankConnections';
import ImportInbox from './ImportInbox';
import './BankImport.css';

const TABS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'connections', label: 'Connections' }
];

/**
 * Bank Import modal: review synced bank transactions (Inbox) and manage Plaid connections.
 */
const BankImportModal = ({ status, onStatusChange, onExpensesChanged, onClose }) => {
  const [activeTab, setActiveTab] = useState('inbox');

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Portal to <body>: the trigger lives in the sticky header, whose stacking context would clip a fixed overlay
  return createPortal(
    <div className="bank-import-overlay" onClick={onClose}>
      <div
        className="bank-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bank-import-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bank-import-header">
          <h2 id="bank-import-title">
            Bank Import
            {status.environment === 'sandbox' && <span className="bank-import-env-badge">Sandbox</span>}
          </h2>
          <button className="bank-import-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="bank-import-tabs" role="tablist">
          {TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`bank-import-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="bank-import-body">
          {activeTab === 'inbox' ? (
            <ImportInbox
              onExpensesChanged={onExpensesChanged}
              onOpenConnections={() => setActiveTab('connections')}
            />
          ) : (
            <BankConnections status={status} onStatusChange={onStatusChange} />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default BankImportModal;
