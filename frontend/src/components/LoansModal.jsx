import { useState, useEffect } from 'react';
import './LoansModal.css';
import { getAllLoans, createLoan, updateLoan, deleteLoan } from '../services/loanApi';
import { validateName, validateAmount } from '../utils/validation';
import { formatCurrency, formatDate } from '../utils/formatters';
import { createLogger } from '../utils/logger';
import LoanDetailView from './LoanDetailView';
import TotalDebtView from './TotalDebtView';

const logger = createLogger('LoansModal');

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
    notes: '',
    // Fixed interest rate for loan type only
    fixed_interest_rate: '',
    // Mortgage-specific fields
    amortization_period: '',
    term_length: '',
    renewal_date: '',
    rate_type: 'fixed',
    payment_frequency: 'monthly',
    estimated_property_value: ''
  });
  
  const [validationErrors, setValidationErrors] = useState({
    name: '',
    initial_balance: '',
    start_date: '',
    // Fixed interest rate validation error
    fixed_interest_rate: '',
    // Mortgage-specific validation errors
    amortization_period: '',
    term_length: '',
    renewal_date: '',
    rate_type: '',
    payment_frequency: '',
    estimated_property_value: ''
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
      logger.error('Error fetching loans:', err);
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
      start_date: '',
      fixed_interest_rate: '',
      amortization_period: '',
      term_length: '',
      renewal_date: '',
      rate_type: '',
      payment_frequency: '',
      estimated_property_value: ''
    });
  };

  const clearForm = () => {
    setFormData({
      name: '',
      initial_balance: '',
      start_date: '',
      loan_type: 'loan',
      notes: '',
      fixed_interest_rate: '',
      amortization_period: '',
      term_length: '',
      renewal_date: '',
      rate_type: 'fixed',
      payment_frequency: 'monthly',
      estimated_property_value: ''
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
    
    // Validate fixed_interest_rate (only for loan type, optional but must be non-negative if provided)
    if (formData.loan_type === 'loan' && formData.fixed_interest_rate !== '') {
      const fixedRate = parseFloat(formData.fixed_interest_rate);
      if (isNaN(fixedRate)) {
        errors.fixed_interest_rate = 'Fixed interest rate must be a valid number';
      } else if (fixedRate < 0) {
        errors.fixed_interest_rate = 'Fixed interest rate must be greater than or equal to zero';
      }
    }
    
    // Mortgage-specific validation
    if (formData.loan_type === 'mortgage') {
      // Validate amortization_period (required, 1-40 years)
      if (!formData.amortization_period || formData.amortization_period === '') {
        errors.amortization_period = 'Amortization period is required for mortgages';
      } else {
        const amortPeriod = parseInt(formData.amortization_period, 10);
        if (isNaN(amortPeriod) || amortPeriod < 1 || amortPeriod > 40) {
          errors.amortization_period = 'Amortization period must be between 1 and 40 years';
        }
      }
      
      // Validate term_length (required, 1-10 years)
      if (!formData.term_length || formData.term_length === '') {
        errors.term_length = 'Term length is required for mortgages';
      } else {
        const termLength = parseInt(formData.term_length, 10);
        if (isNaN(termLength) || termLength < 1 || termLength > 10) {
          errors.term_length = 'Term length must be between 1 and 10 years';
        } else if (formData.amortization_period && termLength > parseInt(formData.amortization_period, 10)) {
          errors.term_length = 'Term length cannot exceed amortization period';
        }
      }
      
      // Validate renewal_date (required, must be in the future)
      if (!formData.renewal_date || formData.renewal_date.trim() === '') {
        errors.renewal_date = 'Renewal date is required for mortgages';
      } else {
        const renewalDate = new Date(formData.renewal_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (renewalDate <= today) {
          errors.renewal_date = 'Renewal date must be in the future';
        }
      }
      
      // Validate rate_type (required)
      if (!formData.rate_type || !['fixed', 'variable'].includes(formData.rate_type)) {
        errors.rate_type = 'Rate type must be fixed or variable';
      }
      
      // Validate payment_frequency (required)
      if (!formData.payment_frequency || !['monthly', 'bi-weekly', 'accelerated_bi-weekly'].includes(formData.payment_frequency)) {
        errors.payment_frequency = 'Payment frequency must be monthly, bi-weekly, or accelerated bi-weekly';
      }
      
      // Validate estimated_property_value (optional, but if provided must be > 0)
      if (formData.estimated_property_value && formData.estimated_property_value !== '') {
        const propertyValue = parseFloat(formData.estimated_property_value);
        if (isNaN(propertyValue) || propertyValue <= 0) {
          errors.estimated_property_value = 'Estimated property value must be greater than zero';
        }
      }
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
      notes: loan.notes || '',
      // Fixed interest rate (only for loan type)
      fixed_interest_rate: loan.fixed_interest_rate != null ? loan.fixed_interest_rate.toString() : '',
      // Mortgage-specific fields
      amortization_period: loan.amortization_period ? loan.amortization_period.toString() : '',
      term_length: loan.term_length ? loan.term_length.toString() : '',
      renewal_date: loan.renewal_date || '',
      rate_type: loan.rate_type || 'fixed',
      payment_frequency: loan.payment_frequency || 'monthly',
      estimated_property_value: loan.estimated_property_value ? loan.estimated_property_value.toString() : ''
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
      const loanData = {
        name: formData.name.trim(),
        initial_balance: parseFloat(formData.initial_balance),
        start_date: formData.start_date,
        loan_type: formData.loan_type,
        notes: formData.notes.trim() || null
      };
      
      // Add fixed_interest_rate for loan type only
      if (formData.loan_type === 'loan') {
        loanData.fixed_interest_rate = formData.fixed_interest_rate !== '' 
          ? parseFloat(formData.fixed_interest_rate) 
          : null;
      }
      
      // Add mortgage-specific fields if loan_type is mortgage
      if (formData.loan_type === 'mortgage') {
        loanData.amortization_period = parseInt(formData.amortization_period, 10);
        loanData.term_length = parseInt(formData.term_length, 10);
        loanData.renewal_date = formData.renewal_date;
        loanData.rate_type = formData.rate_type;
        loanData.payment_frequency = formData.payment_frequency;
        loanData.estimated_property_value = formData.estimated_property_value 
          ? parseFloat(formData.estimated_property_value) 
          : null;
      }
      
      await createLoan(loanData);
      
      // Refresh loans list
      await fetchLoans();
      
      // Reset form
      setShowAddForm(false);
      clearForm();
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to create loan. Please check your connection and try again.';
      setError(errorMessage);
      logger.error('Error creating loan:', err);
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
    
    // For loan type, validate fixed_interest_rate if provided
    if (formData.loan_type === 'loan' && formData.fixed_interest_rate !== '') {
      const fixedRate = parseFloat(formData.fixed_interest_rate);
      if (isNaN(fixedRate)) {
        setValidationErrors({ ...validationErrors, fixed_interest_rate: 'Fixed interest rate must be a valid number' });
        setError('Please fix the validation errors before saving.');
        return;
      } else if (fixedRate < 0) {
        setValidationErrors({ ...validationErrors, fixed_interest_rate: 'Fixed interest rate must be greater than or equal to zero' });
        setError('Please fix the validation errors before saving.');
        return;
      }
    }
    
    // For mortgage updates, validate editable mortgage fields
    if (formData.loan_type === 'mortgage') {
      const errors = { ...validationErrors, name: '' };
      
      // Validate renewal_date if provided (must be in the future)
      if (formData.renewal_date && formData.renewal_date.trim() !== '') {
        const renewalDate = new Date(formData.renewal_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (renewalDate <= today) {
          errors.renewal_date = 'Renewal date must be in the future';
        }
      }
      
      // Validate estimated_property_value if provided (must be > 0)
      if (formData.estimated_property_value && formData.estimated_property_value !== '') {
        const propertyValue = parseFloat(formData.estimated_property_value);
        if (isNaN(propertyValue) || propertyValue <= 0) {
          errors.estimated_property_value = 'Estimated property value must be greater than zero';
        }
      }
      
      if (errors.renewal_date || errors.estimated_property_value) {
        setValidationErrors(errors);
        setError('Please fix the validation errors before saving.');
        return;
      }
    }

    setLoading(true);

    try {
      const updateData = {
        name: formData.name.trim(),
        notes: formData.notes.trim() || null
      };
      
      // For loan type, include fixed_interest_rate
      if (formData.loan_type === 'loan') {
        updateData.fixed_interest_rate = formData.fixed_interest_rate !== '' 
          ? parseFloat(formData.fixed_interest_rate) 
          : null;
      }
      
      // For mortgages, include editable mortgage fields
      if (formData.loan_type === 'mortgage') {
        updateData.renewal_date = formData.renewal_date || null;
        updateData.estimated_property_value = formData.estimated_property_value 
          ? parseFloat(formData.estimated_property_value) 
          : null;
      }
      
      await updateLoan(editingLoanId, updateData);
      
      // Refresh loans list
      await fetchLoans();
      
      // Reset form
      setShowAddForm(false);
      setEditingLoanId(null);
      clearForm();
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to update loan. Please check your connection and try again.';
      setError(errorMessage);
      logger.error('Error updating loan:', err);
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
      logger.error('Error deleting loan:', err);
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
                        disabled={loading || editingLoanId}
                      >
                        <option value="loan">Loan (balance decreases only)</option>
                        <option value="line_of_credit">Line of Credit (balance can fluctuate)</option>
                        <option value="mortgage">Mortgage (with amortization tracking)</option>
                      </select>
                      <span className="loans-field-hint">
                        {formData.loan_type === 'mortgage' 
                          ? 'Mortgages include amortization schedules, equity tracking, and renewal reminders.'
                          : 'Choose "Loan" for car loans, personal loans, etc. Choose "Line of Credit" for credit cards, HELOCs, etc.'}
                      </span>
                    </div>

                    {/* Fixed Interest Rate field - only for loan type */}
                    {formData.loan_type === 'loan' && (
                      <div className="loans-input-group">
                        <label>Fixed Interest Rate (%)</label>
                        <input
                          type="number"
                          value={formData.fixed_interest_rate}
                          onChange={(e) => setFormData({ ...formData, fixed_interest_rate: e.target.value })}
                          placeholder="e.g., 5.25"
                          step="0.01"
                          min="0"
                          className={validationErrors.fixed_interest_rate ? 'input-error' : ''}
                          disabled={loading}
                        />
                        {validationErrors.fixed_interest_rate && (
                          <span className="validation-error">{validationErrors.fixed_interest_rate}</span>
                        )}
                        <span className="loans-field-hint">
                          Optional. If set, this rate will be auto-populated when adding balance entries, simplifying data entry for fixed-rate loans.
                        </span>
                      </div>
                    )}

                    {/* Mortgage-specific fields */}
                    {formData.loan_type === 'mortgage' && (
                      <>
                        <div className="loans-mortgage-section">
                          <h4>Mortgage Details</h4>
                          
                          <div className="loans-input-row">
                            <div className="loans-input-group">
                              <label>Amortization Period (years) * {editingLoanId && '(cannot be changed)'}</label>
                              <input
                                type="number"
                                value={formData.amortization_period}
                                onChange={(e) => setFormData({ ...formData, amortization_period: e.target.value })}
                                placeholder="25"
                                min="1"
                                max="40"
                                className={validationErrors.amortization_period ? 'input-error' : ''}
                                disabled={loading || editingLoanId}
                              />
                              {validationErrors.amortization_period && (
                                <span className="validation-error">{validationErrors.amortization_period}</span>
                              )}
                            </div>

                            <div className="loans-input-group">
                              <label>Term Length (years) * {editingLoanId && '(cannot be changed)'}</label>
                              <input
                                type="number"
                                value={formData.term_length}
                                onChange={(e) => setFormData({ ...formData, term_length: e.target.value })}
                                placeholder="5"
                                min="1"
                                max="10"
                                className={validationErrors.term_length ? 'input-error' : ''}
                                disabled={loading || editingLoanId}
                              />
                              {validationErrors.term_length && (
                                <span className="validation-error">{validationErrors.term_length}</span>
                              )}
                            </div>
                          </div>

                          <div className="loans-input-group">
                            <label>Renewal Date * {editingLoanId && '(can be updated)'}</label>
                            <input
                              type="date"
                              value={formData.renewal_date}
                              onChange={(e) => setFormData({ ...formData, renewal_date: e.target.value })}
                              className={validationErrors.renewal_date ? 'input-error' : ''}
                              disabled={loading}
                            />
                            {validationErrors.renewal_date && (
                              <span className="validation-error">{validationErrors.renewal_date}</span>
                            )}
                            <span className="loans-field-hint">
                              The date when your mortgage term ends and needs to be renewed.
                            </span>
                          </div>

                          <div className="loans-input-row">
                            <div className="loans-input-group">
                              <label>Rate Type * {editingLoanId && '(cannot be changed)'}</label>
                              <select
                                value={formData.rate_type}
                                onChange={(e) => setFormData({ ...formData, rate_type: e.target.value })}
                                className={validationErrors.rate_type ? 'input-error' : ''}
                                disabled={loading || editingLoanId}
                              >
                                <option value="fixed">Fixed Rate</option>
                                <option value="variable">Variable Rate</option>
                              </select>
                              {validationErrors.rate_type && (
                                <span className="validation-error">{validationErrors.rate_type}</span>
                              )}
                            </div>

                            <div className="loans-input-group">
                              <label>Payment Frequency * {editingLoanId && '(cannot be changed)'}</label>
                              <select
                                value={formData.payment_frequency}
                                onChange={(e) => setFormData({ ...formData, payment_frequency: e.target.value })}
                                className={validationErrors.payment_frequency ? 'input-error' : ''}
                                disabled={loading || editingLoanId}
                              >
                                <option value="monthly">Monthly</option>
                                <option value="bi-weekly">Bi-weekly</option>
                                <option value="accelerated_bi-weekly">Accelerated Bi-weekly</option>
                              </select>
                              {validationErrors.payment_frequency && (
                                <span className="validation-error">{validationErrors.payment_frequency}</span>
                              )}
                            </div>
                          </div>

                          <div className="loans-input-group">
                            <label>Estimated Property Value {editingLoanId && '(can be updated)'}</label>
                            <input
                              type="number"
                              value={formData.estimated_property_value}
                              onChange={(e) => setFormData({ ...formData, estimated_property_value: e.target.value })}
                              placeholder="0.00"
                              step="0.01"
                              min="0"
                              className={validationErrors.estimated_property_value ? 'input-error' : ''}
                              disabled={loading}
                            />
                            {validationErrors.estimated_property_value && (
                              <span className="validation-error">{validationErrors.estimated_property_value}</span>
                            )}
                            <span className="loans-field-hint">
                              Optional. Used to calculate home equity (property value minus mortgage balance).
                            </span>
                          </div>
                        </div>
                      </>
                    )}

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
                            {loan.loan_type === 'mortgage' && (
                              <span className="loan-type-badge mortgage">Mortgage</span>
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
