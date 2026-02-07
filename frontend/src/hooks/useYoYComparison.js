import { useState, useEffect, useCallback } from 'react';
import { getTaxDeductibleSummary } from '../services/expenseApi';
import { calculatePercentageChange, getChangeIndicator } from '../utils/yoyComparison';

/**
 * Custom hook for year-over-year comparison of tax deductible expenses
 * 
 * Fetches previous year data and provides comparison utilities
 * 
 * @param {Object} options
 * @param {number} options.year - Current year
 * @param {number} options.refreshTrigger - Trigger to re-fetch data
 * @returns {Object} YoY comparison state and utilities
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */
const useYoYComparison = ({ year, refreshTrigger }) => {
  const [previousYearData, setPreviousYearData] = useState(null);
  const [yoyLoading, setYoyLoading] = useState(false);
  const [yoyError, setYoyError] = useState(null);

  // Fetch previous year data when year or refreshTrigger changes
  useEffect(() => {
    const fetchPreviousYearData = async () => {
      setYoyLoading(true);
      setYoyError(null);
      
      try {
        const previousYear = year - 1;
        const data = await getTaxDeductibleSummary(previousYear);
        setPreviousYearData(data);
      } catch (err) {
        console.error('Error fetching previous year data:', err);
        setYoyError('Unable to load previous year data');
        setPreviousYearData(null);
      } finally {
        setYoyLoading(false);
      }
    };
    
    fetchPreviousYearData();
  }, [year, refreshTrigger]);

  // Wrap calculatePercentageChange for convenience
  const calculateChange = useCallback((current, previous) => {
    return calculatePercentageChange(current, previous);
  }, []);

  // Wrap getChangeIndicator for convenience
  const getIndicator = useCallback((direction) => {
    return getChangeIndicator(direction);
  }, []);

  return {
    previousYearData,
    yoyLoading,
    yoyError,
    calculateChange,
    getIndicator,
  };
};

export default useYoYComparison;
