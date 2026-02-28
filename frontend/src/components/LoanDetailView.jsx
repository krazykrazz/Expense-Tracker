import { useState, useEffect, useRef } from 'react';
import './LoanDetailView.css';
import { updateLoan, markPaidOff } from '../services/loanApi';
import { getBalanceHistory, createOrUpdateBalance, deleteBalance } from '../services/loanBalanceApi';
import { getPayments, deletePayment, getCalculatedBalance } from '../services/loanPaymentApi';
import { getFixedExpensesByLoan } from '../services/fixedExpenseApi';
import { validateName, validateAmount } from '../utils/validation';
import { formatCurrency, formatDate, formatMonthYear } from '../utils/formatters';
import { createLogger } from '../utils/logger';
import MortgageDetailSection from './MortgageDetailSection';
import MortgageInsightsPanel from './MortgageInsightsPanel';
import EquityChart from './EquityChart';
import AmortizationChart from './AmortizationChart';
import LoanPaymentForm from './LoanPaymentForm';
import LoanPaymentHistory from './LoanPaymentHistory';
import PaymentBalanceChart from './PaymentBalanceChart';
import MigrationUtility from './MigrationUtility';

const logger = createLogger('LoanDetailView');

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

  // Payment tracking state (for loans and mortgages)
  const [payments, setPayments] = useState([]);
  const [calculatedBalanceData, setCalculatedBalanceData] = useState(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [loadingPayments, setLoadingPayments] = useState(false);

  // Migration utility state (for loans and mortgages with existing balance entries)
  const [showMigrationUtility, setShowMigrationUtility] = useState(false);

  // Linked fixed expenses state
  const [linkedFixedExpenses, setLinkedFixedExpenses] = useState([]);
  const [loadingFixedExpenses, setLoadingFixedExpenses] = useState(false);

  // Derive paymentDueDay from linked fixed expenses (Requirements 1.1, 1.2)
  const paymentDueDay = linkedFixedExpenses.length > 0 
    ? linkedFixedExpenses[0].payment_due_day 
    : null;

  // Determine if this loan uses payment-based tracking
  // Requirement 5.1: loans and mortgages use payment tracking
  // Requirement 5.2: lines of credit use balance tracking
  const usesPaymentTracking = loanData?.loan_type === 'loan' || loanData?.loan_type === 'mortgage';

  // Fetch balance history when modal opens or loan changes
  useEffect(() => {
    if (isOpen && loan) {
      setLoanData(loan);
      setLoanFormData({
        name: loan.name,
        notes: loan.notes || ''
      });
      
      // Fetch appropriate data based on loan type
      if (loan.loan_type === 'line_of_credit') {
        fetchBalanceHistory();
      } else {
        // For loans and mortgages, fetch payment data
        fetchPaymentData();
        // Also fetch balance history for historical reference
        fetchBalanceHistory();
      }
      
      // Fetch linked fixed expenses
      fetchLinkedFixedExpenses();
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
      logger.error('Error fetching balance history:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch payment data for loans and mortgages
  // Requirements: 1.2, 2.1
  const fetchPaymentData = async () => {
    if (!loan || !loan.id) return;
    
    setLoadingPayments(true);
    setError(null);

    try {
      // Fetch payments and calculated balance in parallel
      const [paymentsData, balanceData] = await Promise.all([
        getPayments(loan.id),
        getCalculatedBalance(loan.id)
      ]);
      
      setPayments(paymentsData || []);
      setCalculatedBalanceData(balanceData);
    } catch (err) {
      const errorMessage = err.message || 'Failed to load payment data';
      setError(errorMessage);
      logger.error('Error fetching payment data:', err);
    } finally {
      setLoadingPayments(false);
    }
  };

  // Fetch linked fixed expenses
  const fetchLinkedFixedExpenses = async () => {
    if (!loan || !loan.id) return;
    
    setLoadingFixedExpenses(true);

    try {
      const fixedExpenses = await getFixedExpensesByLoan(loan.id);
      // Get unique expense names, preferring current month's entry over future months
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // 1-12
      
      const expensesByName = new Map();
      
      for (const expense of fixedExpenses) {
        const existing = expensesByName.get(expense.name);
        if (!existing) {
          expensesByName.set(expense.name, expense);
        } else {
          // Prefer current month's entry over any other
          const isCurrentMonth = expense.year === currentYear && expense.month === currentMonth;
          const existingIsCurrentMonth = existing.year === currentYear && existing.month === currentMonth;
          
          if (isCurrentMonth && !existingIsCurrentMonth) {
            expensesByName.set(expense.name, expense);
          }
        }
      }
      
      const uniqueExpenses = Array.from(expensesByName.values());
      
      setLinkedFixedExpenses(uniqueExpenses);
    } catch (err) {
      logger.error('Error fetching linked fixed expenses:', err);
      setLinkedFixedExpenses([]);
    } finally {
      setLoadingFixedExpenses(false);
    }
  };

  // Calculate derived values
  // For payment-tracked loans, use calculated balance from payments
  // For lines of credit, use balance history
  const currentBalance = usesPaymentTracking && calculatedBalanceData
    ? calculatedBalanceData.currentBalance
    : (loanData?.currentBalance || loanData?.initial_balance || 0);
  
  const totalPayments = calculatedBalanceData?.totalPayments || 0;
  const paymentCount = calculatedBalanceData?.paymentCount || 0;
  
  const totalPaidDown = usesPaymentTracking
    ? totalPayments
    : (loanData?.initial_balance || 0) - currentBalance;
  
  const paydownPercentage = loanData?.initial_balance > 0 
    ? (totalPaidDown / loanData.initial_balance) * 100 
    : 0;
  const currentRate = loanData?.currentRate || 0;
  
  // Check if loan has a fixed interest rate
  const hasFixedRate = loanData?.fixed_interest_rate !== null && loanData?.fixed_interest_rate !== undefined;
  const fixedRate = loanData?.fixed_interest_rate;



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
      logger.error('Error updating loan:', err);
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
      logger.error('Error updating paid-off status:', err);
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
      logger.error('Error updating balance:', err);
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
      logger.error('Error deleting balance:', err);
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
    
    // Only validate rate if loan doesn't have a fixed rate
    if (!hasFixedRate) {
      const rateError = validateAmount(balanceFormData.rate);
      if (rateError) {
        errors.rate = rateError;
      }
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
      
      // Build balance data - only include rate if loan doesn't have fixed rate
      const balanceData = {
        loan_id: loanData.id,
        year: parseInt(balanceFormData.year),
        month: parseInt(balanceFormData.month),
        remaining_balance: parseFloat(balanceFormData.remaining_balance)
      };
      
      // Only include rate if loan doesn't have a fixed rate
      if (!hasFixedRate) {
        balanceData.rate = parseFloat(balanceFormData.rate);
      }
      
      await createOrUpdateBalance(balanceData);
      
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
      logger.error('Error adding balance:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAddBalance = () => {
    setShowAddBalanceForm(false);
    setValidationErrors({});
    clearMessages();
  };

  // Payment tracking handlers (for loans and mortgages)
  // Requirement 6.1: Show "Log Payment" button
  const handleShowPaymentForm = () => {
    setShowPaymentForm(true);
    setEditingPayment(null);
    clearMessages();
  };

  // Handle payment recorded (create or update)
  const handlePaymentRecorded = async () => {
    setShowPaymentForm(false);
    setEditingPayment(null);
    showSuccess(editingPayment ? 'Payment updated successfully' : 'Payment recorded successfully');
    
    // Refresh payment data
    await fetchPaymentData();
    
    // Notify parent to refresh
    if (onUpdate) {
      onUpdate();
    }
  };

  // Handle payment edit
  const handleEditPayment = (payment) => {
    setEditingPayment(payment);
    setShowPaymentForm(true);
    clearMessages();
  };

  // Handle payment delete
  // Requirement 1.4: Delete payment and recalculate balance
  const handleDeletePayment = async (paymentId) => {
    clearMessages();
    setLoadingPayments(true);

    try {
      await deletePayment(loanData.id, paymentId);
      showSuccess('Payment deleted successfully');
      
      // Refresh payment data
      await fetchPaymentData();
      
      // Notify parent to refresh
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      const errorMessage = err.message || 'Failed to delete payment';
      setError(errorMessage);
      logger.error('Error deleting payment:', err);
    } finally {
      setLoadingPayments(false);
    }
  };

  // Cancel payment form
  const handleCancelPaymentForm = () => {
    setShowPaymentForm(false);
    setEditingPayment(null);
    clearMessages();
  };

  // Migration utility handlers
  // Requirement 4.1, 4.5: Migration UI for converting balance entries to payments
  const handleShowMigrationUtility = () => {
    setShowMigrationUtility(true);
    clearMessages();
  };

  const handleMigrationComplete = async (result) => {
    showSuccess(`Migration complete: ${result.summary.totalConverted} payment(s) created`);
    
    // Refresh payment data to show newly created payments
    await fetchPaymentData();
    
    // Notify parent to refresh
    if (onUpdate) {
      onUpdate();
    }
  };

  const handleCloseMigrationUtility = () => {
    setShowMigrationUtility(false);
  };

  const handleClose = () => {
    // Reset all state
    setIsEditingLoan(false);
    setEditingBalanceId(null);
    setShowAddBalanceForm(false);
    setShowPaymentForm(false);
    setEditingPayment(null);
    setShowMigrationUtility(false);
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
                      <span className="loan-summary-label">
                        {usesPaymentTracking ? 'Total Payments:' : 'Total Paid Down:'}
                      </span>
                      <span className="loan-summary-value loan-paid-down">
                        {formatCurrency(totalPaidDown)}
                        {usesPaymentTracking && paymentCount > 0 && (
                          <span className="payment-count-badge">
                            ({paymentCount} payment{paymentCount !== 1 ? 's' : ''})
                          </span>
                        )}
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
                      {loanData.loan_type === 'mortgage' ? 'Mortgage' : 
                       loanData.loan_type === 'line_of_credit' ? 'Line of Credit' : 'Loan'}
                      {/* Fixed Rate Badge - Requirement 3.4 */}
                      {hasFixedRate && (
                        <span className="fixed-rate-badge-summary">🔒 Fixed Rate</span>
                      )}
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
                
                {/* Progress Indicator - Only show for traditional loans (not lines of credit or mortgages) */}
                {loanData.loan_type !== 'line_of_credit' && loanData.loan_type !== 'mortgage' && (
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
                                    {formatCurrency(value)}
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
                                  {formatMonthYear(point.entry.year, point.entry.month)}: {formatCurrency(point.entry.remaining_balance)} @ {point.entry.rate}%
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

          {/* Linked Fixed Expenses Section */}
          {linkedFixedExpenses.length > 0 && (
            <div className="loan-linked-expenses-section">
              <h3>Linked Fixed Expenses</h3>
              <div className="linked-expenses-list">
                {linkedFixedExpenses.map((expense) => (
                  <div key={expense.id} className="linked-expense-item">
                    <div className="linked-expense-info">
                      <span className="linked-expense-name">{expense.name}</span>
                      <span className="linked-expense-amount">{formatCurrency(expense.amount)}</span>
                    </div>
                    {expense.payment_due_day ? (
                      <div className="linked-expense-due">
                        Due: Day {expense.payment_due_day} of month
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="linked-expenses-note">
                These fixed expenses are automatically linked to this loan. Manage them in the Fixed Expenses modal.
              </div>
            </div>
          )}

          {/* Mortgage-Specific Sections - Requirements 8.1, 8.2, 8.3, 8.4, 8.5 */}
          {loanData.loan_type === 'mortgage' && (
            <>
              {/* Mortgage Detail Section - Requirements 8.1, 8.2, 8.5, 7.1 */}
              <MortgageDetailSection mortgage={loanData} />

              {/* Mortgage Insights Panel - Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 8.1 */}
              <MortgageInsightsPanel 
                mortgageId={loanData.id}
                mortgageData={loanData}
                paymentDueDay={paymentDueDay}
              />

              {/* Equity Chart - Requirements 4.2, 4.3, 8.3 */}
              {loanData.estimated_property_value && (
                <EquityChart 
                  loanId={loanData.id}
                  estimatedPropertyValue={loanData.estimated_property_value}
                  currentBalance={currentBalance}
                />
              )}

              {/* Amortization Chart - Requirements 5.5, 6.3, 8.4 */}
              <AmortizationChart 
                loanId={loanData.id}
                currentBalance={currentBalance}
                currentRate={currentRate}
              />

              {/* Rate History Chart for Variable Rate Mortgages - Requirement 3.3 */}
              {loanData.rate_type === 'variable' && balanceHistory.length > 0 && (
                <div className="loan-balance-chart-section">
                  <div className="loan-balance-chart-header">
                    <div className="loan-balance-chart-label">
                      Interest Rate History
                    </div>
                    <div className="loan-balance-chart-legend">
                      <span className="legend-item">
                        <span className="legend-color" style={{ backgroundColor: '#dc3545' }}></span>
                        Interest Rate
                      </span>
                    </div>
                  </div>
                  <div className="loan-balance-line-chart">
                    {(() => {
                      const chartData = [...balanceHistory].reverse();
                      const maxRate = Math.max(...chartData.map(entry => entry.rate), 1);
                      const minRate = Math.min(...chartData.map(entry => entry.rate), 0);
                      const rateRange = maxRate - minRate || 1;
                      
                      const chartWidth = 600;
                      const chartHeight = 180;
                      const padding = { top: 20, right: 50, bottom: 40, left: 50 };
                      const graphWidth = chartWidth - padding.left - padding.right;
                      const graphHeight = chartHeight - padding.top - padding.bottom;
                      
                      const ratePoints = chartData.map((entry, index) => {
                        const x = padding.left + (index / (chartData.length - 1 || 1)) * graphWidth;
                        const y = padding.top + graphHeight - ((entry.rate - minRate) / rateRange) * graphHeight;
                        return { x, y, entry };
                      });
                      
                      const rateLinePath = ratePoints.map((point, index) => 
                        `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
                      ).join(' ');
                      
                      return (
                        <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="xMidYMid meet">
                          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                            const y = padding.top + graphHeight * (1 - ratio);
                            const value = minRate + rateRange * ratio;
                            return (
                              <g key={`rate-grid-${ratio}`}>
                                <line
                                  x1={padding.left}
                                  y1={y}
                                  x2={chartWidth - padding.right}
                                  y2={y}
                                  stroke="#e0e0e0"
                                  strokeWidth="1"
                                  strokeDasharray="4,4"
                                />
                                <text
                                  x={padding.left - 10}
                                  y={y + 4}
                                  textAnchor="end"
                                  fontSize="11"
                                  fill="#dc3545"
                                >
                                  {value.toFixed(2)}%
                                </text>
                              </g>
                            );
                          })}
                          
                          <path
                            d={rateLinePath}
                            fill="none"
                            stroke="#dc3545"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          
                          {ratePoints.map((point, index) => (
                            <circle
                              key={`rate-point-${index}`}
                              cx={point.x}
                              cy={point.y}
                              r="5"
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
                          
                          {ratePoints.map((point, index) => {
                            if (chartData.length <= 6 || index % 2 === 0) {
                              return (
                                <text
                                  key={`rate-label-${index}`}
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
                        </svg>
                      );
                    })()}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Payment Tracking Section - For loans and mortgages only */}
          {/* Requirements: 5.1, 5.2, 5.3, 6.1, 6.4, 6.5 */}
          {usesPaymentTracking && (
            <div className="loan-payment-tracking-section">
              <div className="loan-payment-tracking-header">
                <h3>Payment Tracking</h3>
                {!showPaymentForm && (
                  <button
                    className="loan-log-payment-button"
                    onClick={handleShowPaymentForm}
                    disabled={loading || loadingPayments}
                  >
                    + Log Payment
                  </button>
                )}
              </div>

              {/* Payment Summary - Requirement 6.4 */}
              <div className="loan-payment-summary">
                <div className="payment-summary-item">
                  <span className="payment-summary-label">Total Payments:</span>
                  <span className="payment-summary-value positive">
                    {formatCurrency(totalPayments)}
                  </span>
                </div>
                <div className="payment-summary-item">
                  <span className="payment-summary-label">Current Balance:</span>
                  <span className="payment-summary-value">
                    {formatCurrency(currentBalance)}
                  </span>
                </div>
                {/* Show calculated balance when there's a discrepancy (historical loan) */}
                {calculatedBalanceData?.hasDiscrepancy && (
                  <div className="payment-summary-item payment-summary-discrepancy">
                    <span className="payment-summary-label">Calculated from Payments:</span>
                    <span className="payment-summary-value muted">
                      {formatCurrency(calculatedBalanceData.calculatedBalance)}
                    </span>
                    <span className="payment-summary-note">
                      (Difference due to payments before tracking started)
                    </span>
                  </div>
                )}
                {calculatedBalanceData?.lastPaymentDate && (
                  <div className="payment-summary-item">
                    <span className="payment-summary-label">Last Payment:</span>
                    <span className="payment-summary-value">
                      {formatDate(calculatedBalanceData.lastPaymentDate)}
                    </span>
                  </div>
                )}
              </div>

              {/* Payment Form - Requirement 6.3 */}
              {showPaymentForm && (
                <LoanPaymentForm
                  loanId={loanData.id}
                  loanName={loanData.name}
                  loanType={loanData.loan_type}
                  currentBalance={currentBalance}
                  calculatedBalanceData={calculatedBalanceData}
                  editingPayment={editingPayment}
                  onPaymentRecorded={handlePaymentRecorded}
                  onCancel={handleCancelPaymentForm}
                  disabled={loading || loadingPayments}
                />
              )}

              {/* Payment History - Requirement 6.2 */}
              {/* Requirement 3.4: Hide LoanPaymentHistory for mortgages — PaymentTrackingHistory provides equivalent info */}
              {/* For historical loans with discrepancy, use actualBalance + totalPayments as starting point */}
              {loanData.loan_type !== 'mortgage' && (
                <LoanPaymentHistory
                  payments={payments}
                  initialBalance={
                    calculatedBalanceData?.hasDiscrepancy && calculatedBalanceData?.actualBalance != null
                      ? calculatedBalanceData.actualBalance + totalPayments
                      : loanData.initial_balance
                  }
                  loading={loadingPayments}
                  onEdit={handleEditPayment}
                  onDelete={handleDeletePayment}
                  disabled={loading || loadingPayments}
                />
              )}

              {/* Payment Balance Chart - Requirements 7.1, 7.2, 7.3 */}
              {/* Show chart when there are payments to visualize */}
              {/* For historical loans with discrepancy, use actualBalance + totalPayments as starting point */}
              {payments.length > 0 && (
                <PaymentBalanceChart
                  payments={payments}
                  initialBalance={
                    calculatedBalanceData?.hasDiscrepancy && calculatedBalanceData?.actualBalance != null
                      ? calculatedBalanceData.actualBalance + totalPayments
                      : loanData.initial_balance
                  }
                  loanName={loanData.name}
                />
              )}

              {/* Migration Utility - Requirements 4.1, 4.5 */}
              {/* Show migration option when there are balance entries that could be converted */}
              {/* Only show if no payments exist yet (migration hasn't been done) */}
              {balanceHistory.length >= 2 && payments.length === 0 && !showMigrationUtility && (
                <div className="loan-migration-prompt">
                  <div className="migration-prompt-content">
                    <span className="migration-prompt-icon">📊</span>
                    <div className="migration-prompt-text">
                      <span className="migration-prompt-title">Have existing balance entries?</span>
                      <span className="migration-prompt-description">
                        {balanceHistory.length} balance entries available for migration
                      </span>
                    </div>
                  </div>
                  <button
                    className="loan-migrate-button"
                    onClick={handleShowMigrationUtility}
                    disabled={loading || loadingPayments}
                  >
                    Migrate Balances
                  </button>
                </div>
              )}

              {/* Migration Utility Component */}
              {showMigrationUtility && (
                <MigrationUtility
                  loanId={loanData.id}
                  loanName={loanData.name}
                  onMigrationComplete={handleMigrationComplete}
                  onClose={handleCloseMigrationUtility}
                  disabled={loading || loadingPayments}
                />
              )}
            </div>
          )}

          {/* Balance History Section - For lines of credit only */}
          {/* Requirement 5.2, 5.3: Lines of credit continue using balance-based tracking */}
          {loanData.loan_type === 'line_of_credit' && (
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
                
                {/* Fixed Rate Indicator */}
                {hasFixedRate && (
                  <div className="fixed-rate-indicator">
                    <span className="fixed-rate-badge">🔒 Fixed Rate: {fixedRate}%</span>
                    <span className="fixed-rate-note">Interest rate will be automatically applied</span>
                  </div>
                )}
                
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
                  
                  {/* Only show rate input if loan doesn't have a fixed rate */}
                  {!hasFixedRate && (
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
                  )}
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
                      {/* Conditionally hide Rate Change column for fixed-rate loans - Requirement 3.1 */}
                      {!hasFixedRate && <th>Rate Change</th>}
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
                              <td colSpan={hasFixedRate ? 1 : 2}>
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
                              {/* Conditionally hide Rate Change cell for fixed-rate loans - Requirement 3.1 */}
                              {!hasFixedRate && (
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
                              )}
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
          )}
        </div>
      </div>
    </div>
  );
};

export default LoanDetailView;
