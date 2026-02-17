import { useState, useEffect, useRef } from 'react';
import { useModalContext } from '../contexts/ModalContext';
import useTabState from '../hooks/useTabState';
import useActivityLog from '../hooks/useActivityLog';
import ActivityLogTable from './ActivityLogTable';
import PlaceNameStandardization from './PlaceNameStandardization';
import { API_ENDPOINTS } from '../config';
import { formatDateTime } from '../utils/formatters';
import { createLogger } from '../utils/logger';
import './SystemModal.css';

const logger = createLogger('SystemModal');

const SystemModal = () => {
  const { closeSystemModal } = useModalContext();
  const [activeTab, setActiveTab] = useTabState('system-modal-tab', 'backup-info');
  
  // Backup Information tab state
  const [backups, setBackups] = useState([]);
  const [backupMessage, setBackupMessage] = useState({ text: '', type: '' });
  const [backupLoading, setBackupLoading] = useState(false);
  
  // Track timeouts for cleanup on unmount
  const backupMessageTimerRef = useRef(null);
  
  // Misc tab state
  const [showPlaceNameStandardization, setShowPlaceNameStandardization] = useState(false);
  
  // Activity log state (via useActivityLog hook)
  const {
    events: activityEvents,
    loading: activityLoading,
    error: activityError,
    displayLimit,
    hasMore,
    stats: activityStats,
    setDisplayLimit,
    loadMore: handleLoadMore
  } = useActivityLog(50);
  
  // About tab state
  const [versionInfo, setVersionInfo] = useState(null);
  const [dbStats, setDbStats] = useState(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (backupMessageTimerRef.current) {
        clearTimeout(backupMessageTimerRef.current);
      }
    };
  }, []);

  // Fetch version info and backup list on mount
  useEffect(() => {
    fetchVersionInfo();
    fetchBackupList();
  }, []);

  // Fetch database stats when About tab is active
  useEffect(() => {
    if (activeTab === 'about') {
      fetchDbStats();
    }
  }, [activeTab]);

  // ========== Version Info Functions ==========
  
  const fetchVersionInfo = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.VERSION);
      if (response.ok) {
        const data = await response.json();
        setVersionInfo(data);
      }
    } catch (error) {
      logger.error('Error fetching version info:', error);
      // Silently fail - don't block UI
    }
  };

  // ========== Database Stats Functions ==========
  
  const fetchDbStats = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.BACKUP_STATS);
      if (response.ok) {
        const data = await response.json();
        setDbStats(data);
      }
    } catch (error) {
      logger.error('Error fetching database stats:', error);
      // Silently fail - don't block UI
    }
  };

  // ========== Backup Information Functions ==========

  const fetchBackupList = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.BACKUP_LIST);
      if (!response.ok) throw new Error('Failed to fetch backup list');
      
      const data = await response.json();
      setBackups(data);
    } catch (error) {
      logger.error('Error fetching backups:', error);
    }
  };

  const handleManualBackup = async () => {
    setBackupMessage({ text: 'Creating backup...', type: 'info' });
    setBackupLoading(true);
    
    try {
      const response = await fetch(API_ENDPOINTS.BACKUP_MANUAL, {
        method: 'POST'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create backup');
      }

      const data = await response.json();
      setBackupMessage({ text: `Backup created: ${data.filename}`, type: 'success' });
      fetchBackupList();
      
      if (backupMessageTimerRef.current) clearTimeout(backupMessageTimerRef.current);
      backupMessageTimerRef.current = setTimeout(() => setBackupMessage({ text: '', type: '' }), 5000);
    } catch (error) {
      setBackupMessage({ text: error.message, type: 'error' });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleDownloadBackup = () => {
    window.location.href = API_ENDPOINTS.BACKUP_DOWNLOAD;
  };

  const handleRestoreBackup = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!window.confirm('⚠️ WARNING: Restoring from backup will replace ALL current data. This cannot be undone. Are you sure?')) {
      event.target.value = '';
      return;
    }

    setBackupMessage({ text: 'Restoring from backup...', type: 'info' });

    const formData = new FormData();
    formData.append('backup', file);

    try {
      const response = await fetch(API_ENDPOINTS.BACKUP_RESTORE, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to restore backup');
      }

      setBackupMessage({ text: 'Backup restored successfully! Reloading...', type: 'success' });
      
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error) {
      logger.error('Restore error:', error);
      setBackupMessage({ text: error.message, type: 'error' });
    }

    // Reset file input
    event.target.value = '';
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  // ========== Render Functions ==========

  const renderBackupInfoTab = () => {
    return (
      <>
        <div className="settings-section">
          <h3>Manual Backup</h3>
          <p>Create a backup right now. Backups include all expenses, income sources, fixed expenses, loans, budgets, investments, invoice files, and configuration data.</p>
          <div className="manual-backup-buttons">
            <button 
              onClick={handleManualBackup} 
              className="backup-button"
              disabled={backupLoading}
            >
              💾 Create Backup Now
            </button>
            <button onClick={handleDownloadBackup} className="download-button">
              📥 Download Backup
            </button>
          </div>
          <small className="backup-hint">Download creates a .tar.gz archive with all data including invoice PDFs.</small>
        </div>

        {backups.length > 0 && (
          <div className="settings-section">
            <h3>Recent Backups</h3>
            <div className="backup-list">
              {backups.map((backup, index) => (
                <div key={index} className="backup-item">
                  <div className="backup-info">
                    <div className="backup-name">{backup.name}</div>
                    <div className="backup-details">
                      {formatFileSize(backup.size)} • {formatDateTime(backup.created)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="settings-section">
          <h3>Restore from Backup</h3>
          <p className="warning-text">⚠️ WARNING: This will replace ALL current data. This action cannot be undone!</p>
          <p className="restore-info">
            Accepts <strong>.tar.gz</strong> archives (recommended - includes invoices) or legacy <strong>.db</strong> files (database only).
          </p>
          <label className="file-upload-button restore-button">
            🔄 Choose Backup File
            <input 
              type="file" 
              accept=".tar.gz,.tgz,.db"
              onChange={handleRestoreBackup}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        {backupMessage.text && (
          <div className={`message ${backupMessage.type}`}>
            {backupMessage.text}
          </div>
        )}
      </>
    );
  };

  const renderMiscTab = () => {
    if (showPlaceNameStandardization) {
      return (
        <PlaceNameStandardization 
          onClose={() => setShowPlaceNameStandardization(false)}
        />
      );
    }

    return (
      <>
        <div className="settings-section">
          <h3>Data Management Tools</h3>
          <p>Miscellaneous tools for managing and cleaning up your expense data.</p>
          
          <div className="misc-tools-list">
            <div className="misc-tool-item">
              <div className="misc-tool-info">
                <h4>🏷️ Standardize Place Names</h4>
                <p>Find and fix inconsistent place names in your expenses (e.g., "Walmart", "walmart", "Wal-Mart")</p>
              </div>
              <button 
                className="misc-tool-button"
                onClick={() => setShowPlaceNameStandardization(true)}
              >
                Open Tool
              </button>
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderActivityLogTab = () => {
    return (
      <ActivityLogTable
        events={activityEvents}
        loading={activityLoading}
        error={activityError}
        displayLimit={displayLimit}
        hasMore={hasMore}
        stats={activityStats}
        onDisplayLimitChange={setDisplayLimit}
        onLoadMore={handleLoadMore}
      />
    );
  };

  const renderAboutTab = () => {
    return (
      <>
        <div className="settings-section">
          <h3>Version Information</h3>
          {versionInfo && (
            <div className="version-info">
              <div className="version-item">
                <strong>Version:</strong> {versionInfo.version}
              </div>
              <div className="version-item">
                <strong>Environment:</strong> {versionInfo.environment}
              </div>
              {versionInfo.docker && (
                <>
                  <div className="version-item">
                    <strong>Docker Tag:</strong> {versionInfo.docker.tag}
                  </div>
                  <div className="version-item">
                    <strong>Build Date:</strong> {new Date(versionInfo.docker.buildDate).toLocaleString()}
                  </div>
                  <div className="version-item">
                    <strong>Git Commit:</strong> {versionInfo.docker.commit}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {dbStats && (
          <div className="settings-section">
            <h3>Database Statistics</h3>
            <div className="db-stats">
              <div className="db-stat-item">
                <strong>Total Expenses:</strong> {dbStats.expenseCount.toLocaleString()}
              </div>
              <div className="db-stat-item">
                <strong>Total Invoices:</strong> {dbStats.invoiceCount.toLocaleString()}
              </div>
              <div className="db-stat-item">
                <strong>Payment Methods:</strong> {(dbStats.paymentMethodCount || 0).toLocaleString()}
              </div>
              <div className="db-stat-item">
                <strong>Credit Card Statements:</strong> {(dbStats.statementCount || 0).toLocaleString()}
              </div>
              <div className="db-stat-item">
                <strong>Credit Card Payments:</strong> {(dbStats.creditCardPaymentCount || 0).toLocaleString()}
              </div>
              <div className="db-stat-item">
                <strong>Database Size:</strong> {dbStats.databaseSizeMB} MB
              </div>
              <div className="db-stat-item">
                <strong>Invoice Storage:</strong> {dbStats.invoiceStorageSizeMB} MB
              </div>
              <div className="db-stat-item">
                <strong>Backup Storage:</strong> {dbStats.totalBackupSizeMB} MB ({dbStats.backupCount} backups)
              </div>
            </div>
          </div>
        )}

      </>
    );
  };

  // ========== Updates Tab ==========

  const isCurrentVersion = (entryVersion) => {
    if (!versionInfo?.version || !entryVersion) return false;
    const normalized = entryVersion.replace(/^v/, '');
    return normalized === versionInfo.version;
  };

  const renderUpdatesTab = () => {
    return (
      <>
        <div className="settings-section">
          <h3>Recent Updates</h3>
          <div className="changelog">
            <div className="changelog-entry">
              <div className="changelog-version">
                v5.13.3
                {isCurrentVersion('v5.13.3') && <span className="current-version-badge">Current Version</span>}
              </div>
              <div className="changelog-date">February 17, 2026</div>
              <ul className="changelog-items">
                <li>Budget alert notification box fix</li>
              </ul>
            </div>
            <div className="changelog-entry">
              <div className="changelog-version">
                v5.13.2
                {isCurrentVersion('v5.13.2') && <span className="current-version-badge">Current Version</span>}
              </div>
              <div className="changelog-date">February 17, 2026</div>
              <ul className="changelog-items">
                <li>Bug fixes: backup download naming, budget alerts visibility, monthly category filter, activity log metadata, investment edit</li>
              </ul>
            </div>
            <div className="changelog-entry">
              <div className="changelog-version">
                v5.13.1
                {isCurrentVersion('v5.13.1') && <span className="current-version-badge">Current Version</span>}
              </div>
              <div className="changelog-date">February 16, 2026</div>
              <ul className="changelog-items">
                <li>Test suite rationalization: PBT consolidation, CI guardrails, test naming enforcement, performance optimizations</li>
              </ul>
            </div>
            <div className="changelog-entry">
              <div className="changelog-version">
                v5.13.0
                {isCurrentVersion('v5.13.0') && <span className="current-version-badge">Current Version</span>}
              </div>
              <div className="changelog-date">February 15, 2026</div>
              <ul className="changelog-items">
                <li>Activity log coverage expansion, PBT test race condition fixes</li>
              </ul>
            </div>
            <div className="changelog-entry">
              <div className="changelog-version">
                v5.12.1
                {isCurrentVersion('v5.12.1') && <span className="current-version-badge">Current Version</span>}
              </div>
              <div className="changelog-date">February 15, 2026</div>
              <ul className="changelog-items">
                <li>Fix billing cycle PDF upload on update, fix deploy script CI polling</li>
              </ul>
            </div>
            <div className="changelog-entry">
              <div className="changelog-version">
                v5.12.0
                {isCurrentVersion('v5.12.0') && <span className="current-version-badge">Current Version</span>}
              </div>
              <div className="changelog-date">February 15, 2026</div>
              <ul className="changelog-items">
                <li>Billing cycle payment deduction</li>
              </ul>
            </div>
            <div className="changelog-entry">
              <div className="changelog-version">
                v5.11.3
                {isCurrentVersion('v5.11.3') && <span className="current-version-badge">Current Version</span>}
              </div>
              <div className="changelog-date">February 14, 2026</div>
              <ul className="changelog-items">
                <li>Fix CHECK constraint migration order, remove category CHECK constraints, fix invoice storage startup error</li>
              </ul>
            </div>
            <div className="changelog-entry">
              <div className="changelog-version">
                v5.11.2
                {isCurrentVersion('v5.11.2') && <span className="current-version-badge">Current Version</span>}
              </div>
              <div className="changelog-date">February 13, 2026</div>
              <ul className="changelog-items">
                <li>Fix billing cycle balance display</li>
              </ul>
            </div>
            <div className="changelog-entry">
              <div className="changelog-version">
                v5.11.1
                {isCurrentVersion('v5.11.1') && <span className="current-version-badge">Current Version</span>}
              </div>
              <div className="changelog-date">February 13, 2026</div>
              <ul className="changelog-items">
                <li>Fix billing cycle notification showing pre-existing cycles</li>
              </ul>
            </div>
            <div className="changelog-entry">
              <div className="changelog-version">
                v5.11.0
                {isCurrentVersion('v5.11.0') && <span className="current-version-badge">Current Version</span>}
              </div>
              <div className="changelog-date">February 12, 2026</div>
              <ul className="changelog-items">
                <li>Billing cycle automation, unified cycle list, statement badge fixes</li>
              </ul>
            </div>
            <div className="changelog-entry">
              <div className="changelog-version">
                v5.10.1
                {isCurrentVersion('v5.10.1') && <span className="current-version-badge">Current Version</span>}
              </div>
              <div className="changelog-date">February 11, 2026</div>
              <ul className="changelog-items">
                <li>PBT test fix and deployment docs update</li>
              </ul>
            </div>
            <div className="changelog-entry">
              <div className="changelog-version">
                v5.10.0
                {isCurrentVersion('v5.10.0') && <span className="current-version-badge">Current Version</span>}
              </div>
              <div className="changelog-date">February 10, 2026</div>
              <ul className="changelog-items">
                <li>Activity log feature with comprehensive event tracking</li>
              </ul>
            </div>
            <div className="changelog-entry">
              <div className="changelog-version">
                v5.9.0
                {isCurrentVersion('v5.9.0') && <span className="current-version-badge">Current Version</span>}
              </div>
              <div className="changelog-date">February 10, 2026</div>
              <ul className="changelog-items">
                <li>Activity Log feature with comprehensive event tracking</li>
                <li>Recent Activity view in Settings → Misc tab</li>
                <li>Configurable display limits (25, 50, 100, 200 events)</li>
                <li>Automatic cleanup with 90-day retention policy</li>
                <li>Tracks all data modifications across the application</li>
              </ul>
            </div>
            <div className="changelog-entry">
              <div className="changelog-version">
                v5.8.1
                {isCurrentVersion('v5.8.1') && <span className="current-version-badge">Current Version</span>}
              </div>
              <div className="changelog-date">February 9, 2026</div>
              <ul className="changelog-items">
                <li>Credit card reminder badge consistency - Statement badges and due dates now shown in multiple payment view</li>
              </ul>
            </div>
            <div className="changelog-entry">
              <div className="changelog-version">
                v5.8.0
                {isCurrentVersion('v5.8.0') && <span className="current-version-badge">Current Version</span>}
              </div>
              <div className="changelog-date">February 7, 2026</div>
              <ul className="changelog-items">
                <li>Mortgage payment date tracking in Current Status Insights panel</li>
                <li>Next payment date calculation with urgency indicators (due soon, due today, overdue)</li>
              </ul>
            </div>
            <div className="changelog-entry">
              <div className="changelog-version">
                v5.7.0
                {isCurrentVersion('v5.7.0') && <span className="current-version-badge">Current Version</span>}
              </div>
              <div className="changelog-date">February 6, 2026</div>
              <ul className="changelog-items">
                <li>Unified billing cycle list with transaction counts and trend indicators</li>
                <li>Automatic billing cycle generation for credit cards</li>
                <li>Enhanced billing cycle history with effective balance tracking</li>
              </ul>
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="modal-overlay" onClick={closeSystemModal}>
      <div className="system-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>System Information</h2>
          <button className="close-button" onClick={closeSystemModal}>×</button>
        </div>

        <div className="settings-tabs">
          <button 
            className={`tab-button ${activeTab === 'backup-info' ? 'active' : ''}`}
            onClick={() => setActiveTab('backup-info')}
          >
            Backup Information
          </button>
          <button 
            className={`tab-button ${activeTab === 'activity-log' ? 'active' : ''}`}
            onClick={() => setActiveTab('activity-log')}
          >
            Activity Log
          </button>
          <button 
            className={`tab-button ${activeTab === 'misc' ? 'active' : ''}`}
            onClick={() => setActiveTab('misc')}
          >
            Misc
          </button>
          <button 
            className={`tab-button ${activeTab === 'about' ? 'active' : ''}`}
            onClick={() => setActiveTab('about')}
          >
            About
          </button>
          <button 
            className={`tab-button ${activeTab === 'updates' ? 'active' : ''}`}
            onClick={() => setActiveTab('updates')}
          >
            Updates
          </button>
        </div>

        <div className="modal-content">
          {activeTab === 'backup-info' && (
            <div className="tab-panel">
              {renderBackupInfoTab()}
            </div>
          )}

          {activeTab === 'activity-log' && (
            <div className="tab-panel activity-log-tab">
              {renderActivityLogTab()}
            </div>
          )}

          {activeTab === 'misc' && (
            <div className="tab-panel">
              {renderMiscTab()}
            </div>
          )}

          {activeTab === 'about' && (
            <div className="tab-panel">
              {renderAboutTab()}
            </div>
          )}

          {activeTab === 'updates' && (
            <div className="tab-panel">
              {renderUpdatesTab()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemModal;
