import { useState, useEffect, useMemo, useCallback } from 'react';
import { getNetIncomeForYear, saveNetIncomeForYear, getSelectedProvince, saveSelectedProvince } from '../utils/taxSettingsStorage';
import { calculateAllTaxCredits } from '../utils/taxCreditCalculator';
import { getAnnualIncomeByCategory } from '../services/incomeApi';

/**
 * Custom hook for managing tax calculator state and computations
 * Extracted from TaxDeductible component (lines ~70-75, 175-185, 435-500)
 * 
 * @param {Object} options
 * @param {number} options.year - Tax year
 * @param {number} options.medicalTotal - Total medical expenses
 * @param {number} options.donationTotal - Total donation expenses
 * @returns {Object} Tax calculator state and handlers
 */
function useTaxCalculator({ year, medicalTotal = 0, donationTotal = 0 }) {
  const [netIncome, setNetIncome] = useState(null);
  const [netIncomeInput, setNetIncomeInput] = useState('');
  const [selectedProvince, setSelectedProvince] = useState('ON');
  const [loadingAppIncome, setLoadingAppIncome] = useState(false);

  // Load saved tax settings when year changes - Requirements 5.1, 5.6
  useEffect(() => {
    const savedNetIncome = getNetIncomeForYear(year);
    setNetIncome(savedNetIncome);
    setNetIncomeInput(savedNetIncome !== null ? savedNetIncome.toString() : '');
    
    const savedProvince = getSelectedProvince();
    setSelectedProvince(savedProvince);
  }, [year]);

  // Handle net income input changes - Requirements 5.2
  const handleNetIncomeChange = useCallback((e) => {
    const value = e.target.value;
    setNetIncomeInput(value);
    
    // Parse and save if valid
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      setNetIncome(numValue);
      saveNetIncomeForYear(year, numValue);
    } else if (value === '') {
      setNetIncome(null);
    }
  }, [year]);

  // Handle province selection changes - Requirements 5.3
  const handleProvinceChange = useCallback((e) => {
    const provinceCode = e.target.value;
    setSelectedProvince(provinceCode);
    saveSelectedProvince(provinceCode);
  }, []);

  // Fetch annual income from app data - Requirement 5.4
  const handleUseAppIncome = useCallback(async () => {
    setLoadingAppIncome(true);
    try {
      const incomeData = await getAnnualIncomeByCategory(year);
      const totalIncome = incomeData.total || 0;
      
      if (totalIncome > 0) {
        setNetIncome(totalIncome);
        setNetIncomeInput(totalIncome.toString());
        saveNetIncomeForYear(year, totalIncome);
      }
    } catch (error) {
      console.error('Error fetching app income data:', error);
    } finally {
      setLoadingAppIncome(false);
    }
  }, [year]);

  // Calculate tax credits - Requirements 5.5
  const taxCredits = useMemo(() => {
    if (netIncome === null) return null;
    
    return calculateAllTaxCredits({
      medicalTotal: medicalTotal || 0,
      donationTotal: donationTotal || 0,
      netIncome: netIncome,
      year: year,
      provinceCode: selectedProvince
    });
  }, [medicalTotal, donationTotal, netIncome, year, selectedProvince]);

  return {
    netIncome,
    netIncomeInput,
    selectedProvince,
    loadingAppIncome,
    taxCredits,
    handleNetIncomeChange,
    handleProvinceChange,
    handleUseAppIncome,
  };
}

export default useTaxCalculator;
