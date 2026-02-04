/**
 * MigrationUtility Component
 * 
 * Provides UI for migrating existing balance entries to payment entries.
 * Shows preview of what will be migrated and displays summary after migration.
 * 
 * Requirements: 4.1, 4.5
 */

import { useState, useEffect } from 'react';
import { previewMigration, migrateBalances } from '../services/loanPaymentApi';
import { formatCurrency, formatDate } from '../utils/formatters';
import { createLogger } from '../utils/logger';
import './MigrationUtility.css';

const logger = createLogger('MigrationUtility');

const MigrationUtility = ({ 
  loanId, 
  loanName, 
  onMigrationComplete, 
  onClose,
  disabled = false 
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [migrationResult, setMigrationResult] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Fetch migration preview on mount
  useEffect(() => {
    fetchPreview();
  }, [loanId]);

  const fetchPreview = async () => {
    if (!loanId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const previewData = await previewMigration(loanId);
      setPreview(previewData);
      logger.debug('Migration preview loaded:', previewData);
    } catch (err) {
      const errorMessage = err.message || 'Failed to load migration preview';
      setError(errorMessage);
      logger.error('Error fetching migration preview:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMigrate = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await migrateBalances(loanId);
      setMigrationResult(result);
      setShowConfirmation(false);
      logger.info('Migration completed:', result);
      
      // Notify parent component
      if (onMigrationComplete) {
        onMigrationComplete(result);
      }
    } catch (err) {
      const errorMessage = err.message || 'Failed to migrate balance entries';
      setError(errorMessage);
      logger.error('Error during migration:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmMigration = () => {
    setShowConfirmation(true);
  };

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
  };

  const clearError = () => {
    setError(null);
  };

  // Render loading state
  if (loading && !preview && !migrationResult) {
    return (
      <div className="migration-utility-container">
        <div className="migration-utility-loading">
          <span className="loading-spinner">⏳</span>
          <span>Loading migration preview...</span>
        </div>
      </div>
    );
  }

  // Render migration result (success state)
  if (migrationResult) {
    return (
      <div className="migration-utility-container">
        <div className="migration-utility-header">
          <h3>Migration Complete</h3>
          <button 
            className="migration-close-btn" 
            onClick={onClose}
            aria-label="Close migration utility"
          >
            ✕
          </button>
        </div>

        <div className="migration-result">
          <div className="migration-result-icon success">✓</div>
          <p className="migration-result-message">{migrationResult.message}</p>
          
          {/* Summary Section - Requirement 4.5 */}
          <div className="migration-summary">
            <h4>Summary</h4>
            <div className="migration-summary-grid">
              <div className="summary-item">
                <span className="summary-label">Payments Created:</span>
                <span className="summary-value success">{migrationResult.summary.totalConverted}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Entries Skipped:</span>
                <span className="summary-value warning">{migrationResult.summary.totalSkipped}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Total Amount:</span>
                <span className="summary-value">{formatCurrency(migrationResult.summary.totalPaymentAmount)}</span>
              </div>
              {migrationResult.summary.totalErrors > 0 && (
                <div className="summary-item">
                  <span className="summary-label">Errors:</span>
                  <span className="summary-value error">{migrationResult.summary.totalErrors}</span>
                </div>
              )}
            </div>
          </div>

          {/* Converted Payments List */}
          {migrationResult.converted.length > 0 && (
            <div className="migration-details-section">
              <h4>Converted Payments</h4>
              <div className="migration-entries-list">
                {migrationResult.converted.map((entry, index) => (
                  <div key={index} className="migration-entry converted">
                    <span className="entry-date">{formatDate(entry.paymentDate)}</span>
                    <span className="entry-amount">{formatCurrency(entry.paymentAmount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skipped Entries List */}
          {migrationResult.skipped.length > 0 && (
            <div className="migration-details-section">
              <h4>Skipped Entries</h4>
              <div className="migration-entries-list">
                {migrationResult.skipped.map((entry, index) => (
                  <div key={index} className="migration-entry skipped">
                    <span className="entry-reason">{entry.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="migration-actions">
            <button 
              className="migration-done-btn"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="migration-utility-container">
      <div className="migration-utility-header">
        <h3>Migrate Balance Entries</h3>
        <button 
          className="migration-close-btn" 
          onClick={onClose}
          disabled={loading}
          aria-label="Close migration utility"
        >
          ✕
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="migration-error">
          <span className="error-text">{error}</span>
          <button className="error-close" onClick={clearError}>✕</button>
        </div>
      )}

      {/* Loan Info */}
      <div className="migration-loan-info">
        <span className="loan-name">{loanName}</span>
      </div>

      {/* Description */}
      <div className="migration-description">
        <p>
          This utility converts your existing balance entries into payment records.
          Payment amounts are calculated from the difference between consecutive balance entries.
        </p>
        <p className="migration-note">
          <strong>Note:</strong> Original balance entries will be preserved for historical reference.
        </p>
      </div>

      {/* Preview Section - Requirement 4.1 */}
      {preview && (
        <div className="migration-preview">
          <h4>Preview</h4>
          
          {!preview.canMigrate ? (
            <>
              <div className="migration-preview-empty">
                <span className="preview-icon">ℹ️</span>
                <p>{preview.message}</p>
              </div>
              
              {/* Show skipped entries even when no payments can be created */}
              {preview.skipped && preview.skipped.length > 0 && (
                <div className="migration-preview-section skipped">
                  <h5>Skipped Entries</h5>
                  <div className="preview-entries-list">
                    {preview.skipped.map((entry, index) => (
                      <div key={index} className="preview-entry skipped">
                        <div className="preview-entry-main">
                          <span className="entry-reason">{entry.reason}</span>
                        </div>
                        <div className="preview-entry-detail">
                          <span className="entry-balance-change">
                            {formatCurrency(entry.previousBalance)} → {formatCurrency(entry.currentBalance)}
                            {entry.increase > 0 && (
                              <span className="increase-badge">+{formatCurrency(entry.increase)}</span>
                            )}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="preview-message">{preview.message}</p>
              
              {/* Preview Summary */}
              <div className="migration-preview-summary">
                <div className="preview-stat">
                  <span className="stat-value">{preview.summary.totalConverted}</span>
                  <span className="stat-label">Payments to Create</span>
                </div>
                <div className="preview-stat">
                  <span className="stat-value">{formatCurrency(preview.summary.totalPaymentAmount)}</span>
                  <span className="stat-label">Total Amount</span>
                </div>
                {preview.summary.totalSkipped > 0 && (
                  <div className="preview-stat warning">
                    <span className="stat-value">{preview.summary.totalSkipped}</span>
                    <span className="stat-label">Will Be Skipped</span>
                  </div>
                )}
              </div>

              {/* Payments to be Created */}
              {preview.converted.length > 0 && (
                <div className="migration-preview-section">
                  <h5>Payments to be Created</h5>
                  <div className="preview-entries-list">
                    {preview.converted.map((entry, index) => (
                      <div key={index} className="preview-entry">
                        <div className="preview-entry-main">
                          <span className="entry-date">{formatDate(entry.paymentDate)}</span>
                          <span className="entry-amount">{formatCurrency(entry.paymentAmount)}</span>
                        </div>
                        <div className="preview-entry-detail">
                          <span className="entry-balance-change">
                            {formatCurrency(entry.previousBalance)} → {formatCurrency(entry.currentBalance)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Entries to be Skipped */}
              {preview.skipped.length > 0 && (
                <div className="migration-preview-section skipped">
                  <h5>Entries to be Skipped</h5>
                  <div className="preview-entries-list">
                    {preview.skipped.map((entry, index) => (
                      <div key={index} className="preview-entry skipped">
                        <div className="preview-entry-main">
                          <span className="entry-reason">{entry.reason}</span>
                        </div>
                        <div className="preview-entry-detail">
                          <span className="entry-balance-change">
                            {formatCurrency(entry.previousBalance)} → {formatCurrency(entry.currentBalance)}
                            <span className="increase-badge">+{formatCurrency(entry.increase)}</span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmation && (
        <div className="migration-confirmation">
          <div className="confirmation-icon">⚠️</div>
          <p className="confirmation-message">
            Are you sure you want to migrate {preview?.summary.totalConverted} balance entries to payments?
          </p>
          <p className="confirmation-note">
            This action will create new payment records. Original balance entries will be preserved.
          </p>
          <div className="confirmation-actions">
            <button 
              className="confirm-migrate-btn"
              onClick={handleMigrate}
              disabled={loading}
            >
              {loading ? 'Migrating...' : 'Yes, Migrate'}
            </button>
            <button 
              className="cancel-migrate-btn"
              onClick={handleCancelConfirmation}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {!showConfirmation && (
        <div className="migration-actions">
          <button 
            className="migration-start-btn"
            onClick={handleConfirmMigration}
            disabled={loading || disabled || !preview?.canMigrate}
          >
            {loading ? 'Loading...' : 'Start Migration'}
          </button>
          <button 
            className="migration-cancel-btn"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export default MigrationUtility;
