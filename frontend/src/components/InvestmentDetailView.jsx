import { useState, useEffect } from 'react';
import './InvestmentDetailView.css';
import { getValueHistory, createOrUpdateValue, deleteValue } from '../services/investmentValueApi';
import { updateInvestment } from '../services/investmentApi';
import { formatCurrency, formatMonthYear } from '../utils/formatters';
import { validateAmount, validateName } from '../utils/validation';

const InvestmentDetailView = ({ investment, isOpen, onClose, onUpdate }) => {
  const [investmentData, setInvestmentData] = useState(investment);
  const [valueHistory, setValueHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  
  // Edit states
  const [isEditingInvestment, setIsEditingInvestment] = useState(false);
  const [editingValueId, setEditingValueId] = useState(null);
  const [showAddValueForm, setShowAddValueForm] = useState(false);
  
  // Form states
  const [investmentFormData, setInvestmentFormData] = useState({
    name: '',
    type: '',
    initial_value: ''
  });
  
  const [valueFormData, setValueFormData] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    value: ''
  });
  
  const [validationErrors, setValidationErrors] = useState({});

  // Fetch value history when modal opens or investment changes
  useEffect(() => {
    if (isOpen && investment) {
      setInvestmentData(investment);
      setInvestmentFormData({
        name: investment.name,
        type: investment.type,
        initial_value: investment.initial_value.toString()
      });
      fetchValueHistory();
    }
  }, [isOpen, investment]);

  const fetchValueHistory = async () => {
    if (!investment || !investment.id) return;
    
    setLoading(true);
    setError(null);

    try {
      const data = await getValueHistory(investment.id);
      setValueHistory(data || []);
    } catch (err) {
      const errorMessage = err.message || 'Failed to load value history';
      setError(errorMessage);
      console.error('Error fetching value history:', err);
    } finally {
      setLoading(false);
    }
  };

  const clearMessages = () => {
    setError(null);
    setSuccessMessage(null);
  };

  const showSuccess = (message) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleEditValue = (valueEntry) => {
    setEditingValueId(valueEntry.id);
    setValueFormData({
      year: valueEntry.year,
      month: valueEntry.month,
      value: valueEntry.value.toString()
    });
    setValidationErrors({});
    clearMessages();
  };

  const handleSaveValue = async (valueId) => {
    clearMessages();
    
    // Validate value entry
    const errors = {};
    
    const valueError = validateAmount(valueFormData.value);
    if (valueError) {
      errors.value = valueError;
    }
    
    if (valueFormData.month < 1 || valueFormData.month > 12) {
      errors.month = 'Month must be between 1 and 12';
    }
    
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setError('Please fix the validation errors before saving.');
      return;
    }

    setLoading(true);

    try {
      await createOrUpdateValue({
        id: valueId,
        investment_id: investmentData.id,
        year: parseInt(valueFormData.year),
        month: parseInt(valueFormData.month),
        value: parseFloat(valueFormData.value)
      });
      
      // Refresh value history
      await fetchValueHistory();
      
      setEditingValueId(null);
      showSuccess('Value entry updated successfully');
      
      // Notify parent to refresh
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      const errorMessage = err.message || 'Failed to update value entry';
      setError(errorMessage);
      console.error('Error updating value:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEditValue = () => {
    setEditingValueId(null);
    setValidationErrors({});
    clearMessages();
  };

  const handleDeleteValue = async (valueId) => {
    if (!window.confirm('Are you sure you want to delete this value entry?')) {
      return;
    }

    clearMessages();
    setLoading(true);

    try {
      await deleteValue(valueId);
      
      // Refresh value history
      await fetchValueHistory();
      
      showSuccess('Value entry deleted successfully');
      
      // Notify parent to refresh
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      const errorMessage = err.message || 'Failed to delete value entry';
      setError(errorMessage);
      console.error('Error deleting value:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleShowAddValueForm = () => {
    setShowAddValueForm(true);
    setValueFormData({
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      value: ''
    });
    setValidationErrors({});
    clearMessages();
  };

  const handleAddValue = async () => {
    clearMessages();
    
    // Validate value entry
    const errors = {};
    
    const valueError = validateAmount(valueFormData.value);
    if (valueError) {
      errors.value = valueError;
    }
    
    if (valueFormData.month < 1 || valueFormData.month > 12) {
      errors.month = 'Month must be between 1 and 12';
    }
    
    if (!valueFormData.year || valueFormData.year < 1900 || valueFormData.year > 2100) {
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
      const existingEntry = valueHistory.find(
        entry => entry.year === parseInt(valueFormData.year) && 
                 entry.month === parseInt(valueFormData.month)
      );
      
      if (existingEntry) {
        setError(`A value entry already exists for ${formatMonthYear(valueFormData.year, valueFormData.month)}. It will be updated with the new value.`);
      }
      
      await createOrUpdateValue({
        investment_id: investmentData.id,
        year: parseInt(valueFormData.year),
        month: parseInt(valueFormData.month),
        value: parseFloat(valueFormData.value)
      });
      
      // Refresh value history
      await fetchValueHistory();
      
      setShowAddValueForm(false);
      showSuccess(existingEntry ? 'Value entry updated successfully' : 'Value entry added successfully');
      
      // Notify parent to refresh
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      const errorMessage = err.message || 'Failed to add value entry';
      setError(errorMessage);
      console.error('Error adding value:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAddValue = () => {
    setShowAddValueForm(false);
    setValidationErrors({});
    clearMessages();
  };

  const handleEditInvestmentDetails = () => {
    setIsEditingInvestment(true);
    setInvestmentFormData({
      name: investmentData.name,
      type: investmentData.type,
      initial_value: investmentData.initial_value.toString()
    });
    setValidationErrors({});
    clearMessages();
  };

  const handleSaveInvestmentDetails = async () => {
    clearMessages();
    
    // Validate investment
    const errors = {};
    
    const nameError = validateName(investmentFormData.name);
    if (nameError) {
      errors.name = nameError;
    }
    
    const initialValueError = validateAmount(investmentFormData.initial_value);
    if (initialValueError) {
      errors.initial_value = initialValueError;
    }
    
    if (!['TFSA', 'RRSP'].includes(investmentFormData.type)) {
      errors.type = 'Type must be TFSA or RRSP';
    }
    
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setError('Please fix the validation errors before saving.');
      return;
    }

    setLoading(true);

    try {
      await updateInvestment(investmentData.id, {
        name: investmentFormData.name.trim(),
        type: investmentFormData.type,
        initial_value: parseFloat(investmentFormData.initial_value)
      });
      
      // Update local state
      setInvestmentData({
        ...investmentData,
        name: investmentFormData.name.trim(),
        type: investmentFormData.type,
        initial_value: parseFloat(investmentFormData.initial_value)
      });
      
      setIsEditingInvestment(false);
      showSuccess('Investment details updated successfully');
      
      // Notify parent to refresh
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      const errorMessage = err.message || 'Failed to update investment details';
      setError(errorMessage);
      console.error('Error updating investment:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEditInvestment = () => {
    setIsEditingInvestment(false);
    setValidationErrors({});
    clearMessages();
  };

  // Calculate derived values
  const currentValue = investmentData?.currentValue || investmentData?.initial_value || 0;
  const totalChange = currentValue - (investmentData?.initial_value || 0);
  const percentageChange = investmentData?.initial_value > 0 
    ? ((totalChange / investmentData.initial_value) * 100)
    : 0;

  const handleClose = () => {
    // Reset all state
    setIsEditingInvestment(false);
    setEditingValueId(null);
    setShowAddValueForm(false);
    setValidationErrors({});
    clearMessages();
    
    onClose();
  };

  if (!isOpen || !investmentData) {
    return null;
  }

  return (
    <div className="investment-detail-overlay" onClick={handleClose}>
      <div className="investment-detail-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="investment-detail-header">
          <button className="investment-detail-back-button" onClick={handleClose}>
            ← Back
          </button>
          <h2>
            {investmentData.name}
            <span className="investment-type-badge-header">{investmentData.type}</span>
          </h2>
          <button className="investment-detail-close" onClick={handleClose}>✕</button>
        </div>

        {/* Messages */}
        {error && (
          <div className="investment-detail-error">{error}</div>
        )}
        {successMessage && (
          <div className="investment-detail-success">{successMessage}</div>
        )}

        <div className="investment-detail-content">
          {/* Investment Summary Card */}
          <div className="investment-summary-card">
            <h3>Investment Summary</h3>
            
            {isEditingInvestment ? (
              <div className="investment-edit-form">
                <div className="investment-input-group">
                  <label>Investment Name *</label>
                  <input
                    type="text"
                    value={investmentFormData.name}
                    onChange={(e) => setInvestmentFormData({ ...investmentFormData, name: e.target.value })}
                    className={validationErrors.name ? 'input-error' : ''}
                    disabled={loading}
                  />
                  {validationErrors.name && (
                    <span className="validation-error">{validationErrors.name}</span>
                  )}
                </div>
                
                <div className="investment-input-group">
                  <label>Type *</label>
                  <select
                    value={investmentFormData.type}
                    onChange={(e) => setInvestmentFormData({ ...investmentFormData, type: e.target.value })}
                    className={validationErrors.type ? 'input-error' : ''}
                    disabled={loading}
                  >
                    <option value="TFSA">TFSA</option>
                    <option value="RRSP">RRSP</option>
                  </select>
                  {validationErrors.type && (
                    <span className="validation-error">{validationErrors.type}</span>
                  )}
                </div>
                
                <div className="investment-input-group">
                  <label>Initial Value *</label>
                  <input
                    type="number"
                    value={investmentFormData.initial_value}
                    onChange={(e) => setInvestmentFormData({ ...investmentFormData, initial_value: e.target.value })}
                    className={validationErrors.initial_value ? 'input-error' : ''}
                    disabled={loading}
                    step="0.01"
                    min="0"
                  />
                  {validationErrors.initial_value && (
                    <span className="validation-error">{validationErrors.initial_value}</span>
                  )}
                </div>
                
                <div className="investment-edit-actions">
                  <button
                    className="investment-save-button"
                    onClick={handleSaveInvestmentDetails}
                    disabled={loading}
                  >
                    {loading ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    className="investment-cancel-button"
                    onClick={handleCancelEditInvestment}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="investment-summary-grid">
                  <div className="investment-summary-item">
                    <span className="investment-summary-label">Initial Value:</span>
                    <span className="investment-summary-value">
                      {formatCurrency(investmentData.initial_value)}
                    </span>
                  </div>
                  
                  <div className="investment-summary-item">
                    <span className="investment-summary-label">Current Value:</span>
                    <span className="investment-summary-value investment-current-value">
                      {formatCurrency(currentValue)}
                    </span>
                  </div>
                  
                  <div className="investment-summary-item">
                    <span className="investment-summary-label">Total Change:</span>
                    <span className={`investment-summary-value ${totalChange >= 0 ? 'investment-gain' : 'investment-loss'}`}>
                      {totalChange >= 0 ? '+' : ''}{formatCurrency(totalChange)}
                    </span>
                  </div>
                  
                  <div className="investment-summary-item">
                    <span className="investment-summary-label">Percentage Change:</span>
                    <span className={`investment-summary-value ${percentageChange >= 0 ? 'investment-gain' : 'investment-loss'}`}>
                      {percentageChange >= 0 ? '+' : ''}{percentageChange.toFixed(2)}%
                    </span>
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="investment-summary-actions">
                  <button
                    className="investment-edit-details-button"
                    onClick={handleEditInvestmentDetails}
                    disabled={loading}
                  >
                    ✏️ Edit Investment Details
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Line Graph Visualization */}
          {valueHistory.length > 0 && (
            <div className="investment-chart-section">
              <div className="investment-chart-header">
                <div className="investment-chart-label">
                  Value Over Time
                </div>
              </div>
              <div className="investment-line-chart">
                {(() => {
                  // Prepare data in chronological order (oldest first)
                  const chartData = [...valueHistory].reverse();
                  const maxValue = Math.max(
                    investmentData.initial_value,
                    ...chartData.map(entry => entry.value),
                    1
                  );
                  const minValue = Math.min(
                    investmentData.initial_value,
                    ...chartData.map(entry => entry.value)
                  );
                  
                  const chartWidth = 600;
                  const chartHeight = 200;
                  const padding = { top: 20, right: 40, bottom: 40, left: 70 };
                  const graphWidth = chartWidth - padding.left - padding.right;
                  const graphHeight = chartHeight - padding.top - padding.bottom;
                  
                  // Calculate points for value line
                  const valuePoints = chartData.map((entry, index) => {
                    const x = padding.left + (index / (chartData.length - 1 || 1)) * graphWidth;
                    const y = padding.top + graphHeight - ((entry.value - minValue) / (maxValue - minValue || 1)) * graphHeight;
                    return { x, y, entry };
                  });
                  
                  // Create path
                  const valueLinePath = valuePoints.map((point, index) => 
                    `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
                  ).join(' ');
                  
                  const areaPath = `${valueLinePath} L ${valuePoints[valuePoints.length - 1].x} ${chartHeight - padding.bottom} L ${padding.left} ${chartHeight - padding.bottom} Z`;
                  
                  return (
                    <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="xMidYMid meet">
                      {/* Y-axis grid lines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                        const y = padding.top + graphHeight * (1 - ratio);
                        const value = minValue + (maxValue - minValue) * ratio;
                        return (
                          <g key={`value-${ratio}`}>
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
                              fill="#28a745"
                            >
                              {formatCurrency(value)}
                            </text>
                          </g>
                        );
                      })}
                      
                      {/* Area under value line */}
                      <path
                        d={areaPath}
                        fill="url(#investmentGradient)"
                        opacity="0.2"
                      />
                      
                      {/* Value line */}
                      <path
                        d={valueLinePath}
                        fill="none"
                        stroke="#28a745"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      
                      {/* Data points */}
                      {valuePoints.map((point, index) => (
                        <circle
                          key={`value-${index}`}
                          cx={point.x}
                          cy={point.y}
                          r="5"
                          fill="#28a745"
                          stroke="white"
                          strokeWidth="2"
                          style={{ cursor: 'pointer' }}
                        >
                          <title>
                            {formatMonthYear(point.entry.year, point.entry.month)}: {formatCurrency(point.entry.value)}
                          </title>
                        </circle>
                      ))}
                      
                      {/* X-axis labels */}
                      {valuePoints.map((point, index) => {
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
                        <linearGradient id="investmentGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#28a745" stopOpacity="0.5" />
                          <stop offset="100%" stopColor="#28a745" stopOpacity="0.1" />
                        </linearGradient>
                      </defs>
                    </svg>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Value History Section */}
          <div className="investment-value-history-section">
            <div className="investment-value-history-header">
              <h3>Value History</h3>
              <button
                className="investment-add-value-button"
                onClick={handleShowAddValueForm}
                disabled={loading || showAddValueForm}
              >
                + Add Value Entry
              </button>
            </div>

            {/* Add Value Form */}
            {showAddValueForm && (
              <div className="investment-add-value-form">
                <h4>Add Value Entry</h4>
                <div className="investment-form-row">
                  <div className="investment-input-group">
                    <label>Month *</label>
                    <select
                      value={valueFormData.month}
                      onChange={(e) => setValueFormData({ ...valueFormData, month: parseInt(e.target.value) })}
                      disabled={loading}
                      className={validationErrors.month ? 'input-error' : ''}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                        <option key={m} value={m}>
                          {new Date(2000, m - 1).toLocaleDateString('en-US', { month: 'long' })}
                        </option>
                      ))}
                    </select>
                    {validationErrors.month && (
                      <span className="validation-error">{validationErrors.month}</span>
                    )}
                  </div>
                  
                  <div className="investment-input-group">
                    <label>Year *</label>
                    <input
                      type="number"
                      value={valueFormData.year}
                      onChange={(e) => setValueFormData({ ...valueFormData, year: parseInt(e.target.value) })}
                      disabled={loading}
                      min="1900"
                      max="2100"
                      className={validationErrors.year ? 'input-error' : ''}
                    />
                    {validationErrors.year && (
                      <span className="validation-error">{validationErrors.year}</span>
                    )}
                  </div>
                  
                  <div className="investment-input-group">
                    <label>Value *</label>
                    <input
                      type="number"
                      value={valueFormData.value}
                      onChange={(e) => setValueFormData({ ...valueFormData, value: e.target.value })}
                      disabled={loading}
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className={validationErrors.value ? 'input-error' : ''}
                    />
                    {validationErrors.value && (
                      <span className="validation-error">{validationErrors.value}</span>
                    )}
                  </div>
                </div>
                
                <div className="investment-form-actions">
                  <button
                    className="investment-save-button"
                    onClick={handleAddValue}
                    disabled={loading}
                  >
                    {loading ? 'Adding...' : 'Add Value'}
                  </button>
                  <button
                    className="investment-cancel-button"
                    onClick={handleCancelAddValue}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {loading && valueHistory.length === 0 ? (
              <div className="investment-loading">Loading value history...</div>
            ) : valueHistory.length === 0 ? (
              <div className="investment-empty-history">
                No value entries yet. Add a value entry to track your investment performance over time.
              </div>
            ) : (
              <div className="investment-value-table-container">
                <table className="investment-value-table">
                  <thead>
                    <tr>
                      <th>Month/Year</th>
                      <th>Value</th>
                      <th>Change</th>
                      <th>% Change</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {valueHistory.map((entry) => (
                      editingValueId === entry.id ? (
                        <tr key={entry.id} className="investment-value-edit-row">
                          <td>
                            <div className="investment-value-edit-date">
                              <select
                                value={valueFormData.month}
                                onChange={(e) => setValueFormData({ ...valueFormData, month: parseInt(e.target.value) })}
                                disabled={loading}
                                className={validationErrors.month ? 'input-error' : ''}
                              >
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                                  <option key={m} value={m}>
                                    {new Date(2000, m - 1).toLocaleDateString('en-US', { month: 'long' })}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="number"
                                value={valueFormData.year}
                                onChange={(e) => setValueFormData({ ...valueFormData, year: parseInt(e.target.value) })}
                                disabled={loading}
                                min="1900"
                                max="2100"
                              />
                            </div>
                            {validationErrors.month && (
                              <span className="validation-error">{validationErrors.month}</span>
                            )}
                          </td>
                          <td>
                            <input
                              type="number"
                              value={valueFormData.value}
                              onChange={(e) => setValueFormData({ ...valueFormData, value: e.target.value })}
                              disabled={loading}
                              step="0.01"
                              min="0"
                              className={validationErrors.value ? 'input-error' : ''}
                            />
                            {validationErrors.value && (
                              <span className="validation-error">{validationErrors.value}</span>
                            )}
                          </td>
                          <td colSpan="2">
                            <div className="investment-value-edit-actions">
                              <button
                                className="investment-save-button"
                                onClick={() => handleSaveValue(entry.id)}
                                disabled={loading}
                              >
                                {loading ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                className="investment-cancel-button"
                                onClick={handleCancelEditValue}
                                disabled={loading}
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                          <td></td>
                        </tr>
                      ) : (
                        <tr key={entry.id} className="investment-value-row">
                          <td className="investment-value-date">
                            {formatMonthYear(entry.year, entry.month)}
                          </td>
                          <td className="investment-value-amount">
                            {formatCurrency(entry.value)}
                          </td>
                          <td className={`investment-value-change ${
                            entry.valueChange === undefined || entry.valueChange === null ? '' :
                            entry.valueChange > 0 ? 'positive' : 
                            entry.valueChange < 0 ? 'negative' : 'neutral'
                          }`}>
                            {entry.valueChange === undefined || entry.valueChange === null ? '—' : (
                              <>
                                {entry.valueChange > 0 ? '▲' : entry.valueChange < 0 ? '▼' : '—'} {formatCurrency(Math.abs(entry.valueChange))}
                              </>
                            )}
                          </td>
                          <td className={`investment-value-percentage ${
                            entry.percentageChange === undefined || entry.percentageChange === null ? '' :
                            entry.percentageChange > 0 ? 'positive' : 
                            entry.percentageChange < 0 ? 'negative' : 'neutral'
                          }`}>
                            {entry.percentageChange === undefined || entry.percentageChange === null ? '—' : (
                              `${entry.percentageChange >= 0 ? '+' : ''}${entry.percentageChange.toFixed(2)}%`
                            )}
                          </td>
                          <td className="investment-value-actions">
                            <button
                              className="investment-edit-button"
                              onClick={() => handleEditValue(entry)}
                              disabled={loading}
                              title="Edit"
                            >
                              ✏️
                            </button>
                            <button
                              className="investment-delete-button"
                              onClick={() => handleDeleteValue(entry.id)}
                              disabled={loading}
                              title="Delete"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      )
                    ))}
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

export default InvestmentDetailView;
