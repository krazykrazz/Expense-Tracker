import { useState, useEffect } from 'react';
import { API_ENDPOINTS } from '../config';
import './BackupSettings.css';
import { formatDateTime } from '../utils/formatters';
import PlaceNameStandardization from './PlaceNameStandardization';
import { getPeople, createPerson, updatePerson, deletePerson } from '../services/peopleApi';
import { createLogger } from '../utils/logger';

const logger = createLogger('BackupSettings');

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
  const [dbStats, setDbStats] = useState(null);
  const [showPlaceNameStandardization, setShowPlaceNameStandardization] = useState(false);
  
  // People management state
  const [people, setPeople] = useState([]);
  const [editingPerson, setEditingPerson] = useState(null);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState(null);
  const [personFormData, setPersonFormData] = useState({ name: '', dateOfBirth: '' });
  const [personValidationErrors, setPersonValidationErrors] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    fetchConfig();
    fetchBackupList();
    fetchVersionInfo();
  }, []);

  // Fetch people when People tab is active
  useEffect(() => {
    if (activeTab === 'people') {
      fetchPeople();
    }
  }, [activeTab]);

  // Fetch stats when About tab is active
  useEffect(() => {
    if (activeTab === 'about') {
      fetchDbStats();
    }
  }, [activeTab]);

  const fetchVersionInfo = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.VERSION);
      if (response.ok) {
        const data = await response.json();
        setVersionInfo(data);
      }
    } catch (error) {
      logger.error('Error fetching version info:', error);
    }
  };

  const fetchDbStats = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.BACKUP_STATS);
      if (response.ok) {
        const data = await response.json();
        setDbStats(data);
      }
    } catch (error) {
      logger.error('Error fetching database stats:', error);
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
      logger.error('Error fetching config:', error);
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
      logger.error('Error fetching backups:', error);
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
    window.location.href = API_ENDPOINTS.BACKUP_DOWNLOAD;
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
      logger.error('Restore error:', error);
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

  // People management functions
  const fetchPeople = async () => {
    setPeopleLoading(true);
    setPeopleError(null);
    try {
      const data = await getPeople();
      setPeople(data || []);
    } catch (err) {
      setPeopleError(err.message || 'Failed to load family members');
    } finally {
      setPeopleLoading(false);
    }
  };

  const clearPersonForm = () => {
    setPersonFormData({ name: '', dateOfBirth: '' });
    setPersonValidationErrors({});
    setEditingPerson(null);
  };

  const validatePersonForm = () => {
    const errors = {};
    if (!personFormData.name || personFormData.name.trim() === '') {
      errors.name = 'Name is required';
    }
    if (personFormData.dateOfBirth && personFormData.dateOfBirth.trim() !== '') {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(personFormData.dateOfBirth)) {
        errors.dateOfBirth = 'Date must be in YYYY-MM-DD format';
      } else {
        const date = new Date(personFormData.dateOfBirth);
        if (isNaN(date.getTime())) {
          errors.dateOfBirth = 'Invalid date';
        } else if (date > new Date()) {
          errors.dateOfBirth = 'Date cannot be in the future';
        }
      }
    }
    setPersonValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handlePersonInputChange = (field, value) => {
    setPersonFormData(prev => ({ ...prev, [field]: value }));
    if (personValidationErrors[field]) {
      setPersonValidationErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const handleAddPerson = () => {
    clearPersonForm();
    setEditingPerson('new');
  };

  const handleEditPerson = (person) => {
    setPersonFormData({
      name: person.name,
      dateOfBirth: person.dateOfBirth || ''
    });
    setEditingPerson(person.id);
    setPersonValidationErrors({});
  };

  const handleSavePerson = async () => {
    if (!validatePersonForm()) return;
    
    setPeopleLoading(true);
    setPeopleError(null);
    try {
      const { name, dateOfBirth } = personFormData;
      const dateValue = dateOfBirth.trim() === '' ? null : dateOfBirth;
      
      if (editingPerson === 'new') {
        await createPerson(name.trim(), dateValue);
      } else {
        await updatePerson(editingPerson, name.trim(), dateValue);
      }
      await fetchPeople();
      clearPersonForm();
      
      // Dispatch global event to notify other components of people update
      window.dispatchEvent(new CustomEvent('peopleUpdated'));
    } catch (err) {
      setPeopleError(err.message || 'Failed to save person');
    } finally {
      setPeopleLoading(false);
    }
  };

  const handleCancelPersonEdit = () => {
    clearPersonForm();
    setPeopleError(null);
  };

  const handleDeletePersonClick = (person) => {
    setDeleteConfirm(person);
  };

  const handleDeletePersonConfirm = async () => {
    if (!deleteConfirm) return;
    
    setPeopleLoading(true);
    setPeopleError(null);
    try {
      await deletePerson(deleteConfirm.id);
      await fetchPeople();
      setDeleteConfirm(null);
      
      // Dispatch global event to notify other components of people update
      window.dispatchEvent(new CustomEvent('peopleUpdated'));
    } catch (err) {
      setPeopleError(err.message || 'Failed to delete person');
    } finally {
      setPeopleLoading(false);
    }
  };

  const handleDeletePersonCancel = () => {
    setDeleteConfirm(null);
  };

  const formatPersonDate = (dateString) => {
    if (!dateString) return 'Not specified';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-CA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

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
          🔄 Restore
        </button>
        <button 
          className={`tab-button ${activeTab === 'people' ? 'active' : ''}`}
          onClick={() => setActiveTab('people')}
        >
          👥 People
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
        <p>Create a backup right now. Backups include all expenses, income sources, fixed expenses, loans, budgets, investments, invoice files, and configuration data.</p>
        <div className="manual-backup-buttons">
          <button onClick={handleManualBackup} className="backup-button">
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
        </div>
      )}

      {activeTab === 'people' && (
        <div className="tab-panel">
          <div className="settings-section">
            <h3>Family Members</h3>
            <p>Manage family members for medical expense tracking. Associate medical expenses with specific people for detailed tax reporting.</p>
            
            {peopleError && (
              <div className="message error">
                {peopleError}
                {people.length === 0 && !peopleLoading && (
                  <button className="people-retry-button" onClick={fetchPeople}>
                    Retry
                  </button>
                )}
              </div>
            )}

            {peopleLoading && people.length === 0 ? (
              <div className="people-loading">Loading family members...</div>
            ) : (
              <>
                {/* Add Person Button */}
                <div className="people-add-section">
                  <button
                    className="people-add-button"
                    onClick={handleAddPerson}
                    disabled={peopleLoading || editingPerson !== null}
                  >
                    ➕ Add Family Member
                  </button>
                </div>

                {/* Person Form */}
                {editingPerson !== null && (
                  <div className="people-form-section">
                    <h4>{editingPerson === 'new' ? 'Add New Person' : 'Edit Person'}</h4>
                    
                    <div className="people-form">
                      <div className="people-form-group">
                        <label htmlFor="settings-person-name">Name *</label>
                        <input
                          id="settings-person-name"
                          type="text"
                          value={personFormData.name}
                          onChange={(e) => handlePersonInputChange('name', e.target.value)}
                          placeholder="Enter person's name"
                          className={personValidationErrors.name ? 'input-error' : ''}
                          disabled={peopleLoading}
                          autoFocus
                        />
                        {personValidationErrors.name && (
                          <span className="validation-error">{personValidationErrors.name}</span>
                        )}
                      </div>

                      <div className="people-form-group">
                        <label htmlFor="settings-person-dob">Date of Birth (Optional)</label>
                        <input
                          id="settings-person-dob"
                          type="date"
                          value={personFormData.dateOfBirth}
                          onChange={(e) => handlePersonInputChange('dateOfBirth', e.target.value)}
                          className={personValidationErrors.dateOfBirth ? 'input-error' : ''}
                          disabled={peopleLoading}
                        />
                        {personValidationErrors.dateOfBirth && (
                          <span className="validation-error">{personValidationErrors.dateOfBirth}</span>
                        )}
                      </div>

                      <div className="people-form-actions">
                        <button
                          className="people-save-button"
                          onClick={handleSavePerson}
                          disabled={peopleLoading}
                        >
                          {peopleLoading ? 'Saving...' : (editingPerson === 'new' ? 'Add Person' : 'Save Changes')}
                        </button>
                        <button
                          className="people-cancel-button"
                          onClick={handleCancelPersonEdit}
                          disabled={peopleLoading}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* People List */}
                <div className="people-list-section">
                  <h4>Family Members ({people.length})</h4>
                  
                  {people.length === 0 ? (
                    <div className="people-empty-state">
                      <p>No family members added yet.</p>
                      <p>Click "Add Family Member" to get started.</p>
                    </div>
                  ) : (
                    <div className="people-list">
                      {people.map((person) => (
                        <div key={person.id} className="people-list-item">
                          <div className="people-info">
                            <div className="people-name">{person.name}</div>
                            <div className="people-dob">
                              Born: {formatPersonDate(person.dateOfBirth)}
                            </div>
                          </div>
                          
                          <div className="people-actions">
                            <button
                              className="people-edit-button"
                              onClick={() => handleEditPerson(person)}
                              disabled={peopleLoading || editingPerson !== null}
                              title="Edit person"
                            >
                              ✏️
                            </button>
                            <button
                              className="people-delete-button"
                              onClick={() => handleDeletePersonClick(person)}
                              disabled={peopleLoading}
                              title="Delete person"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Info Section */}
                <div className="people-info-note">
                  <p>
                    💡 <strong>Note:</strong> Deleting a person will remove them from all associated medical expenses. This action cannot be undone.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Delete Confirmation */}
          {deleteConfirm && (
            <div className="people-delete-overlay">
              <div className="people-delete-modal">
                <h3>Confirm Deletion</h3>
                <p>
                  Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?
                </p>
                <p className="people-delete-warning">
                  ⚠️ This will remove them from all associated medical expenses and cannot be undone.
                </p>
                
                <div className="people-delete-actions">
                  <button
                    className="people-delete-confirm-button"
                    onClick={handleDeletePersonConfirm}
                    disabled={peopleLoading}
                  >
                    {peopleLoading ? 'Deleting...' : 'Yes, Delete'}
                  </button>
                  <button
                    className="people-delete-cancel-button"
                    onClick={handleDeletePersonCancel}
                    disabled={peopleLoading}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
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
                <div className="changelog-version">v5.4.2</div>
                <div className="changelog-date">February 2026</div>
                <ul className="changelog-items">
                  <li>Fixed credit card actual balance of zero not being saved/recognized</li>
                  <li>Added is_user_entered flag to distinguish user-entered vs auto-generated cycles</li>
                </ul>
              </div>
              <div className="changelog-entry">
                <div className="changelog-version">v5.4.1</div>
                <div className="changelog-date">February 2026</div>
                <ul className="changelog-items">
                  <li>Fixed zero statement balance not saving properly for unused credit cards</li>
                </ul>
              </div>
              <div className="changelog-entry">
                <div className="changelog-version">v5.4.0</div>
                <div className="changelog-date">February 2026</div>
                <ul className="changelog-items">
                  <li>Unified Billing Cycles: Consolidated billing cycle management in single tab</li>
                  <li>Auto-generation of billing cycles based on historical expenses</li>
                  <li>Transaction counts and trend indicators per billing cycle</li>
                  <li>Smart method filter combining payment type and method selection</li>
                  <li>Filter chips with one-click removal for active filters</li>
                </ul>
              </div>
              <div className="changelog-entry">
                <div className="changelog-version">v5.3.0</div>
                <div className="changelog-date">February 2026</div>
                <ul className="changelog-items">
                  <li>Generic Expense Reimbursement: Track reimbursements for any expense type</li>
                  <li>Reimbursement status workflow: pending → submitted → approved → paid/denied</li>
                  <li>Visual indicators showing reimbursement status and amounts</li>
                  <li>Out-of-pocket calculations for reimbursable expenses</li>
                </ul>
              </div>
              <div className="changelog-entry">
                <div className="changelog-version">v5.1.0</div>
                <div className="changelog-date">February 2026</div>
                <ul className="changelog-items">
                  <li>Fixed Interest Rate Loans: Lock in interest rates for traditional loans</li>
                  <li>Rate lock indicator shows when a loan has a fixed rate</li>
                  <li>Fixed rate loans skip rate field in balance history entries</li>
                  <li>Improved loan update validation (only editable fields)</li>
                </ul>
              </div>
              <div className="changelog-entry">
                <div className="changelog-version">v5.0.x</div>
                <div className="changelog-date">January - February 2026</div>
                <ul className="changelog-items">
                  <li>Configurable Payment Methods: Database-driven payment method management</li>
                  <li>Credit Card Balance Tracking: Current vs statement balance, utilization indicators</li>
                  <li>Credit Card Payments & Statements: Record payments, upload statements</li>
                  <li>Posted Date Support: Distinguish transaction date vs posting date</li>
                  <li>Payment Method Reminders: Alerts for credit card due dates</li>
                </ul>
              </div>
              <div className="changelog-entry">
                <div className="changelog-version">v4.15 - v4.19</div>
                <div className="changelog-date">January 2026</div>
                <ul className="changelog-items">
                  <li>Mortgage Tracking: Amortization schedules, equity tracking, payment insights</li>
                  <li>Medical Insurance Tracking: Claim status, reimbursements, out-of-pocket</li>
                  <li>Year-over-Year Comparison: Income, expenses, savings rate, net worth changes</li>
                  <li>Annual Summary Cards: Savings Rate, Transaction Count, Top Category, Daily Spend</li>
                  <li>GitHub Actions CI/CD: Automated testing workflows</li>
                </ul>
              </div>
              <div className="changelog-entry">
                <div className="changelog-version">v4.10 - v4.14</div>
                <div className="changelog-date">January 2026</div>
                <ul className="changelog-items">
                  <li>Invoice Attachments: PDF upload, viewing, and management for tax-deductible expenses</li>
                  <li>Multi-Invoice Support: Multiple invoices per expense with person linking</li>
                  <li>Budget Alert Notifications: Smart thresholds, dismissible alerts</li>
                  <li>Sticky Summary Scrolling: Improved UX for long expense lists</li>
                  <li>UI Modernization: CSS variables, consistent design system</li>
                </ul>
              </div>
              <div className="changelog-entry">
                <div className="changelog-version">v4.0 - v4.9</div>
                <div className="changelog-date">November - December 2025</div>
                <ul className="changelog-items">
                  <li>Medical Expense People Tracking: Family member associations, allocations</li>
                  <li>Merchant Analytics: Spending insights by location, visit frequency</li>
                  <li>Monthly Data Reminders: Prompts for investment/loan updates</li>
                  <li>Investment Tracking: Portfolio performance with charts</li>
                  <li>Global Expense Filtering: Search across all time periods</li>
                  <li>Enhanced Fixed Expenses: Category tracking, carry-forward</li>
                </ul>
              </div>
              <div className="changelog-entry">
                <div className="changelog-version">v3.x</div>
                <div className="changelog-date">November 2025</div>
                <ul className="changelog-items">
                  <li>Place name standardization, budget tracking, expense trends</li>
                  <li>Unified Docker container, total debt overview, multiple income sources</li>
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
