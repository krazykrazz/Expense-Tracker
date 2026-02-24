import { useState, useEffect } from 'react';
import HelpTooltip from './HelpTooltip';
import './PersonAllocationModal.css';

/**
 * PersonAllocationModal - Modal for allocating expense amounts to multiple people
 * 
 * For insurance-eligible medical expenses (Requirements 4.1, 4.2, 4.3, 4.4):
 * - Uses original_cost for allocation base
 * - Tracks both original_amount and amount per person
 * - Validates per-person out-of-pocket amounts don't exceed original cost allocations
 */
const PersonAllocationModal = ({ 
  isOpen, 
  expense, 
  selectedPeople, 
  onSave, 
  onCancel,
  // Insurance-related props (Requirements 4.1, 4.2, 4.3, 4.4)
  insuranceEligible = false,
  originalCost = null
}) => {
  const [allocations, setAllocations] = useState([]);
  const [totalAllocated, setTotalAllocated] = useState(0);
  const [totalOriginalAllocated, setTotalOriginalAllocated] = useState(0);
  const [isValid, setIsValid] = useState(false);
  const [error, setError] = useState('');

  // Determine the base amount for allocation
  // For insurance expenses, use original_cost; otherwise use expense amount
  const allocationBase = insuranceEligible && originalCost ? originalCost : (expense?.amount || 0);
  const expenseAmount = expense?.amount || 0;

  // Initialize allocations when modal opens or people change
  useEffect(() => {
    if (isOpen && selectedPeople && selectedPeople.length > 0) {
      const initialAllocations = selectedPeople.map(person => ({
        personId: person.id,
        personName: person.name,
        // Use existing amounts if available, otherwise start at 0
        amount: person.amount || 0,
        originalAmount: insuranceEligible ? (person.originalAmount || 0) : null
      }));
      setAllocations(initialAllocations);
      
      // Calculate initial totals from existing allocations
      const initialTotal = initialAllocations.reduce((sum, a) => sum + (a.amount || 0), 0);
      setTotalAllocated(initialTotal);
      
      if (insuranceEligible) {
        const initialOriginalTotal = initialAllocations.reduce((sum, a) => sum + (a.originalAmount || 0), 0);
        setTotalOriginalAllocated(initialOriginalTotal);
      } else {
        setTotalOriginalAllocated(0);
      }
      setError('');
    }
  }, [isOpen, selectedPeople, insuranceEligible]);

  // Calculate totals and validate whenever allocations change
  useEffect(() => {
    const total = allocations.reduce((sum, allocation) => sum + (allocation.amount || 0), 0);
    setTotalAllocated(total);
    
    if (insuranceEligible) {
      const totalOriginal = allocations.reduce((sum, allocation) => sum + (allocation.originalAmount || 0), 0);
      setTotalOriginalAllocated(totalOriginal);
      
      // For insurance expenses, validate both original and out-of-pocket allocations
      const isValidOriginal = Math.abs(totalOriginal - allocationBase) < 0.01;
      const isValidAmount = Math.abs(total - expenseAmount) < 0.01;
      const allPositive = allocations.every(a => a.amount > 0 && a.originalAmount > 0);
      const amountsValid = allocations.every(a => (a.amount || 0) <= (a.originalAmount || 0));
      
      setIsValid(isValidOriginal && isValidAmount && allPositive && amountsValid);
      
      // Set appropriate error messages
      if (totalOriginal > allocationBase) {
        setError(`Total original cost allocated ($${totalOriginal.toFixed(2)}) exceeds original cost ($${allocationBase.toFixed(2)})`);
      } else if (totalOriginal < allocationBase && totalOriginal > 0) {
        setError(`Total original cost allocated ($${totalOriginal.toFixed(2)}) is less than original cost ($${allocationBase.toFixed(2)})`);
      } else if (total > expenseAmount) {
        setError(`Total out-of-pocket allocated ($${total.toFixed(2)}) exceeds expense amount ($${expenseAmount.toFixed(2)})`);
      } else if (total < expenseAmount && total > 0) {
        setError(`Total out-of-pocket allocated ($${total.toFixed(2)}) is less than expense amount ($${expenseAmount.toFixed(2)})`);
      } else if (!amountsValid) {
        setError('Out-of-pocket amount cannot exceed original cost for any person');
      } else if (allocations.some(a => (a.amount <= 0 || a.originalAmount <= 0)) && (total > 0 || totalOriginal > 0)) {
        setError('All amounts must be greater than zero');
      } else {
        setError('');
      }
    } else {
      // Standard validation for non-insurance expenses
      const isValidTotal = Math.abs(total - expenseAmount) < 0.01;
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
    }
  }, [allocations, expense, insuranceEligible, allocationBase, expenseAmount]);

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

  const handleOriginalAmountChange = (personId, value) => {
    const originalAmount = parseFloat(value) || 0;
    setAllocations(prev => 
      prev.map(allocation => 
        allocation.personId === personId 
          ? { ...allocation, originalAmount }
          : allocation
      )
    );
  };

  const handleSplitEqually = () => {
    if (allocations.length === 0) return;
    
    if (insuranceEligible) {
      // Split both original cost and out-of-pocket equally
      const originalPerPerson = allocationBase / allocations.length;
      const amountPerPerson = expenseAmount / allocations.length;
      setAllocations(prev => 
        prev.map(allocation => ({
          ...allocation,
          originalAmount: parseFloat(originalPerPerson.toFixed(2)),
          amount: parseFloat(amountPerPerson.toFixed(2))
        }))
      );
    } else {
      // Standard split for non-insurance expenses
      const amountPerPerson = expenseAmount / allocations.length;
      setAllocations(prev => 
        prev.map(allocation => ({
          ...allocation,
          amount: parseFloat(amountPerPerson.toFixed(2))
        }))
      );
    }
  };

  const handleSave = () => {
    if (!isValid) return;
    
    // Return allocations with the required format
    const formattedAllocations = allocations.map(allocation => ({
      id: allocation.personId,
      name: allocation.personName,
      amount: allocation.amount,
      originalAmount: insuranceEligible ? allocation.originalAmount : null
    }));
    
    onSave(formattedAllocations);
  };

  const handleCancel = () => {
    setAllocations([]);
    setTotalAllocated(0);
    setTotalOriginalAllocated(0);
    setError('');
    onCancel();
  };

  if (!isOpen) return null;

  const remaining = expenseAmount - totalAllocated;
  const remainingOriginal = insuranceEligible ? allocationBase - totalOriginalAllocated : 0;

  return (
    <div className="modal-overlay">
      <div className={`person-allocation-modal ${insuranceEligible ? 'insurance-mode' : ''}`}>
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
            {insuranceEligible ? (
              <>
                <div className="expense-info-row">
                  <div className="expense-info-item">
                    <span className="info-label">Original Cost:</span>
                    <span className="info-value">${allocationBase.toFixed(2)}</span>
                  </div>
                  <div className="expense-info-item">
                    <span className="info-label">Out-of-Pocket:</span>
                    <span className="info-value">${expenseAmount.toFixed(2)}</span>
                  </div>
                </div>
                <div className="expense-info-row">
                  <div className="expense-info-item">
                    <span className="info-label">Original Allocated:</span>
                    <span className="info-value">${totalOriginalAllocated.toFixed(2)}</span>
                  </div>
                  <div className="expense-info-item">
                    <span className="info-label">OOP Allocated:</span>
                    <span className="info-value">${totalAllocated.toFixed(2)}</span>
                  </div>
                </div>
                <div className="expense-info-row">
                  <div className={`expense-info-item ${remainingOriginal === 0 ? 'remaining-zero' : remainingOriginal < 0 ? 'remaining-negative' : 'remaining-positive'}`}>
                    <span className="info-label">Original Remaining:</span>
                    <span className="info-value">${remainingOriginal.toFixed(2)}</span>
                  </div>
                  <div className={`expense-info-item ${remaining === 0 ? 'remaining-zero' : remaining < 0 ? 'remaining-negative' : 'remaining-positive'}`}>
                    <span className="info-label">OOP Remaining:</span>
                    <span className="info-value">${remaining.toFixed(2)}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p><strong>Total Expense:</strong> ${expenseAmount.toFixed(2)}</p>
                <p><strong>Total Allocated:</strong> ${totalAllocated.toFixed(2)}</p>
                <p className={remaining === 0 ? 'remaining-zero' : remaining < 0 ? 'remaining-negative' : 'remaining-positive'}>
                  <strong>Remaining:</strong> ${remaining.toFixed(2)}
                </p>
              </>
            )}
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
            {insuranceEligible && (
              <div className="allocation-header">
                <span className="header-person">Person</span>
                <span className="header-original">
                  Original Cost <HelpTooltip content="The full expense before reimbursement" position="top" />
                </span>
                <span className="header-oop">
                  Out-of-Pocket <HelpTooltip content="What each person actually paid after insurance" position="top" />
                </span>
              </div>
            )}
            {allocations.map(allocation => (
              <div key={allocation.personId} className={`allocation-row ${insuranceEligible ? 'insurance-row' : ''}`}>
                <label className="person-label">
                  {allocation.personName}
                </label>
                {insuranceEligible && (
                  <div className="amount-input-wrapper original-amount">
                    <span className="currency-symbol">$</span>
                    <input
                      type="number"
                      value={allocation.originalAmount || ''}
                      onChange={(e) => handleOriginalAmountChange(allocation.personId, e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      className="amount-input form-input"
                    />
                  </div>
                )}
                <div className="amount-input-wrapper">
                  <span className="currency-symbol">$</span>
                  <input
                    type="number"
                    value={allocation.amount || ''}
                    onChange={(e) => handleAmountChange(allocation.personId, e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="amount-input form-input"
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
            className="cancel-button btn-cancel"
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button 
            type="button" 
            className="save-button btn-primary"
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
