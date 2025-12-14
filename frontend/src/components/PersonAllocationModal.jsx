import { useState, useEffect } from 'react';
import './PersonAllocationModal.css';

const PersonAllocationModal = ({ 
  isOpen, 
  expense, 
  selectedPeople, 
  onSave, 
  onCancel 
}) => {
  const [allocations, setAllocations] = useState([]);
  const [totalAllocated, setTotalAllocated] = useState(0);
  const [isValid, setIsValid] = useState(false);
  const [error, setError] = useState('');

  // Initialize allocations when modal opens or people change
  useEffect(() => {
    if (isOpen && selectedPeople && selectedPeople.length > 0) {
      const initialAllocations = selectedPeople.map(person => ({
        personId: person.id,
        personName: person.name,
        amount: 0
      }));
      setAllocations(initialAllocations);
      setTotalAllocated(0);
      setError('');
    }
  }, [isOpen, selectedPeople]);

  // Calculate total and validate whenever allocations change
  useEffect(() => {
    const total = allocations.reduce((sum, allocation) => sum + (allocation.amount || 0), 0);
    setTotalAllocated(total);
    
    const expenseAmount = expense?.amount || 0;
    const isValidTotal = Math.abs(total - expenseAmount) < 0.01; // Allow for floating point precision
    setIsValid(isValidTotal && allocations.every(a => a.amount > 0));
    
    if (total > expenseAmount) {
      setError(`Total allocated ($${total.toFixed(2)}) exceeds expense amount ($${expenseAmount.toFixed(2)})`);
    } else if (total < expenseAmount && total > 0) {
      setError(`Total allocated ($${total.toFixed(2)}) is less than expense amount ($${expenseAmount.toFixed(2)})`);
    } else if (allocations.some(a => a.amount <= 0) && total > 0) {
      setError('All amounts must be greater than zero');
    } else {
      setError('');
    }
  }, [allocations, expense]);

  const handleAmountChange = (personId, value) => {
    const amount = parseFloat(value) || 0;
    setAllocations(prev => 
      prev.map(allocation => 
        allocation.personId === personId 
          ? { ...allocation, amount }
          : allocation
      )
    );
  };

  const handleSplitEqually = () => {
    if (!expense || allocations.length === 0) return;
    
    const amountPerPerson = expense.amount / allocations.length;
    setAllocations(prev => 
      prev.map(allocation => ({
        ...allocation,
        amount: parseFloat(amountPerPerson.toFixed(2))
      }))
    );
  };

  const handleSave = () => {
    if (!isValid) return;
    
    // Return allocations with the required format
    const formattedAllocations = allocations.map(allocation => ({
      id: allocation.personId,
      name: allocation.personName,
      amount: allocation.amount
    }));
    
    onSave(formattedAllocations);
  };

  const handleCancel = () => {
    setAllocations([]);
    setTotalAllocated(0);
    setError('');
    onCancel();
  };

  if (!isOpen) return null;

  const expenseAmount = expense?.amount || 0;
  const remaining = expenseAmount - totalAllocated;

  return (
    <div className="modal-overlay">
      <div className="person-allocation-modal">
        <div className="modal-header">
          <h3>Allocate Expense Amount</h3>
          <button 
            type="button" 
            className="close-button"
            onClick={handleCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="expense-info">
            <p><strong>Total Expense:</strong> ${expenseAmount.toFixed(2)}</p>
            <p><strong>Total Allocated:</strong> ${totalAllocated.toFixed(2)}</p>
            <p className={remaining === 0 ? 'remaining-zero' : remaining < 0 ? 'remaining-negative' : 'remaining-positive'}>
              <strong>Remaining:</strong> ${remaining.toFixed(2)}
            </p>
          </div>

          <div className="allocation-controls">
            <button 
              type="button" 
              className="split-equally-button"
              onClick={handleSplitEqually}
            >
              Split Equally
            </button>
          </div>

          <div className="allocations-list">
            {allocations.map(allocation => (
              <div key={allocation.personId} className="allocation-row">
                <label className="person-label">
                  {allocation.personName}
                </label>
                <div className="amount-input-wrapper">
                  <span className="currency-symbol">$</span>
                  <input
                    type="number"
                    value={allocation.amount || ''}
                    onChange={(e) => handleAmountChange(allocation.personId, e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="amount-input"
                  />
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button 
            type="button" 
            className="cancel-button"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button 
            type="button" 
            className="save-button"
            onClick={handleSave}
            disabled={!isValid}
          >
            Save Allocation
          </button>
        </div>
      </div>
    </div>
  );
};

export default PersonAllocationModal;