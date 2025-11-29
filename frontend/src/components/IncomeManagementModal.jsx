import { useState, useEffect } from 'react';
import './IncomeManagementModal.css';
import {
  getMonthlyIncomeSources,
  createIncomeSource,
  updateIncomeSource,
  deleteIncomeSource,
  carryForwardIncomeSources
} from '../services/incomeApi';
import { validateName, validateAmount } from '../utils/validation';
import { getMonthNameLong } from '../utils/formatters';

const IncomeManagementModal = ({ isOpen, onClose, year, month, onUpdate }) => {
  const [incomeSources, setIncomeSources] = useState([]);
  const [totalGross, setTotalGross] = useState(0);
  const [byCategory, setByCategory] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceAmount, setNewSourceAmount] = useState('');
  const [newSourceCategory, setNewSourceCategory] = useState('Other');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [validationErrors, setValidationErrors] = useState({
    addName: '',
    addAmount: '',
    editName: '',
    editAmount: ''
  });

  // Fetch income sources when modal opens or year/month changes
  useEffect(() => {
    if (isOpen) {
      fetchIncomeSources();
    }
  }, [isOpen, year, month]);

  const fetchIncomeSources = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getMonthlyIncomeSources(year, month);
      setIncomeSources(data.sources || []);
      setTotalGross(data.total || 0);
      setByCategory(data.byCategory || null);
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to load income sources. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error fetching income sources:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotal = (sources) => {
    return sources.reduce((sum, source) => sum + parseFloat(source.amount || 0), 0);
  };

  const getCategoryIcon = (category) => {
    const icons = {
      'Salary': '💼',
      'Government': '🏛️',
      'Gifts': '🎁',
      'Other': '💰'
    };
    return icons[category] || '💰';
  };

  const clearValidationErrors = () => {
    setValidationErrors({
      addName: '',
      addAmount: '',
      editName: '',
      editAmount: ''
    });
  };

  const handleAddSource = async () => {
    // Clear previous validation errors and general errors
    const newErrors = { ...validationErrors };
    setError(null);
    
    // Validate inputs
    const nameError = validateName(newSourceName);
    const amountError = validateAmount(newSourceAmount);
    
    newErrors.addName = nameError;
    newErrors.addAmount = amountError;
    setValidationErrors(newErrors);
    
    // If there are validation errors, don't proceed
    if (nameError || amountError) {
      setError('Please fix the validation errors before submitting.');
      return;
    }

    const amount = parseFloat(newSourceAmount);

    setLoading(true);

    try {
      const createdSource = await createIncomeSource({
        year,
        month,
        name: newSourceName.trim(),
        amount,
        category: newSourceCategory
      });
      
      // Update local state
      const updatedSources = [...incomeSources, createdSource];
      setIncomeSources(updatedSources);
      setTotalGross(calculateTotal(updatedSources));

      // Refresh to get updated category breakdown
      await fetchIncomeSources();

      // Reset form
      setNewSourceName('');
      setNewSourceAmount('');
      setNewSourceCategory('Other');
      setIsAdding(false);
      clearValidationErrors();
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to add income source. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error creating income source:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditSource = (source) => {
    setEditingId(source.id);
    setEditName(source.name);
    setEditAmount(source.amount.toString());
    setEditCategory(source.category || 'Other');
  };

  const handleSaveEdit = async () => {
    // Clear previous validation errors and general errors
    const newErrors = { ...validationErrors };
    setError(null);
    
    // Validate inputs
    const nameError = validateName(editName);
    const amountError = validateAmount(editAmount);
    
    newErrors.editName = nameError;
    newErrors.editAmount = amountError;
    setValidationErrors(newErrors);
    
    // If there are validation errors, don't proceed
    if (nameError || amountError) {
      setError('Please fix the validation errors before saving.');
      return;
    }

    const amount = parseFloat(editAmount);

    setLoading(true);

    try {
      const updatedSource = await updateIncomeSource(editingId, {
        name: editName.trim(),
        amount,
        category: editCategory
      });
      
      // Update local state
      const updatedSources = incomeSources.map(source =>
        source.id === editingId ? updatedSource : source
      );
      setIncomeSources(updatedSources);
      setTotalGross(calculateTotal(updatedSources));

      // Refresh to get updated category breakdown
      await fetchIncomeSources();

      // Reset edit state
      setEditingId(null);
      setEditName('');
      setEditAmount('');
      setEditCategory('');
      clearValidationErrors();
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to update income source. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error updating income source:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditAmount('');
    setEditCategory('');
    clearValidationErrors();
  };

  const handleDeleteSource = async (id) => {
    if (!window.confirm('Are you sure you want to delete this income source?')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await deleteIncomeSource(id);

      // Update local state
      const updatedSources = incomeSources.filter(source => source.id !== id);
      setIncomeSources(updatedSources);
      setTotalGross(calculateTotal(updatedSources));
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to delete income source. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error deleting income source:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyFromPreviousMonth = async () => {
    if (!window.confirm('Copy all income sources from the previous month? This will add them to the current month.')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await carryForwardIncomeSources(year, month);
      
      // Refresh the income sources list
      await fetchIncomeSources();
    } catch (err) {
      const errorMessage = err.message || 'Network error. Unable to copy income sources. Please check your connection and try again.';
      setError(errorMessage);
      console.error('Error copying income sources:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Reset all state
    setIsAdding(false);
    setNewSourceName('');
    setNewSourceAmount('');
    setNewSourceCategory('Other');
    setEditingId(null);
    setEditName('');
    setEditAmount('');
    setEditCategory('');
    setError(null);
    clearValidationErrors();
    
    // Call parent's onUpdate to refresh summary
    if (onUpdate) {
      onUpdate();
    }
    
    onClose();
  };



  if (!isOpen) {
    return null;
  }

  return (
    <div className="income-modal-overlay" onClick={handleClose}>
      <div className="income-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="income-modal-header">
          <h2>Manage Income - {getMonthNameLong(month)} {year}</h2>
          <button className="income-modal-close" onClick={handleClose}>✕</button>
        </div>

        {error && (
          <div className="income-modal-error">
            <div>{error}</div>
            {incomeSources.length === 0 && !loading && (
              <button 
                className="income-error-retry-button" 
                onClick={fetchIncomeSources}
              >
                Retry
              </button>
            )}
          </div>
        )}

        <div className="income-modal-content">
          {loading && incomeSources.length === 0 ? (
            <div className="income-modal-loading">Loading income sources...</div>
          ) : (
            <>
              {/* Category breakdown display */}
              {byCategory && Object.keys(byCategory).length > 0 && (
                <div className="income-category-breakdown">
                  <h4>By Category</h4>
                  <div className="category-breakdown-grid">
                    {Object.entries(byCategory).map(([category, amount]) => (
                      <div key={category} className="category-breakdown-item">
                        <span className="category-icon">{getCategoryIcon(category)}</span>
                        <span className="category-name">{category}</span>
                        <span className="category-amount">${amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="income-sources-list">
                {incomeSources.length === 0 ? (
                  <div className="income-sources-empty">
                    No income sources for this month. Add one below.
                  </div>
                ) : (
                  incomeSources.map((source) => (
                    <div key={source.id} className="income-source-item">
                      {editingId === source.id ? (
                        <div className="income-source-edit">
                          <div className="income-input-group">
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder="Income source name"
                              className={`income-edit-name ${validationErrors.editName ? 'input-error' : ''}`}
                              disabled={loading}
                            />
                            {validationErrors.editName && (
                              <span className="validation-error">{validationErrors.editName}</span>
                            )}
                          </div>
                          <div className="income-input-group">
                            <select
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value)}
                              className="income-edit-category"
                              disabled={loading}
                            >
                              <option value="Salary">Salary</option>
                              <option value="Government">Government</option>
                              <option value="Gifts">Gifts</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                          <div className="income-input-group">
                            <input
                              type="number"
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              placeholder="0.00"
                              step="0.01"
                              min="0"
                              className={`income-edit-amount ${validationErrors.editAmount ? 'input-error' : ''}`}
                              disabled={loading}
                            />
                            {validationErrors.editAmount && (
                              <span className="validation-error">{validationErrors.editAmount}</span>
                            )}
                          </div>
                          <button
                            className="income-save-button"
                            onClick={handleSaveEdit}
                            disabled={loading}
                          >
                            {loading ? '...' : '✓'}
                          </button>
                          <button
                            className="income-cancel-button"
                            onClick={handleCancelEdit}
                            disabled={loading}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <div className="income-source-display">
                          <div className="income-source-header">
                            <span className={`category-badge category-${(source.category || 'Other').toLowerCase()}`}>
                              {source.category || 'Other'}
                            </span>
                            <span className="income-source-name">{source.name}</span>
                          </div>
                          <span className="income-source-amount">
                            ${parseFloat(source.amount).toFixed(2)}
                          </span>
                          <div className="income-source-actions">
                            <button
                              className="income-edit-button"
                              onClick={() => handleEditSource(source)}
                              disabled={loading}
                              title="Edit"
                            >
                              ✏️
                            </button>
                            <button
                              className="income-delete-button"
                              onClick={() => handleDeleteSource(source.id)}
                              disabled={loading}
                              title="Delete"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="income-add-section">
                {incomeSources.length === 0 && !isAdding && (
                  <button
                    className="income-copy-previous-button"
                    onClick={handleCopyFromPreviousMonth}
                    disabled={loading}
                  >
                    📋 Copy from Previous Month
                  </button>
                )}
                
                {!isAdding ? (
                  <button
                    className="income-add-toggle-button"
                    onClick={() => setIsAdding(true)}
                    disabled={loading}
                  >
                    + Add Income Source
                  </button>
                ) : (
                  <div className="income-add-form">
                    <div className="income-input-group">
                      <input
                        type="text"
                        value={newSourceName}
                        onChange={(e) => setNewSourceName(e.target.value)}
                        placeholder="Income source name (e.g., Salary)"
                        className={`income-add-name ${validationErrors.addName ? 'input-error' : ''}`}
                        disabled={loading}
                      />
                      {validationErrors.addName && (
                        <span className="validation-error">{validationErrors.addName}</span>
                      )}
                    </div>
                    <div className="income-input-group">
                      <select
                        value={newSourceCategory}
                        onChange={(e) => setNewSourceCategory(e.target.value)}
                        className="income-add-category"
                        disabled={loading}
                      >
                        <option value="Salary">Salary</option>
                        <option value="Government">Government</option>
                        <option value="Gifts">Gifts</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="income-input-group">
                      <input
                        type="number"
                        value={newSourceAmount}
                        onChange={(e) => setNewSourceAmount(e.target.value)}
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                        className={`income-add-amount ${validationErrors.addAmount ? 'input-error' : ''}`}
                        disabled={loading}
                      />
                      {validationErrors.addAmount && (
                        <span className="validation-error">{validationErrors.addAmount}</span>
                      )}
                    </div>
                    <button
                      className="income-add-button"
                      onClick={handleAddSource}
                      disabled={loading}
                    >
                      {loading ? 'Adding...' : 'Add'}
                    </button>
                    <button
                      className="income-add-cancel-button"
                      onClick={() => {
                        setIsAdding(false);
                        setNewSourceName('');
                        setNewSourceAmount('');
                        setNewSourceCategory('Other');
                        clearValidationErrors();
                      }}
                      disabled={loading}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <div className="income-total-section">
                <span className="income-total-label">Total Monthly Gross:</span>
                <span className="income-total-amount">
                  ${totalGross.toFixed(2)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default IncomeManagementModal;
