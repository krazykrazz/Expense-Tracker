import { useState, useEffect, useRef } from 'react';
import './LoanDetailView.css';
import { updateLoan, markPaidOff } from '../services/loanApi';
import { getBalanceHistory, createOrUpdateBalance, deleteBalance } from '../services/loanBalanceApi';
import { validateName, validateAmount } from '../utils/validation';

const LoanDetailView = ({ loan, isOpen, onClose, onUpdate }) => {
  const [loanData, setLoanData] = useState(loan);
  const [balanceHistory, setBalanceHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  
  // Edit states
  const [isEditingLoan, setIsEditingLoan] = useState(false);
  const [editingBalanceId, setEditingBalanceId] = useState(null);
  const [showAddBalanceForm, setShowAddBalanceForm] = useState(false);
  
  // Form states
  const [loanFormData, setLoanFormData] = useState({
    name: '',
    notes: ''
  });
  
  const [balanceFormData, setBalanceFormData] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    remaining_balance: '',
    rate: ''
  });
  
  const [validationErrors, setValidationErrors] = useState({});
  
  // Ref for auto-scrolling to newly added entries
  const balanceHistoryRef = useRef(null);
  const newEntryRef = useRef(null);

  // Fetch balance history when modal opens or loan changes
  useEffect(() => {
    if (isOpen && loan) {
      setLoanData(loan);
      setLoanFormData({
        name: loan.name,
        notes: loan.notes || ''
      });
      fetchBalanceHistory();
    }
  }, [isOpen, loan]);

  const fetchBalanceHistory = async () => {
    if (!loan || !loan.id) return;
    
    setLoading(true);
    setError(null);

    try {
      const data = await getBalanceHistory(loan.id);
      setBalanceHistory(data || []);
    } catch (err) {
      const errorMessage = err.message || 'Failed to load balance history';
      setError(errorMessage);
      console.error('Error fetching balance history:', err);
    } finally {
      setLoading(false);
    }
  };

  // Calculate derived values
  const currentBalance = loanData?.currentBalance || loanData?.initial_balance || 0;
  const totalPaidDown = (loanData?.initial_balance || 0) - currentBalance;
  const paydownPercentage = loanData?.initial_balance > 0 
    ? (totalPaidDown / loanData.initial_balance) * 100 
    : 0;
  const currentRate = loanData?.currentRate || 0;

  const formatCurrency = (amount) => {
    return `$${parseFloat(amount || 0).toFixed(2)}`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatMonthYear = (year, month) => {
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  };

  const clearMessages = () => {
    setError(null);
    setSuccessMessage(null);
  };

  const showSuccess = (message) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleEditLoanDetails = () => {
    setIsEditingLoan(true);
    setLoanFormData({
      name: loanData.name,
      notes: loanData.notes || ''
    });
    setValidationErrors({});
    clearMessages();
  };

  const handleSaveLoanDetails = async () => {
    clearMessages();
    
    // Validate name
    const nameError = validateName(loanFormData.name);
    if (nameError) {
      setValidationErrors({ name: nameError });
      setError('Please fix the validation errors before saving.');
      return;
    }

    setLoading(true);

    try {
      await updateLoan(loanData.id, {
        name: loanFormData.name.trim(),
        notes: loanFormData.notes.trim() || null
      });
      
      // Update local state
      setLoanData({
        ...loanData,
        name: loanFormData.name.trim(),
        notes: loanFormData.notes.trim() || null
      });
      
      setIsEditingLoan(false);
      showSuccess('Loan details updated successfully');
      
      // Notify parent to refresh
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      const errorMessage = err.message || 'Failed to update loan details';
      setError(errorMessage);
      console.error('Error updating loan:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEditLoan = () => {
    setIsEditingLoan(false);
    setValidationErrors({});
    clearMessages();
  };

  const handleMarkPaidOff = async () => {
    const newPaidOffStatus = !loanData.is_paid_off;
    const confirmMessage = newPaidOffStatus
      ? 'Are you sure you want to mark this loan as paid off?'
      : 'Are you sure you want to reactivate this loan?';
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    clearMessages();
    setLoading(true);

    try {
      await markPaidOff(loanData.id, newPaidOffStatus);
      
      // Update local state
      setLoanData({
        ...loanData,
        is_paid_off: newPaidOffStatus ? 1 : 0
      });
      
      showSuccess(newPaidOffStatus ? 'Loan marked as paid off' : 'Loan reactivated');
      
      // Notify parent to refresh
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      const errorMessage = err.message || 'Failed to update paid-off status';
      setError(errorMessage);
      console.error('Error updating paid-off status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditBalance = (balanceEntry) => {
    setEditingBalanceId(balanceEntry.id);
    setBalanceFormData({
      year: balanceEntry.year,
      month: balanceEntry.month,
      remaining_balance: balanceEntry.remaining_balance.toString(),
      rate: balanceEntry.rate.toString()
    });
    setValidationErrors({});
    clearMessages();
  };

  const handleSaveBalance = async (balanceId) => {
    clearMessages();
    
    // Validate balance entry
    const errors = {};
    
    const balanceError = validateAmount(balanceFormData.remaining_balance);
    if (balanceError) {
      errors.remaining_balance = balanceError;
    }
    
    const rateError = validateAmount(balanceFormData.rate);
    if (rateError) {
      errors.rate = rateError;
    }
    
    if (balanceFormData.month < 1 || balanceFormData.month > 12) {
      errors.month = 'Month must be between 1 and 12';
    }
    
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setError('Please fix the validation errors before saving.');
      return;
    }

    setLoading(true);

    try {
      await createOrUpdateBalance({
        id: balanceId,
        loan_id: loanData.id,
        year: parseInt(balanceFormData.year),
        month: parseInt(balanceFormData.month),
        remaining_balance: parseFloat(balanceFormData.remaining_balance),
        rate: parseFloat(balanceFormData.rate)
      });
      
      // Refresh balance history
      await fetchBalanceHistory();
      
      setEditingBalanceId(null);
      showSuccess('Balance entry updated successfully');
      
      // Notify parent to refresh
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      const errorMessage = err.message || 'Failed to update balance entry';
      setError(errorMessage);
      console.error('Error updating balance:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEditBalance = () => {
    setEditingBalanceId(null);
    setValidationErrors({});
    clearMessages();
  };

  const handleDeleteBalance = async (balanceId) => {
    if (!window.confirm('Are you sure you want to delete this balance entry?')) {
      return;
    }

    clearMessages();
    setLoading(true);

    try {
      await deleteBalance(balanceId);
      
      // Refresh balance history
      await fetchBalanceHistory();
      
      showSuccess('Balance entry deleted successfully');
      
      // Notify parent to refresh
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      const errorMessage = err.message || 'Failed to delete balance entry';
      setError(errorMessage);
      console.error('Error deleting balance:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleShowAddBalanceForm = () => {
    setShowAddBalanceForm(true);
    setBalanceFormData({
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      remaining_balance: '',
      rate: ''
    });
    setValidationErrors({});
    clearMessages();
  };

  const handleAddBalance = async () => {
    clearMessages();
    
    // Validate balance entry
    const errors = {};
    
    const balanceError = validateAmount(balanceFormData.remaining_balance);
    if (balanceError) {
      errors.remaining_balance = balanceError;
    }
    
    const rateError = validateAmount(balanceFormData.rate);
    if (rateError) {
      errors.rate = rateError;
    }
    
    if (balanceFormData.month < 1 || balanceFormData.month > 12) {
      errors.month = 'Month must be between 1 and 12';
    }
    
    if (!balanceFormData.year || balanceFormData.year < 1900 || balanceFormData.year > 2100) {
      errors.year = 'Please enter a valid year';
    }
    
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setError('Please fix the validation errors before saving.');
      return;
    }

    setLoading(true);

    try {
      // Check if entry already exists
      const existingEntry = balanceHistory.find(
        entry => entry.year === parseInt(balanceFormData.year) && 
                 entry.month === parseInt(balanceFormData.month)
      );
      
      if (existingEntry) {
        setError(`A balance entry already exists for ${formatMonthYear(balanceFormData.year, balanceFormData.month)}. It will be updated with the new values.`);
      }
      
      await createOrUpdateBalance({
        loan_id: loanData.id,
        year: parseInt(balanceFormData.year),
        month: parseInt(balanceFormData.month),
        remaining_balance: parseFloat(balanceFormData.remaining_balance),
        rate: parseFloat(balanceFormData.rate)
      });
      
      // Refresh balance history
      await fetchBalanceHistory();
      
      setShowAddBalanceForm(false);
      showSuccess(existingEntry ? 'Balance entry updated successfully' : 'Balance entry added successfully');
      
      // Auto-scroll to the newly added entry (most recent will be at top)
      setTimeout(() => {
        if (newEntryRef.current) {
          newEntryRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
      
      // Notify parent to refresh
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      const errorMessage = err.message || 'Failed to add balance entry';
      setError(errorMessage);
      console.error('Error adding balance:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAddBalance = () => {
    setShowAddBalanceForm(false);
    setValidationErrors({});
    clearMessages();
  };

  const handleClose = () => {
    // Reset all state
    setIsEditingLoan(false);
    setEditingBalanceId(null);
    setShowAddBalanceForm(false);
    setValidationErrors({});
    clearMessages();
    
    onClose();
  };

  if (!isOpen || !loanData) {
    return null;
  }

  return (
    <div className="loan-detail-overlay" onClick={handleClose}>
      <div className="loan-detail-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="loan-detail-header">
          <button className="loan-detail-back-button" onClick={handleClose}>
            ← Back
          </button>
          <h2>{loanData.name}</h2>
          <button className="loan-detail-close" onClick={handleClose}>✕</button>
        </div>

        {/* Messages */}
        {error && (
          <div className="loan-detail-error">{error}</div>
        )}
        {successMessage && (
          <div className="loan-detail-success">{successMessage}</div>
        )}

        <div className="loan-detail-content">
          {/* Loan Summary Card */}
          <div className="loan-summary-card">
            <h3>Loan Summary</h3>
            
            {isEditingLoan ? (
              <div className="loan-edit-form">
                <div className="loan-input-group">
                  <label>Loan Name *</label>
                  <input
                    type="text"
                    value={loanFormData.name}
                    onChange={(e) => setLoanFormData({ ...loanFormData, name: e.target.value })}
                    className={validationErrors.name ? 'input-error' : ''}
                    disabled={loading}
                  />
                  {validationErrors.name && (
                    <span className="validation-error">{validationErrors.name}</span>
                  )}
                </div>
                
                <div className="loan-input-group">
                  <label>Notes</label>
                  <textarea
                    value={loanFormData.notes}
                    onChange={(e) => setLoanFormData({ ...loanFormData, notes: e.target.value })}
                    rows="3"
                    disabled={loading}
                  />
                </div>
                
                <div className="loan-edit-actions">
                  <button
                    className="loan-save-button"
                    onClick={handleSaveLoanDetails}
                    disabled={loading}
                  >
                    {loading ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    className="loan-cancel-button"
                    onClick={handleCancelEditLoan}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="loan-summary-grid">
                  <div className="loan-summary-item">
                    <span className="loan-summary-label">Original Amount:</span>
                    <span className="loan-summary-value">{formatCurrency(loanData.initial_balance)}</span>
                  </div>
                  
                  <div className="loan-summary-item">
                    <span className="loan-summary-label">Current Balance:</span>
                    <span className="loan-summary-value loan-current-balance">
                      {formatCurrency(currentBalance)}
                    </span>
                  </div>
                  
                  {/* Only show "Total Paid Down" for traditional loans */}
                  {loanData.loan_type !== 'line_of_credit' && (
                    <div className="loan-summary-item">
                      <span className="loan-summary-label">Total Paid Down:</span>
                      <span className="loan-summary-value loan-paid-down">
                        {formatCurrency(totalPaidDown)}
                      </span>
                    </div>
                  )}
                  
                  <div className="loan-summary-item">
                    <span className="loan-summary-label">Current Interest Rate:</span>
                    <span className="loan-summary-value">
                      {currentRate > 0 ? `${currentRate}%` : 'N/A'}
                    </span>
                  </div>
                  
                  <div className="loan-summary-item">
                    <span className="loan-summary-label">Start Date:</span>
                    <span className="loan-summary-value">{formatDate(loanData.start_date)}</span>
                  </div>
                  
                  <div className="loan-summary-item">
                    <span className="loan-summary-label">Type:</span>
                    <span className="loan-summary-value">
                      {(loanData.loan_type || 'loan') === 'line_of_credit' ? 'Line of Credit' : 'Loan'}
                    </span>
                  </div>
                  
                  {loanData.loan_type === 'loan' && loanData.estimated_months_left && (
                    <div className="loan-summary-item">
                      <span className="loan-summary-label">Estimated Months Left:</span>
                      <span className="loan-summary-value loan-months-left">
                        {loanData.estimated_months_left} months
                      </span>
                    </div>
                  )}
                  
                  {loanData.notes && (
                    <div className="loan-summary-item loan-summary-notes">
                      <span className="loan-summary-label">Notes:</span>
                      <span className="loan-summary-value">{loanData.notes}</span>
                    </div>
                  )}
                </div>
                
                {/* Progress Indicator - Only show for traditional loans */}
                {loanData.loan_type !== 'line_of_credit' && (
                  <div className="loan-progress-section">
                    <div className="loan-progress-label">
                      Paydown Progress: {paydownPercentage.toFixed(1)}%
                    </div>
                    <div className="loan-progress-bar">
                      <div 
                        className="loan-progress-fill" 
                        style={{ width: `${Math.min(paydownPercentage, 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Balance & Rate Line Graph - Only show for lines of credit with history */}
                {loanData.loan_type === 'line_of_credit' && balanceHistory.length > 0 && (
                  <div className="loan-balance-chart-section">
                    <div className="loan-balance-chart-header">
                      <div className="loan-balance-chart-label">
                        Balance & Interest Rate Over Time
                      </div>
                      <div className="loan-balance-chart-legend">
                        <span className="legend-item">
                          <span className="legend-color" style={{ backgroundColor: '#007bff' }}></span>
                          Balance
                        </span>
                        <span className="legend-item">
                          <span className="legend-color" style={{ backgroundColor: '#dc3545' }}></span>
                          Interest Rate
                        </span>
                      </div>
                    </div>
                    <div className="loan-balance-line-chart">
                      {(() => {
                        // Prepare data in chronological order (oldest first)
                        const chartData = [...balanceHistory].reverse();
                        const maxBalance = Math.max(
                          loanData.initial_balance,
                          ...chartData.map(entry => entry.remaining_balance),
                          1
                        );
                        const maxRate = Math.max(...chartData.map(entry => entry.rate), 1);
                        
                        const chartWidth = 600;
                        const chartHeight = 200;
                        const padding = { top: 20, right: 70, bottom: 40, left: 60 };
                        const graphWidth = chartWidth - padding.left - padding.right;
                        const graphHeight = chartHeight - padding.top - padding.bottom;
                        
                        // Calculate points for balance line
                        const balancePoints = chartData.map((entry, index) => {
                          const x = padding.left + (index / (chartData.length - 1 || 1)) * graphWidth;
                          const y = padding.top + graphHeight - (entry.remaining_balance / maxBalance) * graphHeight;
                          return { x, y, entry };
                        });
                        
                        // Calculate points for rate line
                        const ratePoints = chartData.map((entry, index) => {
                          const x = padding.left + (index / (chartData.length - 1 || 1)) * graphWidth;
                          const y = padding.top + graphHeight - (entry.rate / maxRate) * graphHeight;
                          return { x, y, entry };
                        });
                        
                        // Create paths
                        const balanceLinePath = balancePoints.map((point, index) => 
                          `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
                        ).join(' ');
                        
                        const rateLinePath = ratePoints.map((point, index) => 
                          `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
                        ).join(' ');
                        
                        const areaPath = `${balanceLinePath} L ${balancePoints[balancePoints.length - 1].x} ${chartHeight - padding.bottom} L ${padding.left} ${chartHeight - padding.bottom} Z`;
                        
                        return (
                          <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="xMidYMid meet">
                            {/* Left Y-axis grid lines (Balance) */}
                            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                              const y = padding.top + graphHeight * (1 - ratio);
                              const value = maxBalance * ratio;
                              return (
                                <g key={`balance-${ratio}`}>
                                  <line
                                    x1={padding.left}
                                    y1={y}
                                    x2={chartWidth - padding.right}
                                    y2={y}
                                    stroke="#e0e0e0"
                                    strokeWidth="1"
                                  />
                                  <text
                                    x={padding.left - 10}
                                    y={y + 4}
                                    textAnchor="end"
                                    fontSize="11"
                                    fill="#007bff"
                                  >
                                    ${formatCurrency(value)}
                                  </text>
                                </g>
                              );
                            })}
                            
                            {/* Right Y-axis labels (Rate) */}
                            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                              const y = padding.top + graphHeight * (1 - ratio);
                              const value = maxRate * ratio;
                              return (
                                <text
                                  key={`rate-${ratio}`}
                                  x={chartWidth - padding.right + 10}
                                  y={y + 4}
                                  textAnchor="start"
                                  fontSize="11"
                                  fill="#dc3545"
                                >
                                  {value.toFixed(1)}%
                                </text>
                              );
                            })}
                            
                            {/* Area under balance line */}
                            <path
                              d={areaPath}
                              fill="url(#lineGradient)"
                              opacity="0.2"
                            />
                            
                            {/* Balance line */}
                            <path
                              d={balanceLinePath}
                              fill="none"
                              stroke="#007bff"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            
                            {/* Rate line */}
                            <path
                              d={rateLinePath}
                              fill="none"
                              stroke="#dc3545"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeDasharray="5,5"
                            />
                            
                            {/* Balance data points */}
                            {balancePoints.map((point, index) => (
                              <circle
                                key={`balance-${index}`}
                                cx={point.x}
                                cy={point.y}
                                r="5"
                                fill="#007bff"
                                stroke="white"
                                strokeWidth="2"
                                style={{ cursor: 'pointer' }}
                              >
                                <title>
                                  {formatMonthYear(point.entry.year, point.entry.month)}: ${formatCurrency(point.entry.remaining_balance)} @ {point.entry.rate}%
                                </title>
                              </circle>
                            ))}
                            
                            {/* Rate data points */}
                            {ratePoints.map((point, index) => (
                              <circle
                                key={`rate-${index}`}
                                cx={point.x}
                                cy={point.y}
                                r="4"
                                fill="#dc3545"
                                stroke="white"
                                strokeWidth="2"
                                style={{ cursor: 'pointer' }}
                              >
                                <title>
                                  {formatMonthYear(point.entry.year, point.entry.month)}: {point.entry.rate}%
                                </title>
                              </circle>
                            ))}
                            
                            {/* X-axis labels */}
                            {balancePoints.map((point, index) => {
                              if (chartData.length <= 6 || index % 2 === 0) {
                                return (
                                  <text
                                    key={index}
                                    x={point.x}
                                    y={chartHeight - padding.bottom + 20}
                                    textAnchor="middle"
                                    fontSize="11"
                                    fill="#666"
                                  >
                                    {new Date(point.entry.year, point.entry.month - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                                  </text>
                                );
                              }
                              return null;
                            })}
                            
                            {/* Gradient definition */}
                            <defs>
                              <linearGradient id="lineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#007bff" stopOpacity="0.5" />
                                <stop offset="100%" stopColor="#007bff" stopOpacity="0.1" />
                              </linearGradient>
                            </defs>
                          </svg>
                        );
                      })()}
                    </div>
                  </div>
                )}
                
                {/* Action Buttons */}
                <div className="loan-summary-actions">
                  <button
                    className="loan-edit-details-button"
                    onClick={handleEditLoanDetails}
                    disabled={loading}
                  >
                    ✏️ Edit Loan Details
                  </button>
                  <button
                    className={`loan-paid-off-button ${loanData.is_paid_off ? 'active' : ''}`}
                    onClick={handleMarkPaidOff}
                    disabled={loading}
                  >
                    {loanData.is_paid_off ? '✓ Paid Off' : 'Mark as Paid Off'}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Balance History Section */}
          <div className="loan-balance-history-section" ref={balanceHistoryRef}>
            <div className="loan-balance-history-header">
              <h3>Balance History</h3>
              <button
                className="loan-add-balance-button"
                onClick={handleShowAddBalanceForm}
                disabled={loading || showAddBalanceForm}
              >
                + Add Balance Entry
              </button>
            </div>
            
            {/* Add Balance Form */}
            {showAddBalanceForm && (
              <div className="loan-add-balance-form">
                <h4>Add Balance Entry</h4>
                <div className="balance-form-grid">
                  <div className="balance-input-group">
                    <label>Year *</label>
                    <input
                      type="number"
                      value={balanceFormData.year}
                      onChange={(e) => setBalanceFormData({ ...balanceFormData, year: e.target.value })}
                      min="1900"
                      max="2100"
                      className={validationErrors.year ? 'input-error' : ''}
                      disabled={loading}
                    />
                    {validationErrors.year && (
                      <span className="validation-error">{validationErrors.year}</span>
                    )}
                  </div>
                  
                  <div className="balance-input-group">
                    <label>Month *</label>
                    <select
                      value={balanceFormData.month}
                      onChange={(e) => setBalanceFormData({ ...balanceFormData, month: e.target.value })}
                      className={validationErrors.month ? 'input-error' : ''}
                      disabled={loading}
                    >
                      <option value="1">January</option>
                      <option value="2">February</option>
                      <option value="3">March</option>
                      <option value="4">April</option>
                      <option value="5">May</option>
                      <option value="6">June</option>
                      <option value="7">July</option>
                      <option value="8">August</option>
                      <option value="9">September</option>
                      <option value="10">October</option>
                      <option value="11">November</option>
                      <option value="12">December</option>
                    </select>
                    {validationErrors.month && (
                      <span className="validation-error">{validationErrors.month}</span>
                    )}
                  </div>
                  
                  <div className="balance-input-group">
                    <label>Remaining Balance *</label>
                    <input
                      type="number"
                      value={balanceFormData.remaining_balance}
                      onChange={(e) => setBalanceFormData({ ...balanceFormData, remaining_balance: e.target.value })}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      className={validationErrors.remaining_balance ? 'input-error' : ''}
                      disabled={loading}
                    />
                    {validationErrors.remaining_balance && (
                      <span className="validation-error">{validationErrors.remaining_balance}</span>
                    )}
                  </div>
                  
                  <div className="balance-input-group">
                    <label>Interest Rate (%) *</label>
                    <input
                      type="number"
                      value={balanceFormData.rate}
                      onChange={(e) => setBalanceFormData({ ...balanceFormData, rate: e.target.value })}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      className={validationErrors.rate ? 'input-error' : ''}
                      disabled={loading}
                    />
                    {validationErrors.rate && (
                      <span className="validation-error">{validationErrors.rate}</span>
                    )}
                  </div>
                </div>
                
                <div className="balance-form-actions">
                  <button
                    className="balance-form-submit-button"
                    onClick={handleAddBalance}
                    disabled={loading}
                  >
                    {loading ? 'Saving...' : 'Add Balance Entry'}
                  </button>
                  <button
                    className="balance-form-cancel-button"
                    onClick={handleCancelAddBalance}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            
            {loading && balanceHistory.length === 0 ? (
              <div className="loan-loading">Loading balance history...</div>
            ) : balanceHistory.length === 0 ? (
              <div className="loan-empty-history">
                No balance entries yet. Add your first balance entry below.
              </div>
            ) : (
              <div className="loan-balance-table-container">
                <table className="loan-balance-table">
                  <thead>
                    <tr>
                      <th>Month/Year</th>
                      <th>Remaining Balance</th>
                      <th>Interest Rate</th>
                      <th>Balance Change</th>
                      <th>Rate Change</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balanceHistory.map((entry, index) => {
                      const isEditing = editingBalanceId === entry.id;
                      
                      return (
                        <tr key={entry.id} ref={index === 0 ? newEntryRef : null}>
                          <td>{formatMonthYear(entry.year, entry.month)}</td>
                          
                          {isEditing ? (
                            <>
                              <td>
                                <input
                                  type="number"
                                  value={balanceFormData.remaining_balance}
                                  onChange={(e) => setBalanceFormData({ 
                                    ...balanceFormData, 
                                    remaining_balance: e.target.value 
                                  })}
                                  step="0.01"
                                  min="0"
                                  className={validationErrors.remaining_balance ? 'input-error' : ''}
                                  disabled={loading}
                                />
                                {validationErrors.remaining_balance && (
                                  <div className="validation-error-small">
                                    {validationErrors.remaining_balance}
                                  </div>
                                )}
                              </td>
                              <td>
                                <input
                                  type="number"
                                  value={balanceFormData.rate}
                                  onChange={(e) => setBalanceFormData({ 
                                    ...balanceFormData, 
                                    rate: e.target.value 
                                  })}
                                  step="0.01"
                                  min="0"
                                  className={validationErrors.rate ? 'input-error' : ''}
                                  disabled={loading}
                                />
                                {validationErrors.rate && (
                                  <div className="validation-error-small">
                                    {validationErrors.rate}
                                  </div>
                                )}
                              </td>
                              <td colSpan="2">
                                <div className="balance-edit-actions">
                                  <button
                                    className="balance-save-button"
                                    onClick={() => handleSaveBalance(entry.id)}
                                    disabled={loading}
                                  >
                                    ✓
                                  </button>
                                  <button
                                    className="balance-cancel-button"
                                    onClick={handleCancelEditBalance}
                                    disabled={loading}
                                  >
                                    ✕
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td>{formatCurrency(entry.remaining_balance)}</td>
                              <td>{entry.rate}%</td>
                              <td>
                                {entry.balanceChange !== null && entry.balanceChange !== undefined ? (
                                  <span className={`balance-change ${entry.balanceChange < 0 ? 'decrease' : entry.balanceChange > 0 ? 'increase' : 'no-change'}`}>
                                    {entry.balanceChange < 0 ? '↓' : entry.balanceChange > 0 ? '↑' : '—'}
                                    {' '}
                                    {formatCurrency(Math.abs(entry.balanceChange))}
                                  </span>
                                ) : (
                                  <span className="no-change">—</span>
                                )}
                              </td>
                              <td>
                                {entry.rateChange !== null && entry.rateChange !== undefined ? (
                                  <span className={`rate-change ${entry.rateChange < 0 ? 'decrease' : entry.rateChange > 0 ? 'increase' : 'no-change'}`}>
                                    {entry.rateChange < 0 ? '↓' : entry.rateChange > 0 ? '↑' : '—'}
                                    {' '}
                                    {Math.abs(entry.rateChange).toFixed(2)}%
                                  </span>
                                ) : (
                                  <span className="no-change">—</span>
                                )}
                              </td>
                            </>
                          )}
                          
                          {!isEditing && (
                            <td>
                              <div className="balance-actions">
                                <button
                                  className="balance-edit-button"
                                  onClick={() => handleEditBalance(entry)}
                                  disabled={loading}
                                  title="Edit"
                                >
                                  ✏️
                                </button>
                                <button
                                  className="balance-delete-button"
                                  onClick={() => handleDeleteBalance(entry.id)}
                                  disabled={loading}
                                  title="Delete"
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoanDetailView;
