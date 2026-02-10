import { useState, useEffect, useRef } from 'react';
import { useModalContext } from '../contexts/ModalContext';
import useTabState from '../hooks/useTabState';
import { API_ENDPOINTS } from '../config';
import { formatDateTime } from '../utils/formatters';
import { getPeople, createPerson, updatePerson, deletePerson } from '../services/peopleApi';
import { createLogger } from '../utils/logger';
import './SettingsModal.css';

const logger = createLogger('SettingsModal');

const SettingsModal = () => {
  const { closeSettingsModal } = useModalContext();
  const [activeTab, setActiveTab] = useTabState('settings-modal-tab', 'backups');
  
  // Backup configuration state
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
  
  // People management state
  const [people, setPeople] = useState([]);
  const [editingPerson, setEditingPerson] = useState(null);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState(null);
  const [personFormData, setPersonFormData] = useState({ name: '', dateOfBirth: '' });
  const [personValidationErrors, setPersonValidationErrors] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  
  // Track timeouts for cleanup on unmount
  const messageTimerRef = useRef(null);
  
  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (messageTimerRef.current) {
        clearTimeout(messageTimerRef.current);
      }
    };
  }, []);

  // Fetch initial data
  useEffect(() => {
    fetchConfig();
    fetchBackupList();
  }, []);

  // Fetch people when People tab is active
  useEffect(() => {
    if (activeTab === 'people') {
      fetchPeople();
    }
  }, [activeTab]);

  // ========== Backup Configuration Functions ==========
  
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
      
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
      messageTimerRef.current = setTimeout(() => setMessage({ text: '', type: '' }), 3000);
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
      
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
      messageTimerRef.current = setTimeout(() => setMessage({ text: '', type: '' }), 5000);
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

  // ========== People Management Functions ==========
  
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
    return <div className="settings-modal-loading">Loading settings...</div>;
  }

  return (
    <div className="settings-modal-overlay" onClick={closeSettingsModal}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h2>⚙️ Settings</h2>
          <button className="settings-modal-close" onClick={closeSettingsModal}>
            ✕
          </button>
        </div>
        
        <div className="settings-tabs">
          <button 
            className={`tab-button ${activeTab === 'backups' ? 'active' : ''}`}
            onClick={() => setActiveTab('backups')}
          >
            💾 Backups
          </button>
          <button 
            className={`tab-button ${activeTab === 'restore' ? 'active' : ''}`}
            onClick={() => setActiveTab('restore')}
          >
            🔄 Restore
          </button>
          <button 
            className={`tab-button ${activeTab === 'people' ? 'active' : ''}`}
            onClick={() => setActiveTab('people')}
          >
            👥 People
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

          {activeTab === 'restore' && (
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

          {message.text && (
            <div className={`message ${message.type}`}>
              {message.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
