import { useState, useEffect } from 'react';
import './LoansModal.css';
import { getAllLoans, createLoan, updateLoan, deleteLoan } from '../services/loanApi';
import { validateName, validateAmount } from '../utils/validation';
import { formatCurrency, formatDate } from '../utils/formatters';
import LoanDetailView from './LoanDetailView';
import TotalDebtView from './TotalDebtView';

const LoansModal = ({ isOpen, onClose, year, month, onUpdate, highlightIds = [] }) => {
  const [loans, setLoans] = useState([]);
  const [activeTab, setActiveTab] = useState('active'); // 'active' or 'paidOff'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingLoanId, setEditingLoanId] = useState(null);
  const [selectedLoanId, setSelectedLoanId] = useState(null);
  const [showTotalDebt, setShowTotalDebt] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    initial_balance: '',
    start_date: '',
    loan_type: 'loan', // Default to 'loan'
    notes: ''
  });
  
  const [validationErrors, setValidationErrors] = useState({
    name: '',
    initial_balance: '',
    start_date: ''
  });

  // Fetch loans when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchLoans();
    }
  }, [isOpen]);

  const fetchLoans = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getAllLoans();
      setLoans(data || []);
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to load loans. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error fetching loans:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter loans by active/paid off status
  // Paid off loans go to paid off tab, everything else goes to active tab
  const activeLoans = loans.filter(loan => !loan.is_paid_off);
  const paidOffLoans = loans.filter(loan => loan.is_paid_off);

  const clearValidationErrors = () => {
    setValidationErrors({
      name: '',
      initial_balance: '',
      start_date: ''
    });
  };

  const clearForm = () => {
    setFormData({
      name: '',
      initial_balance: '',
      start_date: '',
      loan_type: 'loan',
      notes: ''
    });
    clearValidationErrors();
  };

  const validateForm = () => {
    const errors = {};
    
    // Validate name
    const nameError = validateName(formData.name);
    if (nameError) {
      errors.name = nameError;
    }
    
    // Validate initial_balance
    const amountError = validateAmount(formData.initial_balance);
    if (amountError) {
      errors.initial_balance = amountError;
    }
    
    // Validate start_date
    if (!formData.start_date || formData.start_date.trim() === '') {
      errors.start_date = 'Start date is required';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddNewLoan = () => {
    clearForm();
    setEditingLoanId(null);
    setShowAddForm(true);
  };

  const handleEditLoan = (loan) => {
    setFormData({
      name: loan.name,
      initial_balance: loan.initial_balance.toString(),
      start_date: loan.start_date,
      loan_type: loan.loan_type || 'loan',
      notes: loan.notes || ''
    });
    setEditingLoanId(loan.id);
    setShowAddForm(true);
    clearValidationErrors();
  };

  const handleCreateLoan = async () => {
    setError(null);
    
    if (!validateForm()) {
      setError('Please fix the validation errors before submitting.');
      return;
    }

    setLoading(true);

    try {
      await createLoan({
        name: formData.name.trim(),
        initial_balance: parseFloat(formData.initial_balance),
        start_date: formData.start_date,
        loan_type: formData.loan_type,
        notes: formData.notes.trim() || null
      });
      
      // Refresh loans list
      await fetchLoans();
      
      // Reset form
      setShowAddForm(false);
      clearForm();
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to create loan. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error creating loan:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateLoan = async () => {
    setError(null);
    
    // For updates, only validate name (can't change initial_balance or start_date)
    const nameError = validateName(formData.name);
    if (nameError) {
      setValidationErrors({ ...validationErrors, name: nameError });
      setError('Please fix the validation errors before saving.');
      return;
    }

    setLoading(true);

    try {
      await updateLoan(editingLoanId, {
        name: formData.name.trim(),
        notes: formData.notes.trim() || null
      });
      
      // Refresh loans list
      await fetchLoans();
      
      // Reset form
      setShowAddForm(false);
      setEditingLoanId(null);
      clearForm();
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to update loan. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error updating loan:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLoan = async (id) => {
    if (!window.confirm('Are you sure you want to delete this loan? This will also delete all balance entries for this loan.')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await deleteLoan(id);
      
      // Refresh loans list
      await fetchLoans();
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to delete loan. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error deleting loan:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenLoanDetail = (loanId) => {
    const loan = loans.find(l => l.id === loanId);
    if (loan) {
      setSelectedLoanId(loanId);
    }
  };

  const handleCloseLoanDetail = () => {
    setSelectedLoanId(null);
    // Refresh loans list when closing detail view
    fetchLoans();
  };

  const handleClose = () => {
    // Reset all state
    setShowAddForm(false);
    setEditingLoanId(null);
    clearForm();
    setError(null);
    setActiveTab('active');
    
    // Call parent's onUpdate to refresh summary
    if (onUpdate) {
      onUpdate();
    }
    
    onClose();
  };



  if (!isOpen) {
    return null;
  }

  const displayedLoans = activeTab === 'active' ? activeLoans : paidOffLoans;
  const selectedLoan = selectedLoanId ? loans.find(l => l.id === selectedLoanId) : null;

  // If total debt view is shown, show that instead
  if (showTotalDebt) {
    return (
      <TotalDebtView
        isOpen={true}
        onClose={() => setShowTotalDebt(false)}
      />
    );
  }

  // If a loan is selected, show the detail view instead
  if (selectedLoan) {
    return (
      <LoanDetailView
        loan={selectedLoan}
        isOpen={true}
        onClose={handleCloseLoanDetail}
        onUpdate={fetchLoans}
      />
    );
  }

  return (
    <div className="loans-modal-overlay" onClick={handleClose}>
      <div className="loans-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="loans-modal-header">
          <h2>Manage Loans</h2>
          <button className="loans-modal-close" onClick={handleClose}>✕</button>
        </div>

        {error && (
          <div className="loans-modal-error">
            <div>{error}</div>
            {loans.length === 0 && !loading && (
              <button 
                className="loans-error-retry-button" 
                onClick={fetchLoans}
              >
                Retry
              </button>
            )}
          </div>
        )}

        <div className="loans-modal-content">
          {loading && loans.length === 0 ? (
            <div className="loans-modal-loading">Loading loans...</div>
          ) : (
            <>
              {/* Action Buttons */}
              <div className="loans-add-button-section">
                <button
                  className="loans-add-new-button"
                  onClick={handleAddNewLoan}
                  disabled={loading || showAddForm}
                >
                  + Add New Loan
                </button>
                <button
                  className="loans-total-debt-button"
                  onClick={() => setShowTotalDebt(true)}
                  disabled={loading}
                >
                  📊 View Total Debt Trend
                </button>
              </div>

              {/* Add/Edit Loan Form */}
              {showAddForm && (
                <div className="loans-form-section">
                  <h3>{editingLoanId ? 'Edit Loan' : 'Add New Loan'}</h3>
                  <div className="loans-form">
                    <div className="loans-input-group">
                      <label>Loan Name *</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., Car Loan, Mortgage"
                        className={validationErrors.name ? 'input-error' : ''}
                        disabled={loading}
                      />
                      {validationErrors.name && (
                        <span className="validation-error">{validationErrors.name}</span>
                      )}
                    </div>

                    <div className="loans-input-group">
                      <label>Initial Balance * {editingLoanId && '(cannot be changed)'}</label>
                      <input
                        type="number"
                        value={formData.initial_balance}
                        onChange={(e) => setFormData({ ...formData, initial_balance: e.target.value })}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className={validationErrors.initial_balance ? 'input-error' : ''}
                        disabled={loading || editingLoanId}
                      />
                      {validationErrors.initial_balance && (
                        <span className="validation-error">{validationErrors.initial_balance}</span>
                      )}
                    </div>

                    <div className="loans-input-group">
                      <label>Start Date * {editingLoanId && '(cannot be changed)'}</label>
                      <input
                        type="date"
                        value={formData.start_date}
                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                        className={validationErrors.start_date ? 'input-error' : ''}
                        disabled={loading || editingLoanId}
                      />
                      {validationErrors.start_date && (
                        <span className="validation-error">{validationErrors.start_date}</span>
                      )}
                    </div>

                    <div className="loans-input-group">
                      <label>Loan Type *</label>
                      <select
                        value={formData.loan_type}
                        onChange={(e) => setFormData({ ...formData, loan_type: e.target.value })}
                        disabled={loading}
                      >
                        <option value="loan">Loan (balance decreases only)</option>
                        <option value="line_of_credit">Line of Credit (balance can fluctuate)</option>
                      </select>
                      <span className="loans-field-hint">
                        Choose "Loan" for mortgages, car loans, etc. Choose "Line of Credit" for credit cards, HELOCs, etc.
                      </span>
                    </div>

                    <div className="loans-input-group">
                      <label>Notes</label>
                      <textarea
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        placeholder="Optional notes about this loan"
                        rows="3"
                        disabled={loading}
                      />
                    </div>

                    <div className="loans-form-actions">
                      <button
                        className="loans-form-submit-button"
                        onClick={editingLoanId ? handleUpdateLoan : handleCreateLoan}
                        disabled={loading}
                      >
                        {loading ? 'Saving...' : (editingLoanId ? 'Update Loan' : 'Create Loan')}
                      </button>
                      <button
                        className="loans-form-cancel-button"
                        onClick={() => {
                          setShowAddForm(false);
                          setEditingLoanId(null);
                          clearForm();
                        }}
                        disabled={loading}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tabbed Interface */}
              <div className="loans-tabs">
                <button
                  className={`loans-tab ${activeTab === 'active' ? 'active' : ''}`}
                  onClick={() => setActiveTab('active')}
                >
                  Active Loans ({activeLoans.length})
                </button>
                <button
                  className={`loans-tab ${activeTab === 'paidOff' ? 'active' : ''}`}
                  onClick={() => setActiveTab('paidOff')}
                >
                  Paid Off Loans ({paidOffLoans.length})
                </button>
              </div>

              {/* Loans List */}
              <div className="loans-list">
                {displayedLoans.length === 0 ? (
                  <div className="loans-empty">
                    {activeTab === 'active' 
                      ? 'No active loans. Add a new loan to get started.'
                      : 'No paid off loans yet.'}
                  </div>
                ) : (
                  displayedLoans.map((loan) => {
                    const needsUpdate = highlightIds.includes(loan.id);
                    return (
                    <div key={loan.id} className={`loan-item ${needsUpdate ? 'needs-update' : ''}`}>
                      <div className="loan-item-main">
                        <div className="loan-item-info">
                          <div className="loan-item-name">
                            {loan.name}
                            {loan.loan_type === 'line_of_credit' && (
                              <span className="loan-type-badge">LOC</span>
                            )}
                            {needsUpdate && (
                              <span className="needs-update-badge" title="Missing balance for current month">
                                ⚠️ Update Needed
                              </span>
                            )}
                          </div>
                          <div className="loan-item-details">
                            <span className="loan-item-rate">
                              Rate: {loan.currentRate ? `${loan.currentRate}%` : 'N/A'}
                            </span>
                            <span className="loan-item-balance">
                              Balance: {formatCurrency(loan.currentBalance)}
                            </span>
                            <span className="loan-item-start-date">
                              Started: {formatDate(loan.start_date)}
                            </span>
                          </div>
                        </div>
                        <div className="loan-item-actions">
                          <button
                            className="loan-view-button"
                            onClick={() => handleOpenLoanDetail(loan.id)}
                            disabled={loading}
                            title="View Details"
                          >
                            👁️ View
                          </button>
                          <button
                            className="loan-edit-button"
                            onClick={() => handleEditLoan(loan)}
                            disabled={loading}
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            className="loan-delete-button"
                            onClick={() => handleDeleteLoan(loan.id)}
                            disabled={loading}
                            title="Delete"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoansModal;
