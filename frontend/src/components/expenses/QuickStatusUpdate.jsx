import { useState, useCallback, useRef, useEffect } from 'react';
import './QuickStatusUpdate.css';

/**
 * QuickStatusUpdate Component
 * 
 * A dropdown/popover for quickly changing insurance claim status.
 * Features:
 * - Dropdown for status changes
 * - Support transitions: not_claimed → in_progress → paid/denied
 * - Calls PATCH endpoint on selection
 * - Immediate persistence without form submission
 * - Smart positioning to stay within viewport
 * - Accessibility compliance
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */
const QuickStatusUpdate = ({
  expenseId,
  currentStatus = 'not_claimed',
  onStatusChange,
  onClose,
  isOpen = false,
  position = { top: 0, left: 0 }
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const dropdownRef = useRef(null);

  /**
   * Status configuration with allowed transitions
   * Requirement 5.2: not_claimed → in_progress
   * Requirement 5.3: in_progress → paid/denied
   */
  const statusConfig = {
    not_claimed: {
      label: 'Not Claimed',
      icon: '📋',
      nextStatuses: ['in_progress'],
      description: 'Submit claim'
    },
    in_progress: {
      label: 'In Progress',
      icon: '⏳',
      nextStatuses: ['paid', 'denied'],
      description: 'Awaiting response'
    },
    paid: {
      label: 'Paid',
      icon: '✅',
      nextStatuses: ['in_progress'], // Can revert to in_progress
      description: 'Claim approved'
    },
    denied: {
      label: 'Denied',
      icon: '❌',
      nextStatuses: ['in_progress'], // Can revert to in_progress
      description: 'Claim denied'
    }
  };

  /**
   * Get available status options based on current status
   */
  const getAvailableStatuses = useCallback(() => {
    const config = statusConfig[currentStatus];
    if (!config) return [];
    
    return config.nextStatuses.map(status => ({
      value: status,
      ...statusConfig[status]
    }));
  }, [currentStatus]);

  /**
   * Handle status selection
   * Requirement 5.4: Persist status changes immediately
   */
  const handleStatusSelect = useCallback(async (newStatus) => {
    if (isUpdating || newStatus === currentStatus) return;
    
    setIsUpdating(true);
    setError(null);
    
    try {
      await onStatusChange(expenseId, newStatus);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update status');
    } finally {
      setIsUpdating(false);
    }
  }, [expenseId, currentStatus, onStatusChange, onClose, isUpdating]);

  /**
   * Handle click outside to close dropdown
   */
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen, onClose]);

  /**
   * Handle keyboard navigation
   */
  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  /**
   * Adjust position to stay within viewport
   */
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const dropdown = dropdownRef.current;
      const rect = dropdown.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      
      let newTop = position.top;
      let newLeft = position.left;
      
      // Check if dropdown goes below viewport
      if (newTop + rect.height > viewportHeight - 20) {
        // Position above the trigger instead
        newTop = position.top - rect.height - 40; // 40 = approximate trigger height + gap
        if (newTop < 20) {
          // If still doesn't fit, just position at top with some margin
          newTop = 20;
        }
      }
      
      // Check if dropdown goes beyond right edge
      if (newLeft + rect.width > viewportWidth - 20) {
        newLeft = viewportWidth - rect.width - 20;
      }
      
      // Ensure left doesn't go negative
      if (newLeft < 20) {
        newLeft = 20;
      }
      
      setAdjustedPosition({ top: newTop, left: newLeft });
      
      // Focus first option
      const firstOption = dropdown.querySelector('.quick-status-option');
      if (firstOption) {
        firstOption.focus();
      }
    }
  }, [isOpen, position]);

  if (!isOpen) return null;

  const availableStatuses = getAvailableStatuses();
  const currentConfig = statusConfig[currentStatus];

  return (
    <div
      ref={dropdownRef}
      className={`quick-status-dropdown ${isUpdating ? 'updating' : ''}`}
      style={{
        top: adjustedPosition.top,
        left: adjustedPosition.left
      }}
      role="menu"
      aria-label="Update insurance claim status"
      onKeyDown={handleKeyDown}
    >
      {/* Current Status Header */}
      <div className="quick-status-header">
        <span className="quick-status-current-icon">{currentConfig?.icon}</span>
        <span className="quick-status-current-label">
          Current: {currentConfig?.label}
        </span>
      </div>

      {/* Divider */}
      <div className="quick-status-divider" />

      {/* Status Options */}
      <div className="quick-status-options">
        {availableStatuses.length > 0 ? (
          availableStatuses.map((status) => (
            <button
              key={status.value}
              type="button"
              className={`quick-status-option status-${status.value}`}
              onClick={() => handleStatusSelect(status.value)}
              disabled={isUpdating}
              role="menuitem"
              aria-label={`Change status to ${status.label}`}
            >
              <span className="quick-status-option-icon">{status.icon}</span>
              <span className="quick-status-option-content">
                <span className="quick-status-option-label">{status.label}</span>
                <span className="quick-status-option-description">{status.description}</span>
              </span>
            </button>
          ))
        ) : (
          <div className="quick-status-no-options">
            No status changes available
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="quick-status-error" role="alert">
          {error}
        </div>
      )}

      {/* Loading Indicator */}
      {isUpdating && (
        <div className="quick-status-loading">
          <span className="quick-status-spinner" aria-hidden="true" />
          Updating...
        </div>
      )}
    </div>
  );
};

export default QuickStatusUpdate;
