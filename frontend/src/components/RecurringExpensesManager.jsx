import React, { useState, useEffect } from 'react';
import RecurringExpenseForm from './RecurringExpenseForm';
import './RecurringExpensesManager.css';

const RecurringExpensesManager = ({ onClose }) => {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/recurring');
      
      if (!response.ok) {
        throw new Error('Failed to fetch recurring expenses');
      }
      
      const data = await response.json();
      setTemplates(data);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching recurring expenses:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, place) => {
    if (!window.confirm(`Are you sure you want to delete the recurring expense for "${place}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/recurring/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete recurring expense');
      }

      setMessage({ text: 'Recurring expense deleted successfully', type: 'success' });
      fetchTemplates();
      
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    } catch (err) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handleTogglePause = async (id, currentPausedState) => {
    try {
      const response = await fetch(`/api/recurring/${id}/pause`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ paused: !currentPausedState })
      });

      if (!response.ok) {
        throw new Error('Failed to update recurring expense');
      }

      setMessage({ 
        text: `Recurring expense ${!currentPausedState ? 'paused' : 'resumed'} successfully`, 
        type: 'success' 
      });
      fetchTemplates();
      
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    } catch (err) {
      setMessage({ text: err.message, type: 'error' });
    }
  };

  const handleAddNew = () => {
    setEditingTemplate(null);
    setShowForm(true);
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingTemplate(null);
  };

  const handleTemplateSaved = (savedTemplate) => {
    setMessage({ 
      text: `Recurring expense ${editingTemplate ? 'updated' : 'created'} successfully`, 
      type: 'success' 
    });
    setShowForm(false);
    setEditingTemplate(null);
    fetchTemplates();
    
    setTimeout(() => setMessage({ text: '', type: '' }), 3000);
  };

  const formatMonth = (monthStr) => {
    if (!monthStr) return 'Ongoing';
    const [year, month] = monthStr.split('-');
    const date = new Date(year, parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const formatAmount = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  return (
    <div className="recurring-manager">
      <div className="recurring-header">
        <h2>🔄 Recurring Expenses</h2>
        <button className="add-new-button" onClick={handleAddNew}>+ Add New</button>
      </div>

      {message.text && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {loading && <div className="loading-message">Loading recurring expenses...</div>}
      {error && <div className="error-message">Error: {error}</div>}

      {!loading && !error && templates.length === 0 && (
        <div className="empty-state">
          <p>No recurring expenses yet.</p>
          <p>Click "Add New" to create your first recurring expense.</p>
        </div>
      )}

      {!loading && !error && templates.length > 0 && (
        <div className="templates-list">
          {templates.map(template => (
            <div key={template.id} className={`template-card ${template.paused ? 'paused' : ''}`}>
              <div className="template-main">
                <div className="template-icon">🔄</div>
                <div className="template-info">
                  <div className="template-place">{template.place || 'Unnamed'}</div>
                  <div className="template-details">
                    <span className="template-amount">{formatAmount(template.amount)}</span>
                    <span className="template-separator">•</span>
                    <span className="template-type">{template.type}</span>
                    <span className="template-separator">•</span>
                    <span className="template-method">{template.method}</span>
                    <span className="template-separator">•</span>
                    <span className="template-day">Day {template.day_of_month}</span>
                  </div>
                  <div className="template-date-range">
                    {formatMonth(template.start_month)} → {formatMonth(template.end_month)}
                  </div>
                  {template.paused && (
                    <div className="template-status">⏸️ Paused</div>
                  )}
                </div>
              </div>
              <div className="template-actions">
                <button
                  className="action-button pause-button"
                  onClick={() => handleTogglePause(template.id, template.paused)}
                  title={template.paused ? 'Resume' : 'Pause'}
                >
                  {template.paused ? '▶️' : '⏸️'}
                </button>
                <button
                  className="action-button edit-button"
                  onClick={() => handleEdit(template)}
                  title="Edit"
                >
                  ✏️
                </button>
                <button
                  className="action-button delete-button"
                  onClick={() => handleDelete(template.id, template.place)}
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="form-modal-overlay" onClick={handleFormClose}>
          <div className="form-modal-content" onClick={(e) => e.stopPropagation()}>
            <button 
              className="form-modal-close" 
              onClick={handleFormClose}
              aria-label="Close"
            >
              ×
            </button>
            <RecurringExpenseForm 
              template={editingTemplate}
              onSave={handleTemplateSaved}
              onCancel={handleFormClose}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default RecurringExpensesManager;
