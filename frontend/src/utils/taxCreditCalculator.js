/**
 * Tax Credit Calculator Utilities
 * Calculates Canadian federal and provincial tax credits for medical expenses and donations
 * 
 * Requirements: 4.1, 4.2, 4.6, 5.1, 5.2, 5.4, 6.3, 6.4, 6.6
 */

import { getTaxRatesForYear } from './taxRatesConfig';

/**
 * Calculate AGI threshold for medical expenses
 * The threshold is the lesser of 3% of net income or the federal maximum
 * 
 * Requirements: 4.1, 4.2
 * 
 * @param {number} netIncome - Annual net income
 * @param {number} year - Tax year
 * @returns {number} AGI threshold amount
 */
export const calculateAGIThreshold = (netIncome, year) => {
  if (netIncome < 0) {
    return 0;
  }
  
  const { federal } = getTaxRatesForYear(year);
  const percentThreshold = netIncome * federal.agiThresholdPercent;
  return Math.min(percentThreshold, federal.agiThresholdMax);
};

/**
 * Calculate deductible medical amount (amount above threshold)
 * 
 * Requirements: 4.6
 * 
 * @param {number} medicalTotal - Total medical expenses
 * @param {number} agiThreshold - Calculated AGI threshold
 * @returns {number} Deductible amount (always >= 0)
 */
export const calculateDeductibleMedical = (medicalTotal, agiThreshold) => {
  return Math.max(0, medicalTotal - agiThreshold);
};

/**
 * Calculate federal medical expense tax credit
 * 
 * Requirements: 5.1
 * 
 * @param {number} deductibleAmount - Amount above AGI threshold
 * @param {number} year - Tax year
 * @returns {number} Federal tax credit
 */
export const calculateFederalMedicalCredit = (deductibleAmount, year) => {
  if (deductibleAmount <= 0) {
    return 0;
  }
  
  const { federal } = getTaxRatesForYear(year);
  return deductibleAmount * federal.medicalCreditRate;
};


/**
 * Calculate donation tax credit (tiered)
 * First $200 at lower rate, remainder at higher rate
 * 
 * Requirements: 5.2, 6.4
 * 
 * @param {number} donationTotal - Total donations
 * @param {number} year - Tax year
 * @param {string} level - 'federal' or province code (e.g., 'ON')
 * @returns {number} Tax credit
 */
export const calculateDonationCredit = (donationTotal, year, level = 'federal') => {
  if (donationTotal <= 0) {
    return 0;
  }
  
  const { federal, provincial } = getTaxRatesForYear(year);
  const rates = level === 'federal' ? federal : provincial[level];
  
  if (!rates) {
    return 0;
  }
  
  const firstTierLimit = rates.donationFirstTierLimit || 200;
  const firstTier = Math.min(donationTotal, firstTierLimit);
  const secondTier = Math.max(0, donationTotal - firstTierLimit);
  
  return (firstTier * rates.donationFirstTierRate) + (secondTier * rates.donationSecondTierRate);
};


/**
 * Calculate provincial medical expense tax credit
 * 
 * Requirements: 6.3
 * 
 * @param {number} deductibleAmount - Amount above AGI threshold
 * @param {number} year - Tax year
 * @param {string} provinceCode - Province code (e.g., 'ON')
 * @returns {number} Provincial tax credit
 */
export const calculateProvincialMedicalCredit = (deductibleAmount, year, provinceCode) => {
  if (deductibleAmount <= 0) {
    return 0;
  }
  
  const { provincial } = getTaxRatesForYear(year);
  const rates = provincial[provinceCode];
  
  if (!rates) {
    return 0;
  }
  
  return deductibleAmount * rates.medicalCreditRate;
};


/**
 * Calculate all tax credits for a given year
 * Combines all calculations into a single comprehensive result object
 * 
 * Requirements: 5.4, 6.6
 * 
 * @param {Object} params - Calculation parameters
 * @param {number} params.medicalTotal - Total medical expenses
 * @param {number} params.donationTotal - Total donations
 * @param {number} params.netIncome - Annual net income
 * @param {number} params.year - Tax year
 * @param {string} params.provinceCode - Province code (e.g., 'ON')
 * @returns {Object} Complete tax credit breakdown
 */
export const calculateAllTaxCredits = ({
  medicalTotal = 0,
  donationTotal = 0,
  netIncome = 0,
  year,
  provinceCode = 'ON'
}) => {
  const { federal, provincial, fallbackUsed, fallbackYear } = getTaxRatesForYear(year);
  
  // AGI threshold calculation
  const agiThreshold = calculateAGIThreshold(netIncome, year);
  const deductibleMedical = calculateDeductibleMedical(medicalTotal, agiThreshold);
  
  // Federal credits
  const federalMedicalCredit = calculateFederalMedicalCredit(deductibleMedical, year);
  const federalDonationCredit = calculateDonationCredit(donationTotal, year, 'federal');
  const totalFederalCredit = federalMedicalCredit + federalDonationCredit;
  
  // Provincial credits
  const provincialMedicalCredit = calculateProvincialMedicalCredit(deductibleMedical, year, provinceCode);
  const provincialDonationCredit = calculateDonationCredit(donationTotal, year, provinceCode);
  const totalProvincialCredit = provincialMedicalCredit + provincialDonationCredit;
  
  // Total savings
  const totalTaxSavings = totalFederalCredit + totalProvincialCredit;
  
  // Calculate threshold progress (how much of threshold has been met)
  const thresholdProgress = agiThreshold > 0 ? medicalTotal / agiThreshold : 0;
  
  return {
    // Threshold info
    agiThreshold,
    agiThresholdMax: federal.agiThresholdMax,
    deductibleMedical,
    thresholdProgress,
    
    // Federal breakdown
    federal: {
      medicalCredit: federalMedicalCredit,
      donationCredit: federalDonationCredit,
      total: totalFederalCredit,
      rates: federal,
    },
    
    // Provincial breakdown
    provincial: {
      medicalCredit: provincialMedicalCredit,
      donationCredit: provincialDonationCredit,
      total: totalProvincialCredit,
      rates: provincial[provinceCode],
      provinceName: provincial[provinceCode]?.name || 'Unknown',
    },
    
    // Summary
    totalTaxSavings,
    fallbackUsed,
    fallbackYear,
  };
};
