import { useState, useEffect } from 'react';
import { useModalContext } from '../contexts/ModalContext';
import useTabState from '../hooks/useTabState';
import useActivityLog from '../hooks/useActivityLog';
import ActivityLogTable from './ActivityLogTable';
import PlaceNameStandardization from './PlaceNameStandardization';
import { API_ENDPOINTS } from '../config';
import { createLogger } from '../utils/logger';
import './SystemModal.css';

const logger = createLogger('SystemModal');

const SystemModal = () => {
  const { closeSystemModal } = useModalContext();
  const [activeTab, setActiveTab] = useTabState('system-modal-tab', 'misc');
  
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

  // Fetch version info on mount
  useEffect(() => {
    fetchVersionInfo();
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

  // ========== Render Functions ==========

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

        {/* Activity Log Section */}
        <div className="settings-section">
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
        </div>
      </>
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

        <div className="settings-section">
          <h3>Recent Updates</h3>
          <div className="changelog">
            <div className="changelog-entry">
              <div className="changelog-version">v5.10.0</div>
              <div className="changelog-date">February 10, 2026</div>
              <ul className="changelog-items">
                <li>Activity log feature with comprehensive event tracking</li>
              </ul>
            </div>
            <div className="changelog-entry">
              <div className="changelog-version">v5.9.0</div>
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
              <div className="changelog-version">v5.8.1</div>
              <div className="changelog-date">February 9, 2026</div>
              <ul className="changelog-items">
                <li>Credit card reminder badge consistency - Statement badges and due dates now shown in multiple payment view</li>
              </ul>
            </div>
            <div className="changelog-entry">
              <div className="changelog-version">v5.8.0</div>
              <div className="changelog-date">February 7, 2026</div>
              <ul className="changelog-items">
                <li>Mortgage payment date tracking in Current Status Insights panel</li>
                <li>Next payment date calculation with urgency indicators (due soon, due today, overdue)</li>
              </ul>
            </div>
            <div className="changelog-entry">
              <div className="changelog-version">v5.7.0</div>
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
        </div>

        <div className="modal-content">
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
        </div>
      </div>
    </div>
  );
};

export default SystemModal;
