import { useState, useEffect } from 'react';
import './FloatingAddButton.css';

const FloatingAddButton = ({ onAddExpense, expenseCount = 0 }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Show floating button when expense list has more than 10 items
    setIsVisible(expenseCount > 10);
  }, [expenseCount]);

  if (!isVisible) return null;

  return (
    <button 
      className="floating-add-button"
      onClick={onAddExpense}
      aria-label="Add new expense"
      title="Add new expense"
    >
      <span className="fab-icon">+</span>
      <span className="fab-text">Add Expense</span>
    </button>
  );
};

export default FloatingAddButton;