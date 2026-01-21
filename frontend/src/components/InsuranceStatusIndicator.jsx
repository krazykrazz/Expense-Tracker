import { useCallback } from 'react';
import './InsuranceStatusIndicator.css';

/**
 * InsuranceStatusIndicator Component
 * 
 * A visual indicator showing the current insurance claim status for medical expenses.
 * Features:
 * - Clear visual indicator (icon + optional text)
 * - Different sizes (small, medium)
 * - Click handler for quick status update
 * - No indicator when not insurance eligible
 * - Tooltip with status information
 * - Accessibility compliance
 * 
 * Requirements: 7.1, 7.2, 7.3
 */
const InsuranceStatusIndicator = ({
  insuranceEligible = false,
  claimStatus = null,
  originalCost = null,
  outOfPocket = null,
  size = 'medium',
  onClick = null,
  showText = false,
  className = ''
}) => {
  // Don't render anything if not insurance eligible (Requirement 7.3)
  if (!insuranceEligible) {
    return null;
  }

  /**
   * Get status configuration based on claim status
   * Requirement 7.2: Distinct visual indicators for each status
   */
  const getStatusConfig = useCallback(() => {
    switch (claimStatus) {
      case 'not_claimed':
        return {
          icon: '📋',
          label: 'Not Claimed',
          colorClass: 'status-not-claimed',
          description: 'Insurance claim not yet submitted'
        };
      case 'in_progress':
        return {
          icon: '⏳',
          label: 'In Progress',
          colorClass: 'status-in-progress',
          description: 'Insurance claim submitted, awaiting response'
        };
      case 'paid':
        return {
          icon: '✅',
          label: 'Paid',
          colorClass: 'status-paid',
          description: 'Insurance claim approved and paid'
        };
      case 'denied':
        return {
          icon: '❌',
          label: 'Denied',
          colorClass: 'status-denied',
          description: 'Insurance claim was denied'
        };
      default:
        return {
          icon: '📋',
          label: 'Not Claimed',
          colorClass: 'status-not-claimed',
          description: 'Insurance eligible - no claim status set'
        };
    }
  }, [claimStatus]);

  const statusConfig = getStatusConfig();

  /**
   * Handle click event
   */
  const handleClick = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    
    if (onClick) {
      onClick(event);
    }
  }, [onClick]);

  /**
   * Handle keyboard interaction for accessibility
   */
  const handleKeyDown = useCallback((event) => {
    if (onClick && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      onClick(event);
    }
  }, [onClick]);

  /**
   * Generate tooltip text
   */
  const getTooltipText = useCallback(() => {
    const parts = [statusConfig.description];
    
    if (originalCost !== null && outOfPocket !== null) {
      const reimbursement = originalCost - outOfPocket;
      parts.push(`Original: $${originalCost.toFixed(2)}`);
      parts.push(`Out-of-pocket: $${outOfPocket.toFixed(2)}`);
      if (reimbursement > 0) {
        parts.push(`Reimbursement: $${reimbursement.toFixed(2)}`);
      }
    } else if (originalCost !== null) {
      parts.push(`Original cost: $${originalCost.toFixed(2)}`);
    }
    
    if (onClick) {
      parts.push('Click to update status');
    }
    
    return parts.join('\n');
  }, [statusConfig.description, originalCost, outOfPocket, onClick]);

  const isClickable = !!onClick;
  const tooltipText = getTooltipText();

  return (
    <span
      className={`insurance-status-indicator ${size} ${statusConfig.colorClass} ${isClickable ? 'clickable' : ''} ${className}`}
      onClick={isClickable ? handleClick : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
      title={tooltipText}
      role={isClickable ? 'button' : 'status'}
      tabIndex={isClickable ? 0 : -1}
      aria-label={`Insurance status: ${statusConfig.label}`}
    >
      <span className="insurance-status-icon" aria-hidden="true">
        {statusConfig.icon}
      </span>
      
      {showText && (
        <span className="insurance-status-text">
          {statusConfig.label}
        </span>
      )}
    </span>
  );
};

export default InsuranceStatusIndicator;
