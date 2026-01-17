import { useState, useEffect } from 'react';
import './InvestmentsModal.css';
import { getAllInvestments, createInvestment, updateInvestment, deleteInvestment } from '../services/investmentApi';
import { validateName, validateAmount } from '../utils/validation';
import { formatCurrency } from '../utils/formatters';
import { createLogger } from '../utils/logger';
import InvestmentDetailView from './InvestmentDetailView';

const logger = createLogger('InvestmentsModal');

const InvestmentsModal = ({ isOpen, onClose, onUpdate, highlightIds = [] }) => {
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingInvestmentId, setEditingInvestmentId] = useState(null);
  const [selectedInvestmentId, setSelectedInvestmentId] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    type: 'TFSA',
    initial_value: ''
  });
  
  const [validationErrors, setValidationErrors] = useState({
    name: '',
    type: '',
    initial_value: ''
  });

  // Fetch investments when modal opens
  useEffect(() => {
    if (isOpen) {
      fetchInvestments();
    }
  }, [isOpen]);

  const fetchInvestments = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getAllInvestments();
      setInvestments(data || []);
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to load investments. Please check your connection and try again.';
      setError(errorMessage);
      logger.error('Error fetching investments:', err);
    } finally {
      setLoading(false);
    }
  };

  const clearValidationErrors = () => {
    setValidationErrors({
      name: '',
      type: '',
      initial_value: ''
    });
  };

  const clearForm = () => {
    setFormData({
      name: '',
      type: 'TFSA',
      initial_value: ''
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
    
    // Validate type
    if (!formData.type || !['TFSA', 'RRSP'].includes(formData.type)) {
      errors.type = 'Type must be TFSA or RRSP';
    }
    
    // Validate initial_value
    const amountError = validateAmount(formData.initial_value);
    if (amountError) {
      errors.initial_value = amountError;
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddNewInvestment = () => {
    clearForm();
    setEditingInvestmentId(null);
    setShowAddForm(true);
  };

  const handleEditInvestment = (investment) => {
    setFormData({
      name: investment.name,
      type: investment.type,
      initial_value: investment.initial_value.toString()
    });
    setEditingInvestmentId(investment.id);
    setShowAddForm(true);
    clearValidationErrors();
  };

  const handleCreateInvestment = async () => {
    setError(null);
    
    if (!validateForm()) {
      setError('Please fix the validation errors before submitting.');
      return;
    }

    setLoading(true);

    try {
      await createInvestment({
        name: formData.name.trim(),
        type: formData.type,
        initial_value: parseFloat(formData.initial_value)
      });
      
      // Refresh investments list
      await fetchInvestments();
      
      // Reset form
      setShowAddForm(false);
      clearForm();
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to create investment. Please check your connection and try again.';
      setError(errorMessage);
      logger.error('Error creating investment:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateInvestment = async () => {
    setError(null);
    
    // For updates, validate name and type (can't change initial_value)
    const errors = {};
    const nameError = validateName(formData.name);
    if (nameError) {
      errors.name = nameError;
    }
    if (!formData.type || !['TFSA', 'RRSP'].includes(formData.type)) {
      errors.type = 'Type must be TFSA or RRSP';
    }
    
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setError('Please fix the validation errors before saving.');
      return;
    }

    setLoading(true);

    try {
      await updateInvestment(editingInvestmentId, {
        name: formData.name.trim(),
        type: formData.type
      });
      
      // Refresh investments list
      await fetchInvestments();
      
      // Reset form
      setShowAddForm(false);
      setEditingInvestmentId(null);
      clearForm();
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to update investment. Please check your connection and try again.';
      setError(errorMessage);
      logger.error('Error updating investment:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInvestment = async (id) => {
    if (!window.confirm('Are you sure you want to delete this investment? This will also delete all value entries for this investment.')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await deleteInvestment(id);
      
      // Refresh investments list
      await fetchInvestments();
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to delete investment. Please check your connection and try again.';
      setError(errorMessage);
      logger.error('Error deleting investment:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenInvestmentDetail = (investmentId) => {
    const investment = investments.find(i => i.id === investmentId);
    if (investment) {
      setSelectedInvestmentId(investmentId);
    }
  };

  const handleClose = () => {
    // Reset all state
    setShowAddForm(false);
    setEditingInvestmentId(null);
    setSelectedInvestmentId(null);
    clearForm();
    setError(null);
    
    // Call parent's onUpdate to refresh summary
    if (onUpdate) {
      onUpdate();
    }
    
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  // If an investment is selected, show the detail view instead
  if (selectedInvestmentId) {
    const selectedInvestment = investments.find(i => i.id === selectedInvestmentId);
    return (
      <InvestmentDetailView
        investment={selectedInvestment}
        isOpen={true}
        onClose={() => setSelectedInvestmentId(null)}
        onUpdate={() => {
          fetchInvestments();
          if (onUpdate) {
            onUpdate();
          }
        }}
      />
    );
  }

  return (
    <div className="investments-modal-overlay" onClick={handleClose}>
      <div className="investments-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="investments-modal-header">
          <h2>Manage Investments</h2>
          <button className="investments-modal-close" onClick={handleClose}>✕</button>
        </div>

        {error && (
          <div className="investments-modal-error">
            <div>{error}</div>
            {investments.length === 0 && !loading && (
              <button 
                className="investments-error-retry-button" 
                onClick={fetchInvestments}
              >
                Retry
              </button>
            )}
          </div>
        )}

        <div className="investments-modal-content">
          {loading && investments.length === 0 ? (
            <div className="investments-modal-loading">Loading investments...</div>
          ) : (
            <>
              {/* Action Buttons */}
              <div className="investments-add-button-section">
                <button
                  className="investments-add-new-button"
                  onClick={handleAddNewInvestment}
                  disabled={loading || showAddForm}
                >
                  + Add New Investment
                </button>
              </div>

              {/* Add/Edit Investment Form */}
              {showAddForm && (
                <div className="investments-form-section">
                  <h3>{editingInvestmentId ? 'Edit Investment' : 'Add New Investment'}</h3>
                  <div className="investments-form">
                    <div className="investments-input-group">
                      <label>Investment Name *</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g., My TFSA, Retirement RRSP"
                        className={validationErrors.name ? 'input-error' : ''}
                        disabled={loading}
                      />
                      {validationErrors.name && (
                        <span className="validation-error">{validationErrors.name}</span>
                      )}
                    </div>

                    <div className="investments-input-group">
                      <label>Investment Type *</label>
                      <select
                        value={formData.type}
                        onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                        className={validationErrors.type ? 'input-error' : ''}
                        disabled={loading}
                      >
                        <option value="TFSA">TFSA (Tax-Free Savings Account)</option>
                        <option value="RRSP">RRSP (Registered Retirement Savings Plan)</option>
                      </select>
                      {validationErrors.type && (
                        <span className="validation-error">{validationErrors.type}</span>
                      )}
                    </div>

                    <div className="investments-input-group">
                      <label>Initial Value * {editingInvestmentId && '(cannot be changed)'}</label>
                      <input
                        type="number"
                        value={formData.initial_value}
                        onChange={(e) => setFormData({ ...formData, initial_value: e.target.value })}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className={validationErrors.initial_value ? 'input-error' : ''}
                        disabled={loading || editingInvestmentId}
                      />
                      {validationErrors.initial_value && (
                        <span className="validation-error">{validationErrors.initial_value}</span>
                      )}
                    </div>

                    <div className="investments-form-actions">
                      <button
                        className="investments-form-submit-button"
                        onClick={editingInvestmentId ? handleUpdateInvestment : handleCreateInvestment}
                        disabled={loading}
                      >
                        {loading ? 'Saving...' : (editingInvestmentId ? 'Update Investment' : 'Create Investment')}
                      </button>
                      <button
                        className="investments-form-cancel-button"
                        onClick={() => {
                          setShowAddForm(false);
                          setEditingInvestmentId(null);
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

              {/* Investments List */}
              <div className="investments-list">
                {investments.length === 0 ? (
                  <div className="investments-empty">
                    No investments yet. Add a new investment to get started.
                  </div>
                ) : (
                  investments.map((investment) => {
                    const needsUpdate = highlightIds.includes(investment.id);
                    return (
                    <div key={investment.id} className={`investment-item ${needsUpdate ? 'needs-update' : ''}`}>
                      <div className="investment-item-main">
                        <div className="investment-item-info">
                          <div className="investment-item-name">
                            {investment.name}
                            <span className="investment-type-badge">{investment.type}</span>
                            {needsUpdate && (
                              <span className="needs-update-badge" title="Missing value for current month">
                                ⚠️ Update Needed
                              </span>
                            )}
                          </div>
                          <div className="investment-item-details">
                            <span className="investment-item-current-value">
                              Current Value: {formatCurrency(investment.currentValue)}
                            </span>
                          </div>
                        </div>
                        <div className="investment-item-actions">
                          <button
                            className="investment-view-button"
                            onClick={() => handleOpenInvestmentDetail(investment.id)}
                            disabled={loading}
                            title="View Details"
                          >
                            👁️ View
                          </button>
                          <button
                            className="investment-edit-button"
                            onClick={() => handleEditInvestment(investment)}
                            disabled={loading}
                            title="Edit"
                          >
                            ✏️
                          </button>
                          <button
                            className="investment-delete-button"
                            onClick={() => handleDeleteInvestment(investment.id)}
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

export default InvestmentsModal;
