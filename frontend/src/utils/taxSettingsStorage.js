/**
 * Tax Settings Storage Utilities
 * Handles localStorage persistence for tax credit calculator settings
 * 
 * Validates: Requirements 3.2, 3.3, 6.2
 */

const STORAGE_KEYS = {
  NET_INCOME: 'taxDeductible_netIncome',
  PROVINCE: 'taxDeductible_province',
};

/**
 * Get net income for a specific year
 * @param {number} year - Tax year
 * @returns {number | null} Net income or null if not set
 */
export const getNetIncomeForYear = (year) => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.NET_INCOME);
    if (!stored) return null;
    
    const incomeByYear = JSON.parse(stored);
    return incomeByYear[year] !== undefined ? incomeByYear[year] : null;
  } catch {
    return null;
  }
};

/**
 * Save net income for a specific year
 * @param {number} year - Tax year
 * @param {number} amount - Net income amount
 */
export const saveNetIncomeForYear = (year, amount) => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.NET_INCOME);
    const incomeByYear = stored ? JSON.parse(stored) : {};
    incomeByYear[year] = amount;
    localStorage.setItem(STORAGE_KEYS.NET_INCOME, JSON.stringify(incomeByYear));
  } catch (error) {
    console.error('Failed to save net income:', error);
  }
};

/**
 * Get selected province
 * @returns {string} Province code (defaults to 'ON')
 */
export const getSelectedProvince = () => {
  try {
    return localStorage.getItem(STORAGE_KEYS.PROVINCE) || 'ON';
  } catch {
    return 'ON';
  }
};

/**
 * Save selected province
 * @param {string} provinceCode - Province code
 */
export const saveSelectedProvince = (provinceCode) => {
  try {
    localStorage.setItem(STORAGE_KEYS.PROVINCE, provinceCode);
  } catch (error) {
    console.error('Failed to save province:', error);
  }
};

/**
 * Clear all tax settings (useful for testing)
 */
export const clearAllTaxSettings = () => {
  try {
    localStorage.removeItem(STORAGE_KEYS.NET_INCOME);
    localStorage.removeItem(STORAGE_KEYS.PROVINCE);
  } catch (error) {
    console.error('Failed to clear tax settings:', error);
  }
};

// Export storage keys for testing purposes
export const _STORAGE_KEYS = STORAGE_KEYS;
