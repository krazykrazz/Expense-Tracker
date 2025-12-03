import { useState, useMemo } from 'react';
import TrendIndicator from './TrendIndicator';
import { formatAmount } from '../utils/formatters';
import './CategoryList.css';

/**
 * CategoryList Component
 * Displays expense categories with filtering, sorting, and truncation
 * 
 * @param {Array} categories - Array of category objects with name, currentValue, previousValue
 * @param {number} initialDisplayCount - Number of categories to show by default (default: 5)
 */
const CategoryList = ({ categories = [], initialDisplayCount = 5 }) => {
  const [showAll, setShowAll] = useState(false);

  /**
   * Filter categories: only show categories where either current or previous value > 0
   * Sort by current amount in descending order
   */
  const processedCategories = useMemo(() => {
    // Filter out categories with zero values in both current and previous month
    const filtered = categories.filter(
      cat => (cat.currentValue || 0) > 0 || (cat.previousValue || 0) > 0
    );

    // Sort by current amount in descending order
    return filtered.sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0));
  }, [categories]);

  // Determine which categories to display based on showAll state
  const displayedCategories = useMemo(() => {
    if (showAll || processedCategories.length <= initialDisplayCount) {
      return processedCategories;
    }
    return processedCategories.slice(0, initialDisplayCount);
  }, [processedCategories, showAll, initialDisplayCount]);

  const hasMoreCategories = processedCategories.length > initialDisplayCount;

  const handleToggleShowAll = () => {
    setShowAll(prev => !prev);
  };

  if (processedCategories.length === 0) {
    return (
      <div className="category-list empty">
        <p className="category-list-empty-message">No expenses recorded this month</p>
      </div>
    );
  }

  return (
    <div className="category-list">
      <div className="category-items">
        {displayedCategories.map((category) => (
          <div key={category.name} className="category-item">
            <span className="category-name">{category.name}</span>
            <span className="category-value">
              ${formatAmount(category.currentValue || 0)}
              <TrendIndicator
                currentValue={category.currentValue || 0}
                previousValue={category.previousValue || 0}
              />
            </span>
          </div>
        ))}
      </div>
      
      {hasMoreCategories && (
        <button 
          className="category-toggle-btn"
          onClick={handleToggleShowAll}
          type="button"
        >
          {showAll 
            ? `Show less` 
            : `Show all (${processedCategories.length})`
          }
        </button>
      )}
    </div>
  );
};

export default CategoryList;
