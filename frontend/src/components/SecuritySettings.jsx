import { useState, useEffect, useCallback } from 'react';
import { useAuthContext } from '../contexts/AuthContext';
import { getAuthStatus, setPassword as apiSetPassword, removePassword as apiRemovePassword } from '../services/authApi';
import { createLogger } from '../utils/logger';
import './SecuritySettings.css';

const logger = createLogger('SecuritySettings');

/**
 * Validate password and confirmation fields.
 * Exported for property-based testing.
 * @param {string} password
 * @param {string} confirmation
 * @returns {{ password?: string, confirmation?: string }}
 */
export function validatePasswordFields(password, confirmation) {
  const errors = {};
  if (password && password.length < 4) {
    errors.password = 'Password must be at least 4 characters';
  }
  if (password && confirmation && password !== confirmation) {
    errors.confirmation = 'Passwords do not match';
  }
  return errors;
}

/**
 * SecuritySettings - Security section within the SettingsModal.
 * Manages authentication toggle, password set/change/remove.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9
 */
const SecuritySettings = () => {
  const { isPasswordRequired, login, enableAuth, disableAuth } = useAuthContext();

  const [authEnabled, setAuthEnabled] = useState(false);
  const [username, setUsername] = useState('admin');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationErrors, setValidationErrors] = useState({});
  const [message, setMessage] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Fetch auth status on mount
  useEffect(() => {
    let isMounted = true;
    const fetchStatus = async () => {
      try {
        const status = await getAuthStatus();
        if (isMounted) {
          setAuthEnabled(status.passwordRequired);
          setUsername(status.username || 'admin');
        }
      } catch (err) {
        logger.error('Failed to fetch auth status:', err);
        if (isMounted) {
          setMessage({ text: 'Failed to load security settings', type: 'error' });
        }
      } finally {
        if (isMounted) setInitialLoading(false);
      }
    };
    fetchStatus();
    return () => { isMounted = false; };
  }, []);

  const clearForm = useCallback(() => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setValidationErrors({});
  }, []);

  const showMessage = useCallback((text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  }, []);

  // Handle enabling auth (set password for the first time from Open_Mode)
  const handleEnableAuth = async () => {
    const errors = validatePasswordFields(newPassword, confirmPassword);
    if (!newPassword) errors.password = 'Password is required';
    if (!confirmPassword) errors.confirmation = 'Please confirm your password';
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      await apiSetPassword(null, newPassword);
      // Immediately log in and activate Password_Gate so authFetch wires up
      // before any subsequent API calls (Req 9.8)
      await enableAuth(newPassword);
      setAuthEnabled(true);
      clearForm();
      showMessage('Authentication enabled successfully', 'success');
    } catch (err) {
      showMessage(err.message || 'Failed to enable authentication', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Handle disabling auth (remove password, return to Open_Mode)
  const handleDisableAuth = async () => {
    if (!currentPassword) {
      setValidationErrors({ currentPassword: 'Current password is required' });
      return;
    }
    setValidationErrors({});
    setLoading(true);
    try {
      await apiRemovePassword(currentPassword);
      await disableAuth();
      setAuthEnabled(false);
      clearForm();
      showMessage('Authentication disabled', 'success');
    } catch (err) {
      showMessage(err.message || 'Failed to disable authentication', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Handle password change while Password_Gate is active
  const handleChangePassword = async () => {
    const errors = validatePasswordFields(newPassword, confirmPassword);
    if (!currentPassword) errors.currentPassword = 'Current password is required';
    if (!newPassword) errors.password = 'New password is required';
    if (!confirmPassword) errors.confirmation = 'Please confirm your new password';
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      await apiSetPassword(currentPassword, newPassword);
      // Re-login with new password to get a fresh token
      await login(newPassword);
      clearForm();
      showMessage('Password changed successfully', 'success');
    } catch (err) {
      showMessage(err.message || 'Failed to change password', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Handle toggle click
  const handleToggle = () => {
    if (authEnabled) {
      // Switching to disable — show current password prompt, handled by handleDisableAuth
      clearForm();
    } else {
      // Switching to enable — show new password form, handled by handleEnableAuth
      clearForm();
    }
    setAuthEnabled(!authEnabled);
  };

  const handleInputChange = (field, value) => {
    const setters = { currentPassword: setCurrentPassword, newPassword: setNewPassword, confirmPassword: setConfirmPassword };
    setters[field]?.(value);
    // Map form fields to their validation error keys
    const errorKeyMap = { newPassword: 'password', confirmPassword: 'confirmation', currentPassword: 'currentPassword' };
    const errorKey = errorKeyMap[field] || field;
    if (validationErrors[errorKey]) {
      setValidationErrors(prev => ({ ...prev, [errorKey]: null }));
    }
    if (message.text) setMessage({ text: '', type: '' });
  };

  if (initialLoading) {
    return <div className="security-loading">Loading security settings...</div>;
  }

  // Determine which form to show based on state
  const isCurrentlyProtected = isPasswordRequired;
  const wantsToEnable = authEnabled && !isCurrentlyProtected;
  const wantsToDisable = !authEnabled && isCurrentlyProtected;
  const wantsToChangePassword = authEnabled && isCurrentlyProtected;

  return (
    <div className="security-settings">
      <div className="settings-section">
        <h3>Authentication</h3>
        <p>Protect your financial data with a password. When enabled, a password is required to access the application.</p>

        {message.text && (
          <div className={`message ${message.type}`} role="status">
            {message.text}
          </div>
        )}

        {/* Username display (Req 9.2) */}
        <div className="security-field">
          <label>Username</label>
          <div className="security-username-display">{username}</div>
        </div>

        {/* Auth toggle (Req 9.4) */}
        <div className="security-toggle-group">
          <label className="security-toggle-label" htmlFor="auth-toggle">
            <input
              id="auth-toggle"
              type="checkbox"
              checked={authEnabled}
              onChange={handleToggle}
              disabled={loading}
              aria-label="Enable authentication"
            />
            <span>Enable password protection</span>
          </label>
          <small className="field-hint">
            {authEnabled
              ? 'A password is required to access the application'
              : 'The application is accessible without a password'}
          </small>
        </div>

        {/* Enable auth form — Open_Mode, user toggled ON (Req 9.5) */}
        {wantsToEnable && (
          <div className="security-form-section">
            <h4>Set Password</h4>
            <div className="security-form">
              <div className="security-form-group">
                <label htmlFor="security-new-password">Password</label>
                <input
                  id="security-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => handleInputChange('newPassword', e.target.value)}
                  placeholder="Enter password (min 4 characters)"
                  className={validationErrors.password ? 'input-error' : ''}
                  disabled={loading}
                  autoFocus
                />
                {validationErrors.password && (
                  <span className="validation-error">{validationErrors.password}</span>
                )}
              </div>
              <div className="security-form-group">
                <label htmlFor="security-confirm-password">Confirm Password</label>
                <input
                  id="security-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  placeholder="Confirm password"
                  className={validationErrors.confirmation ? 'input-error' : ''}
                  disabled={loading}
                />
                {validationErrors.confirmation && (
                  <span className="validation-error">{validationErrors.confirmation}</span>
                )}
              </div>
              <div className="security-form-actions">
                <button
                  className="save-button"
                  onClick={handleEnableAuth}
                  disabled={loading}
                >
                  {loading ? 'Enabling...' : 'Enable Authentication'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Disable auth form — Password_Gate active, user toggled OFF (Req 9.7) */}
        {wantsToDisable && (
          <div className="security-form-section">
            <h4>Disable Authentication</h4>
            <p className="security-warning">Enter your current password to disable authentication.</p>
            <div className="security-form">
              <div className="security-form-group">
                <label htmlFor="security-current-password-disable">Current Password</label>
                <input
                  id="security-current-password-disable"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => handleInputChange('currentPassword', e.target.value)}
                  placeholder="Enter current password"
                  className={validationErrors.currentPassword ? 'input-error' : ''}
                  disabled={loading}
                  autoFocus
                />
                {validationErrors.currentPassword && (
                  <span className="validation-error">{validationErrors.currentPassword}</span>
                )}
              </div>
              <div className="security-form-actions">
                <button
                  className="security-disable-button"
                  onClick={handleDisableAuth}
                  disabled={loading}
                >
                  {loading ? 'Disabling...' : 'Disable Authentication'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Change password form — Password_Gate active, toggle stays ON (Req 9.6) */}
        {wantsToChangePassword && (
          <div className="security-form-section">
            <h4>Change Password</h4>
            <div className="security-form">
              <div className="security-form-group">
                <label htmlFor="security-current-password-change">Current Password</label>
                <input
                  id="security-current-password-change"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => handleInputChange('currentPassword', e.target.value)}
                  placeholder="Enter current password"
                  className={validationErrors.currentPassword ? 'input-error' : ''}
                  disabled={loading}
                />
                {validationErrors.currentPassword && (
                  <span className="validation-error">{validationErrors.currentPassword}</span>
                )}
              </div>
              <div className="security-form-group">
                <label htmlFor="security-new-password-change">New Password</label>
                <input
                  id="security-new-password-change"
                  type="password"
                  value={newPassword}
                  onChange={(e) => handleInputChange('newPassword', e.target.value)}
                  placeholder="Enter new password (min 4 characters)"
                  className={validationErrors.password ? 'input-error' : ''}
                  disabled={loading}
                />
                {validationErrors.password && (
                  <span className="validation-error">{validationErrors.password}</span>
                )}
              </div>
              <div className="security-form-group">
                <label htmlFor="security-confirm-password-change">Confirm New Password</label>
                <input
                  id="security-confirm-password-change"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  placeholder="Confirm new password"
                  className={validationErrors.confirmation ? 'input-error' : ''}
                  disabled={loading}
                />
                {validationErrors.confirmation && (
                  <span className="validation-error">{validationErrors.confirmation}</span>
                )}
              </div>
              <div className="security-form-actions">
                <button
                  className="save-button"
                  onClick={handleChangePassword}
                  disabled={loading}
                >
                  {loading ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SecuritySettings;
