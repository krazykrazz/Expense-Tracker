import { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../config';
import './BackupSettings.css';
import { formatDateTime } from '../utils/formatters';
import PlaceNameStandardization from './PlaceNameStandardization';

const BackupSettings = () => {
  const [activeTab, setActiveTab] = useState('backups');
  const [config, setConfig] = useState({
    enabled: false,
    schedule: 'daily',
    time: '02:00',
    targetPath: '',
    keepLastN: 7
  });
  
  const [backups, setBackups] = useState([]);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(true);
  const [nextBackup, setNextBackup] = useState(null);
  const [versionInfo, setVersionInfo] = useState(null);
  const [showPlaceNameStandardization, setShowPlaceNameStandardization] = useState(false);

  useEffect(() => {
    fetchConfig();
    fetchBackupList();
    fetchVersionInfo();
  }, []);

  const fetchVersionInfo = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.VERSION);
      if (response.ok) {
        const data = await response.json();
        setVersionInfo(data);
      }
    } catch (error) {
      console.error('Error fetching version info:', error);
    }
  };

  const fetchConfig = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.BACKUP_CONFIG);
      if (!response.ok) throw new Error('Failed to fetch backup config');
      
      const data = await response.json();
      setConfig({
        enabled: data.enabled,
        schedule: data.schedule,
        time: data.time,
        targetPath: data.targetPath || '',
        keepLastN: data.keepLastN
      });
      setNextBackup(data.nextBackup);
    } catch (error) {
      console.error('Error fetching config:', error);
      setMessage({ text: 'Failed to load backup settings', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const fetchBackupList = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.BACKUP_LIST);
      if (!response.ok) throw new Error('Failed to fetch backup list');
      
      const data = await response.json();
      setBackups(data);
    } catch (error) {
      console.error('Error fetching backups:', error);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setConfig(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSave = async () => {
    setMessage({ text: '', type: '' });
    
    try {
      const response = await fetch(API_ENDPOINTS.BACKUP_CONFIG, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save settings');
      }

      const data = await response.json();
      setNextBackup(data.nextBackup);
      setMessage({ text: 'Backup settings saved successfully!', type: 'success' });
      
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    } catch (error) {
      setMessage({ text: error.message, type: 'error' });
    }
  };

  const handleManualBackup = async () => {
    setMessage({ text: 'Creating backup...', type: 'info' });
    
    try {
      const response = await fetch(API_ENDPOINTS.BACKUP_MANUAL, {
        method: 'POST'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create backup');
      }

      const data = await response.json();
      setMessage({ text: `Backup created: ${data.filename}`, type: 'success' });
      fetchBackupList();
      fetchConfig();
      
      setTimeout(() => setMessage({ text: '', type: '' }), 5000);
    } catch (error) {
      setMessage({ text: error.message, type: 'error' });
    }
  };

  const handleDownloadBackup = () => {
    window.location.href = `${API_ENDPOINTS.EXPENSES.replace('/expenses', '/backup')}`;
  };

  const handleImportCSV = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setMessage({ text: 'Importing expenses...', type: 'info' });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(API_ENDPOINTS.IMPORT, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to import expenses');
      }

      const result = await response.json();
      
      let messageText = `Import completed! ${result.successCount} expenses imported successfully.`;
      if (result.errorCount > 0) {
        messageText += ` ${result.errorCount} errors occurred.`;
      }
      
      setMessage({ text: messageText, type: 'success' });
      
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error) {
      console.error('Import error:', error);
      setMessage({ text: 'Failed to import expenses. Please check your CSV format.', type: 'error' });
    }

    // Reset file input
    event.target.value = '';
  };

  const handleRestoreBackup = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!window.confirm('⚠️ WARNING: Restoring from backup will replace ALL current data. This cannot be undone. Are you sure?')) {
      event.target.value = '';
      return;
    }

    setMessage({ text: 'Restoring from backup...', type: 'info' });

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

      setMessage({ text: 'Backup restored successfully! Reloading...', type: 'success' });
      
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (error) {
      console.error('Restore error:', error);
      setMessage({ text: error.message, type: 'error' });
    }

    // Reset file input
    event.target.value = '';
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDate = formatDateTime;

  if (loading) {
    return <div className="backup-settings-loading">Loading settings...</div>;
  }

  return (
    <div className="backup-settings">
      <h2>⚙️ Settings</h2>
      
      <div className="settings-tabs">
        <button 
          className={`tab-button ${activeTab === 'backups' ? 'active' : ''}`}
          onClick={() => setActiveTab('backups')}
        >
          💾 Backups
        </button>
        <button 
          className={`tab-button ${activeTab === 'import' ? 'active' : ''}`}
          onClick={() => setActiveTab('import')}
        >
          📥 Import & Restore
        </button>
        <button 
          className={`tab-button ${activeTab === 'misc' ? 'active' : ''}`}
          onClick={() => setActiveTab('misc')}
        >
          🔧 Misc
        </button>
        <button 
          className={`tab-button ${activeTab === 'about' ? 'active' : ''}`}
          onClick={() => setActiveTab('about')}
        >
          ℹ️ About
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'backups' && (
          <div className="tab-panel">
            <div className="settings-section">
        <h3>Automatic Backups</h3>
        
        <div className="form-group checkbox-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="enabled"
              checked={config.enabled}
              onChange={handleChange}
            />
            <span>Enable automatic backups</span>
          </label>
        </div>

        {config.enabled && (
          <>
            <div className="form-group">
              <label htmlFor="time">Backup Time</label>
              <input
                type="time"
                id="time"
                name="time"
                value={config.time}
                onChange={handleChange}
              />
              <small className="field-hint">Daily backup time (24-hour format)</small>
            </div>

            <div className="form-group">
              <label htmlFor="targetPath">Backup Location</label>
              <input
                type="text"
                id="targetPath"
                name="targetPath"
                value={config.targetPath}
                onChange={handleChange}
                placeholder="e.g., C:\Backups\ExpenseTracker (leave empty for default)"
              />
              <small className="field-hint">
                <strong>Must be a full absolute path</strong> (e.g., C:\Backups\ExpenseTracker or D:\MyBackups). Leave empty to use default location.
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="keepLastN">Keep Last N Backups</label>
              <input
                type="number"
                id="keepLastN"
                name="keepLastN"
                value={config.keepLastN}
                onChange={handleChange}
                min="1"
                max="365"
              />
              <small className="field-hint">Older backups will be automatically deleted</small>
            </div>

            {nextBackup && (
              <div className="next-backup-info">
                <strong>Next scheduled backup:</strong> {formatDate(nextBackup)}
              </div>
            )}
          </>
        )}

        <div className="form-actions">
          <button onClick={handleSave} className="save-button">
            Save Settings
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3>Manual Backup</h3>
        <p>Create a backup right now</p>
        <div className="manual-backup-buttons">
          <button onClick={handleManualBackup} className="backup-button">
            💾 Create Backup Now
          </button>
          <button onClick={handleDownloadBackup} className="download-button">
            📥 Download Backup
          </button>
        </div>
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
                          {formatFileSize(backup.size)} • {formatDate(backup.created)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      {activeTab === 'import' && (
        <div className="tab-panel">
          <div className="settings-section">
            <h3>Import from CSV</h3>
            <p>Import expenses from a CSV file. The file should have columns for date, place, amount, type, method, and notes.</p>
            <label className="file-upload-button">
              📄 Choose CSV File
              <input 
                type="file" 
                accept=".csv"
                onChange={handleImportCSV}
                style={{ display: 'none' }}
              />
            </label>
          </div>

          <div className="settings-section">
            <h3>Restore from Backup</h3>
            <p className="warning-text">⚠️ WARNING: This will replace ALL current data. This action cannot be undone!</p>
            <label className="file-upload-button restore-button">
              🔄 Choose Backup File (.db)
              <input 
                type="file" 
                accept=".db"
                onChange={handleRestoreBackup}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>
      )}

      {activeTab === 'misc' && (
        <div className="tab-panel">
          {!showPlaceNameStandardization ? (
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
          ) : (
            <PlaceNameStandardization 
              onClose={() => setShowPlaceNameStandardization(false)}
            />
          )}
        </div>
      )}

      {activeTab === 'about' && (
        <div className="tab-panel">
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

          <div className="settings-section">
            <h3>Recent Updates</h3>
            <div className="changelog">
              <div className="changelog-entry">
                <div className="changelog-version">v4.3.2</div>
                <div className="changelog-date">November 29, 2025</div>
                <ul className="changelog-items">
                  <li>Fixed ExpenseList filters incorrectly triggering global view mode</li>
                  <li>Monthly expense filters now work correctly without switching views</li>
                  <li>Fixed application crash when payment method data is undefined</li>
                  <li>Improved stability and error handling in SummaryPanel</li>
                </ul>
              </div>
              <div className="changelog-entry">
                <div className="changelog-version">v4.3.1</div>
                <div className="changelog-date">November 29, 2025</div>
                <ul className="changelog-items">
                  <li>Improved filter layout alignment and spacing</li>
                  <li>Filters now properly align with monthly summary panel</li>
                  <li>Reduced gap between filter dropdowns for cleaner appearance</li>
                </ul>
              </div>
              <div className="changelog-entry">
                <div className="changelog-version">v4.3.0</div>
                <div className="changelog-date">November 29, 2025</div>
                <ul className="changelog-items">
                  <li>Added global expense filtering across all time periods</li>
                  <li>Filter by category and payment method from any view</li>
                  <li>Combined text search with category and payment filters</li>
                  <li>Automatic switch to global view when filters are active</li>
                  <li>Clear all filters button for easy reset</li>
                </ul>
              </div>
              <div className="changelog-entry">
                <div className="changelog-version">v4.2.3</div>
                <div className="changelog-date">November 27, 2025</div>
                <ul className="changelog-items">
                  <li>Fixed category field flashing when selecting place from autocomplete dropdown</li>
                  <li>Prevented blur handler from overwriting category selection</li>
                  <li>Improved race condition handling between dropdown selection and blur events</li>
                </ul>
              </div>
              <div className="changelog-entry">
                <div className="changelog-version">v4.2.2</div>
                <div className="changelog-date">November 27, 2025</div>
                <ul className="changelog-items">
                  <li>Fixed category field flashing issue when adding expenses</li>
                  <li>Improved form submission handling to prevent race conditions</li>
                </ul>
              </div>
              <div className="changelog-entry">
                <div className="changelog-version">v4.2.1</div>
                <div className="changelog-date">November 27, 2025</div>
                <ul className="changelog-items">
                  <li>Centralized API endpoint configuration for better maintainability</li>
                  <li>Eliminated code duplication in SummaryPanel component</li>
                  <li>Improved code quality and consistency across frontend</li>
                </ul>
              </div>
              <div className="changelog-entry">
                <div className="changelog-version">v4.2.0</div>
                <div className="changelog-date">November 25, 2025</div>
                <ul className="changelog-items">
                  <li>Enhanced Fixed Expenses: Added category and payment type tracking</li>
                  <li>Categorize fixed expenses (Housing, Utilities, Subscriptions, Insurance, etc.)</li>
                  <li>Track payment methods (Credit Card, Debit Card, Cash, Cheque, E-Transfer)</li>
                  <li>Automatic database migration with backward compatibility</li>
                  <li>Improved UI with dropdown selectors for better organization</li>
                </ul>
              </div>
              <div className="changelog-entry">
                <div className="changelog-version">v4.1.0</div>
                <div className="changelog-date">November 24, 2025</div>
                <ul className="changelog-items">
                  <li>Added "Personal Care" expense category for haircuts, cosmetics, toiletries, and spa services</li>
                  <li>Personal Care category is budgetable and appears in all summaries and reports</li>
                  <li>Automatic database migration updates constraints on startup</li>
                  <li>CSV import/export fully supports Personal Care expenses</li>
                </ul>
              </div>
              <div className="changelog-entry">
                <div className="changelog-version">v4.0.3</div>
                <div className="changelog-date">November 24, 2025</div>
                <ul className="changelog-items">
                  <li>Fixed database migration for "Gifts" category support</li>
                  <li>Automatic migration runs on container startup</li>
                  <li>Added comprehensive migration documentation and test scripts</li>
                </ul>
              </div>
              <div className="changelog-entry">
                <div className="changelog-version">v4.0.2</div>
                <div className="changelog-date">November 24, 2025</div>
                <ul className="changelog-items">
                  <li>Project cleanup: Archived 45 historical files for better organization</li>
                  <li>Removed empty folders and organized documentation</li>
                </ul>
              </div>
              <div className="changelog-entry">
                <div className="changelog-version">v4.0.1</div>
                <div className="changelog-date">November 24, 2025</div>
                <ul className="changelog-items">
                  <li>Fixed bar graph white space issues in annual summary charts</li>
                  <li>Improved chart layout with consistent horizontal bars</li>
                  <li>Database cleanup: standardized 58 expense categories by place name</li>
                </ul>
              </div>

              <div className="changelog-entry">
                <div className="changelog-version">v4.0.0</div>
                <div className="changelog-date">November 24, 2025</div>
                <ul className="changelog-items">
                  <li>Removed recurring expenses feature (use Fixed Expenses instead)</li>
                  <li>All previously generated expenses converted to regular expenses</li>
                  <li>Simplified expense management workflow</li>
                </ul>
              </div>

              <div className="changelog-entry">
                <div className="changelog-version">v3.8.1</div>
                <div className="changelog-date">November 24, 2025</div>
                <ul className="changelog-items">
                  <li>Updated documentation to reflect 14 expense categories</li>
                  <li>Improved product overview with comprehensive category listing</li>
                </ul>
              </div>

              <div className="changelog-entry">
                <div className="changelog-version">v3.8.0</div>
                <div className="changelog-date">November 23, 2025</div>
                <ul className="changelog-items">
                  <li>Place Name Standardization: Find and fix inconsistent place names in expenses</li>
                  <li>Fuzzy matching algorithm identifies similar place name variations</li>
                  <li>Bulk update tool with preview before applying changes</li>
                  <li>Transaction-safe updates ensure data integrity</li>
                  <li>Performance optimized for large datasets (10,000+ records)</li>
                </ul>
              </div>

              <div className="changelog-entry">
                <div className="changelog-version">v3.7.0</div>
                <div className="changelog-date">November 22, 2025</div>
                <ul className="changelog-items">
                  <li>Budget Tracking & Alerts: Set monthly budget limits with real-time progress tracking</li>
                  <li>Color-coded budget status indicators (green/yellow/orange/red)</li>
                  <li>Automatic budget carry-forward from previous month</li>
                  <li>Historical budget analysis (3, 6, or 12 months)</li>
                  <li>Budget vs actual spending comparisons with success rates</li>
                </ul>
              </div>

              <div className="changelog-entry">
                <div className="changelog-version">v3.6.1</div>
                <div className="changelog-date">November 19, 2025</div>
                <ul className="changelog-items">
                  <li>Fixed critical bug: application crash when viewing years without data</li>
                  <li>Code optimization: eliminated ~200 lines of duplicate CSS</li>
                  <li>Performance improvements: added memoization for chart calculations</li>
                  <li>Created shared chart styling system for consistency</li>
                </ul>
              </div>

              <div className="changelog-entry">
                <div className="changelog-version">v3.6.0</div>
                <div className="changelog-date">November 19, 2025</div>
                <ul className="changelog-items">
                  <li>Enhanced annual summary with income and net income tracking</li>
                  <li>Fixed vs variable expense breakdown in summary cards</li>
                  <li>Horizontal stacked bar chart for monthly expense visualization</li>
                  <li>Property-based testing for financial calculations</li>
                </ul>
              </div>

              <div className="changelog-entry">
                <div className="changelog-version">v3.5.0</div>
                <div className="changelog-date">November 19, 2025</div>
                <ul className="changelog-items">
                  <li>Expense trend indicators with month-over-month comparisons</li>
                  <li>Place autocomplete for faster expense entry</li>
                  <li>Visual arrows showing spending increases/decreases</li>
                  <li>Percentage change tooltips on hover</li>
                  <li>Property-based testing for trend calculations</li>
                </ul>
              </div>

              <div className="changelog-entry">
                <div className="changelog-version">v3.4.0</div>
                <div className="changelog-date">November 19, 2025</div>
                <ul className="changelog-items">
                  <li>Unified Docker container with frontend and backend</li>
                  <li>Added health check endpoint and monitoring</li>
                  <li>Configurable logging and timezone support</li>
                  <li>Automated CI/CD pipeline for local registry</li>
                  <li>Enhanced security with non-root user</li>
                  <li>Standardized /config directory for all data</li>
                </ul>
              </div>

              <div className="changelog-entry">
                <div className="changelog-version">v3.3.4</div>
                <div className="changelog-date">November 18, 2025</div>
                <ul className="changelog-items">
                  <li>Improved tax deduction summary display</li>
                  <li>Enhanced monthly summary layout</li>
                  <li>Better readability with stacked label/value layout</li>
                </ul>
              </div>

              <div className="changelog-entry">
                <div className="changelog-version">v3.3.3</div>
                <div className="changelog-date">November 18, 2025</div>
                <ul className="changelog-items">
                  <li>Fixed date input timezone issues</li>
                  <li>Prevented off-by-one day errors</li>
                </ul>
              </div>

              <div className="changelog-entry">
                <div className="changelog-version">v3.3.0</div>
                <div className="changelog-date">November 14, 2025</div>
                <ul className="changelog-items">
                  <li>Total debt overview with aggregate tracking</li>
                  <li>Dual-axis charts for balance and interest rates</li>
                  <li>Loan type differentiation (loans vs lines of credit)</li>
                  <li>Automatic estimated months calculation</li>
                </ul>
              </div>

              <div className="changelog-entry">
                <div className="changelog-version">v3.2.0</div>
                <div className="changelog-date">November 10, 2025</div>
                <ul className="changelog-items">
                  <li>Fixed monthly expenses management</li>
                  <li>Multiple income sources tracking</li>
                  <li>Carry forward functionality</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {message.text && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}
      </div>
    </div>
  );
};

export default BackupSettings;
