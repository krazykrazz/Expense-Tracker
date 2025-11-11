import React, { useState, useEffect } from 'react';
import './BackupSettings.css';

const BackupSettings = ({ onClose }) => {
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

  useEffect(() => {
    fetchConfig();
    fetchBackupList();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await fetch('/api/backup/config');
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
      const response = await fetch('/api/backup/list');
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
      const response = await fetch('/api/backup/config', {
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
      const response = await fetch('/api/backup/manual', {
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
    window.location.href = '/api/backup';
  };

  const handleImportCSV = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setMessage({ text: 'Importing expenses...', type: 'info' });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/import', {
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
      const response = await fetch('/api/backup/restore', {
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

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return <div className="backup-settings-loading">Loading backup settings...</div>;
  }

  return (
    <div className="backup-settings">
      <h2>⚙️ Backup Settings</h2>

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
                placeholder="Leave empty for default location"
              />
              <small className="field-hint">
                Full path to backup directory (e.g., C:\Backups\ExpenseTracker)
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

      <div className="settings-section">
        <h3>Import & Restore</h3>
        
        <div className="import-restore-section">
          <div className="import-option">
            <h4>Import from CSV</h4>
            <p>Import expenses from a CSV file</p>
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

          <div className="import-option">
            <h4>Restore from Backup</h4>
            <p className="warning-text">⚠️ This will replace all current data</p>
            <label className="file-upload-button restore-button">
              🔄 Choose Backup File
              <input 
                type="file" 
                accept=".db"
                onChange={handleRestoreBackup}
                style={{ display: 'none' }}
              />
            </label>
          </div>
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

      {message.text && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}
    </div>
  );
};

export default BackupSettings;
