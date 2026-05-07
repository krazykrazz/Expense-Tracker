import './PostedIndicator.css';

/**
 * PostedIndicator Component
 * 
 * Displays a small checkmark icon for credit card expenses that have a posted_date set,
 * indicating the transaction has been confirmed/posted by the bank.
 * 
 * Similar pattern to ReimbursementIndicator (💰).
 */
const PostedIndicator = ({
  postedDate,
  size = 'small',
  className = ''
}) => {
  if (!postedDate) {
    return null;
  }

  const tooltipText = `Posted: ${postedDate}`;
  const ariaLabel = `Transaction posted on ${postedDate}`;

  return (
    <span
      className={`posted-indicator ${size} ${className}`}
      title={tooltipText}
      role="status"
      aria-label={ariaLabel}
    >
      <span className="posted-icon" aria-hidden="true">✓</span>
    </span>
  );
};

export default PostedIndicator;
