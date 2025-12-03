import React from 'react';
import CategoryList from './CategoryList';
import './CategoriesTab.css';

/**
 * CategoriesTab Component
 * Wrapper component for the Categories tab content
 * Displays expense categories using the CategoryList component
 * 
 * @param {Object} typeTotals - Current month's category totals (e.g., { "Groceries": 500, "Gas": 200 })
 * @param {Object} previousTypeTotals - Previous month's category totals for trend indicators
 */
const CategoriesTab = ({ typeTotals = {}, previousTypeTotals = {} }) => {
  // Transform the typeTotals object into the format expected by CategoryList
  const categories = Object.entries(typeTotals).map(([name, currentValue]) => ({
    name,
    currentValue: currentValue || 0,
    previousValue: previousTypeTotals[name] || 0
  }));

  return (
    <div className="categories-tab">
      <CategoryList categories={categories} initialDisplayCount={5} />
    </div>
  );
};

export default CategoriesTab;
