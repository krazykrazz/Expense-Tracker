import './ReimbursementIndicator.css';

/**
 * ReimbursementIndicator Component
 * 
 * Displays a visual indicator for expenses that have been partially reimbursed.
 * Shows the breakdown on hover/click.
 * 
 * Features:
 * - Clear visual indicator (💰 icon)
 * - Different sizes (small, medium)
 * - Tooltip with breakdown (Charged, Reimbursed, Net)
 * - Accessibility compliance
 * 
 * Requirements: 5.1, 5.2
 */
const ReimbursementIndicator = ({
  originalCost,
  netAmount,
  size = 'small',
  className = ''
}) => {
  // Only show if there's a reimbursement (original_cost is set and differs from amount)
  // Requirement 7.2: No indicator when original_cost is NULL or equals amount
  if (!originalCost || originalCost === netAmount) {
    return null;
  }

  const reimbursement = originalCost - netAmount;
  
  // Generate tooltip text with breakdown (Requirement 5.2)
  const tooltipText = `Charged: $${originalCost.toFixed(2)}\nReimbursed: $${reimbursement.toFixed(2)}\nNet: $${netAmount.toFixed(2)}`;
  
  // Accessible label for screen readers
  const ariaLabel = `Reimbursed expense: Charged $${originalCost.toFixed(2)}, Reimbursed $${reimbursement.toFixed(2)}, Net $${netAmount.toFixed(2)}`;

  return (
    <span
      className={`reimbursement-indicator ${size} ${className}`}
      title={tooltipText}
      role="status"
      aria-label={ariaLabel}
    >
      <span className="reimbursement-icon" aria-hidden="true">💰</span>
    </span>
  );
};

export default ReimbursementIndicator;
