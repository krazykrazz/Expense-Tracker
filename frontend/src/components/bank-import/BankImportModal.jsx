import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import useModalBehavior from '../../hooks/useModalBehavior';
import BankConnections from './BankConnections';
import ImportInbox from './ImportInbox';
import './BankImport.css';

const TABS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'connections', label: 'Connections' }
];

/**
 * Bank Import modal: review synced bank transactions (Inbox) and manage Plaid connections. Focus moves into it when it
 * opens, stays inside while it is open and returns to the trigger when it closes; Escape closes it (or only the
 * dialog open on top of it), as for every other modal (useModalBehavior).
 */
const BankImportModal = ({ status, initialTab = 'inbox', initialInboxView = null, onStatusChange, onExpensesChanged, onInboxChanged, onClose }) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const dialogRef = useRef(null);

  useModalBehavior({ isOpen: true, onClose, containerRef: dialogRef });

  // Portal to <body>: the trigger lives in the sticky header, whose stacking context would clip a fixed overlay
  return createPortal(
    <div className="bank-import-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="bank-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bank-import-title"
        tabIndex={-1}
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
              status={status}
              onStatusChange={onStatusChange}
              initialView={initialInboxView}
              onExpensesChanged={onExpensesChanged}
              onInboxChanged={onInboxChanged}
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
