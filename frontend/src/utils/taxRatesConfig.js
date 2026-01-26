/**
 * Canadian Tax Rates Configuration
 * Organized by tax year for historical accuracy
 * 
 * Requirements: 7.1, 7.2, 7.3
 */

export const TAX_RATES = {
  // Federal rates (same across all provinces)
  federal: {
    2026: {
      medicalCreditRate: 0.15,           // 15% non-refundable credit
      donationFirstTierRate: 0.15,       // 15% on first $200
      donationSecondTierRate: 0.29,      // 29% on amount over $200
      donationFirstTierLimit: 200,       // First tier threshold
      agiThresholdPercent: 0.03,         // 3% of net income
      agiThresholdMax: 2833,             // Estimated threshold for 2026
    },
    2025: {
      medicalCreditRate: 0.15,
      donationFirstTierRate: 0.15,
      donationSecondTierRate: 0.29,
      donationFirstTierLimit: 200,
      agiThresholdPercent: 0.03,
      agiThresholdMax: 2794,             // 2025 threshold
    },
    2024: {
      medicalCreditRate: 0.15,
      donationFirstTierRate: 0.15,
      donationSecondTierRate: 0.29,
      donationFirstTierLimit: 200,
      agiThresholdPercent: 0.03,
      agiThresholdMax: 2759,             // 2024 threshold
    },
    2023: {
      medicalCreditRate: 0.15,
      donationFirstTierRate: 0.15,
      donationSecondTierRate: 0.29,
      donationFirstTierLimit: 200,
      agiThresholdPercent: 0.03,
      agiThresholdMax: 2635,             // 2023 threshold
    },
    2022: {
      medicalCreditRate: 0.15,
      donationFirstTierRate: 0.15,
      donationSecondTierRate: 0.29,
      donationFirstTierLimit: 200,
      agiThresholdPercent: 0.03,
      agiThresholdMax: 2479,             // 2022 threshold
    },
  },

  // Provincial rates (vary by province) - organized by year
  provincial: {
    2026: {
      AB: {
        medicalCreditRate: 0.10,
        donationFirstTierRate: 0.10,
        donationSecondTierRate: 0.21,
        donationFirstTierLimit: 200,
        name: 'Alberta',
      },
      BC: {
        medicalCreditRate: 0.0506,
        donationFirstTierRate: 0.0506,
        donationSecondTierRate: 0.168,
        donationFirstTierLimit: 200,
        name: 'British Columbia',
      },
      MB: {
        medicalCreditRate: 0.108,
        donationFirstTierRate: 0.108,
        donationSecondTierRate: 0.174,
        donationFirstTierLimit: 200,
        name: 'Manitoba',
      },
      NB: {
        medicalCreditRate: 0.094,
        donationFirstTierRate: 0.094,
        donationSecondTierRate: 0.1752,
        donationFirstTierLimit: 200,
        name: 'New Brunswick',
      },
      NL: {
        medicalCreditRate: 0.087,
        donationFirstTierRate: 0.087,
        donationSecondTierRate: 0.183,
        donationFirstTierLimit: 200,
        name: 'Newfoundland and Labrador',
      },
      NS: {
        medicalCreditRate: 0.0879,
        donationFirstTierRate: 0.0879,
        donationSecondTierRate: 0.21,
        donationFirstTierLimit: 200,
        name: 'Nova Scotia',
      },
      NT: {
        medicalCreditRate: 0.059,
        donationFirstTierRate: 0.059,
        donationSecondTierRate: 0.1405,
        donationFirstTierLimit: 200,
        name: 'Northwest Territories',
      },
      NU: {
        medicalCreditRate: 0.04,
        donationFirstTierRate: 0.04,
        donationSecondTierRate: 0.115,
        donationFirstTierLimit: 200,
        name: 'Nunavut',
      },
      ON: {
        medicalCreditRate: 0.0505,
        donationFirstTierRate: 0.0505,
        donationSecondTierRate: 0.1116,
        donationFirstTierLimit: 200,
        name: 'Ontario',
      },
      PE: {
        medicalCreditRate: 0.098,
        donationFirstTierRate: 0.098,
        donationSecondTierRate: 0.167,
        donationFirstTierLimit: 200,
        name: 'Prince Edward Island',
      },
      QC: {
        medicalCreditRate: 0.14,
        donationFirstTierRate: 0.20,
        donationSecondTierRate: 0.2575,
        donationFirstTierLimit: 200,
        name: 'Quebec',
      },
      SK: {
        medicalCreditRate: 0.105,
        donationFirstTierRate: 0.105,
        donationSecondTierRate: 0.145,
        donationFirstTierLimit: 200,
        name: 'Saskatchewan',
      },
      YT: {
        medicalCreditRate: 0.064,
        donationFirstTierRate: 0.064,
        donationSecondTierRate: 0.128,
        donationFirstTierLimit: 200,
        name: 'Yukon',
      },
    },
    2025: {
      AB: {
        medicalCreditRate: 0.10,
        donationFirstTierRate: 0.10,
        donationSecondTierRate: 0.21,
        donationFirstTierLimit: 200,
        name: 'Alberta',
      },
      BC: {
        medicalCreditRate: 0.0506,
        donationFirstTierRate: 0.0506,
        donationSecondTierRate: 0.168,
        donationFirstTierLimit: 200,
        name: 'British Columbia',
      },
      MB: {
        medicalCreditRate: 0.108,
        donationFirstTierRate: 0.108,
        donationSecondTierRate: 0.174,
        donationFirstTierLimit: 200,
        name: 'Manitoba',
      },
      NB: {
        medicalCreditRate: 0.094,
        donationFirstTierRate: 0.094,
        donationSecondTierRate: 0.1752,
        donationFirstTierLimit: 200,
        name: 'New Brunswick',
      },
      NL: {
        medicalCreditRate: 0.087,
        donationFirstTierRate: 0.087,
        donationSecondTierRate: 0.183,
        donationFirstTierLimit: 200,
        name: 'Newfoundland and Labrador',
      },
      NS: {
        medicalCreditRate: 0.0879,
        donationFirstTierRate: 0.0879,
        donationSecondTierRate: 0.21,
        donationFirstTierLimit: 200,
        name: 'Nova Scotia',
      },
      NT: {
        medicalCreditRate: 0.059,
        donationFirstTierRate: 0.059,
        donationSecondTierRate: 0.1405,
        donationFirstTierLimit: 200,
        name: 'Northwest Territories',
      },
      NU: {
        medicalCreditRate: 0.04,
        donationFirstTierRate: 0.04,
        donationSecondTierRate: 0.115,
        donationFirstTierLimit: 200,
        name: 'Nunavut',
      },
      ON: {
        medicalCreditRate: 0.0505,
        donationFirstTierRate: 0.0505,
        donationSecondTierRate: 0.1116,
        donationFirstTierLimit: 200,
        name: 'Ontario',
      },
      PE: {
        medicalCreditRate: 0.098,
        donationFirstTierRate: 0.098,
        donationSecondTierRate: 0.167,
        donationFirstTierLimit: 200,
        name: 'Prince Edward Island',
      },
      QC: {
        medicalCreditRate: 0.14,
        donationFirstTierRate: 0.20,
        donationSecondTierRate: 0.2575,
        donationFirstTierLimit: 200,
        name: 'Quebec',
      },
      SK: {
        medicalCreditRate: 0.105,
        donationFirstTierRate: 0.105,
        donationSecondTierRate: 0.145,
        donationFirstTierLimit: 200,
        name: 'Saskatchewan',
      },
      YT: {
        medicalCreditRate: 0.064,
        donationFirstTierRate: 0.064,
        donationSecondTierRate: 0.128,
        donationFirstTierLimit: 200,
        name: 'Yukon',
      },
    },
    2024: {
      AB: {
        medicalCreditRate: 0.10,
        donationFirstTierRate: 0.10,
        donationSecondTierRate: 0.21,
        donationFirstTierLimit: 200,
        name: 'Alberta',
      },
      BC: {
        medicalCreditRate: 0.0506,
        donationFirstTierRate: 0.0506,
        donationSecondTierRate: 0.168,
        donationFirstTierLimit: 200,
        name: 'British Columbia',
      },
      MB: {
        medicalCreditRate: 0.108,
        donationFirstTierRate: 0.108,
        donationSecondTierRate: 0.174,
        donationFirstTierLimit: 200,
        name: 'Manitoba',
      },
      NB: {
        medicalCreditRate: 0.094,
        donationFirstTierRate: 0.094,
        donationSecondTierRate: 0.1752,
        donationFirstTierLimit: 200,
        name: 'New Brunswick',
      },
      NL: {
        medicalCreditRate: 0.087,
        donationFirstTierRate: 0.087,
        donationSecondTierRate: 0.183,
        donationFirstTierLimit: 200,
        name: 'Newfoundland and Labrador',
      },
      NS: {
        medicalCreditRate: 0.0879,
        donationFirstTierRate: 0.0879,
        donationSecondTierRate: 0.21,
        donationFirstTierLimit: 200,
        name: 'Nova Scotia',
      },
      NT: {
        medicalCreditRate: 0.059,
        donationFirstTierRate: 0.059,
        donationSecondTierRate: 0.1405,
        donationFirstTierLimit: 200,
        name: 'Northwest Territories',
      },
      NU: {
        medicalCreditRate: 0.04,
        donationFirstTierRate: 0.04,
        donationSecondTierRate: 0.115,
        donationFirstTierLimit: 200,
        name: 'Nunavut',
      },
      ON: {
        medicalCreditRate: 0.0505,
        donationFirstTierRate: 0.0505,
        donationSecondTierRate: 0.1116,
        donationFirstTierLimit: 200,
        name: 'Ontario',
      },
      PE: {
        medicalCreditRate: 0.098,
        donationFirstTierRate: 0.098,
        donationSecondTierRate: 0.167,
        donationFirstTierLimit: 200,
        name: 'Prince Edward Island',
      },
      QC: {
        medicalCreditRate: 0.14,
        donationFirstTierRate: 0.20,
        donationSecondTierRate: 0.2575,
        donationFirstTierLimit: 200,
        name: 'Quebec',
      },
      SK: {
        medicalCreditRate: 0.105,
        donationFirstTierRate: 0.105,
        donationSecondTierRate: 0.145,
        donationFirstTierLimit: 200,
        name: 'Saskatchewan',
      },
      YT: {
        medicalCreditRate: 0.064,
        donationFirstTierRate: 0.064,
        donationSecondTierRate: 0.128,
        donationFirstTierLimit: 200,
        name: 'Yukon',
      },
    },
    2023: {
      AB: {
        medicalCreditRate: 0.10,
        donationFirstTierRate: 0.10,
        donationSecondTierRate: 0.21,
        donationFirstTierLimit: 200,
        name: 'Alberta',
      },
      BC: {
        medicalCreditRate: 0.0506,
        donationFirstTierRate: 0.0506,
        donationSecondTierRate: 0.168,
        donationFirstTierLimit: 200,
        name: 'British Columbia',
      },
      MB: {
        medicalCreditRate: 0.108,
        donationFirstTierRate: 0.108,
        donationSecondTierRate: 0.174,
        donationFirstTierLimit: 200,
        name: 'Manitoba',
      },
      NB: {
        medicalCreditRate: 0.094,
        donationFirstTierRate: 0.094,
        donationSecondTierRate: 0.1752,
        donationFirstTierLimit: 200,
        name: 'New Brunswick',
      },
      NL: {
        medicalCreditRate: 0.087,
        donationFirstTierRate: 0.087,
        donationSecondTierRate: 0.183,
        donationFirstTierLimit: 200,
        name: 'Newfoundland and Labrador',
      },
      NS: {
        medicalCreditRate: 0.0879,
        donationFirstTierRate: 0.0879,
        donationSecondTierRate: 0.21,
        donationFirstTierLimit: 200,
        name: 'Nova Scotia',
      },
      NT: {
        medicalCreditRate: 0.059,
        donationFirstTierRate: 0.059,
        donationSecondTierRate: 0.1405,
        donationFirstTierLimit: 200,
        name: 'Northwest Territories',
      },
      NU: {
        medicalCreditRate: 0.04,
        donationFirstTierRate: 0.04,
        donationSecondTierRate: 0.115,
        donationFirstTierLimit: 200,
        name: 'Nunavut',
      },
      ON: {
        medicalCreditRate: 0.0505,
        donationFirstTierRate: 0.0505,
        donationSecondTierRate: 0.1116,
        donationFirstTierLimit: 200,
        name: 'Ontario',
      },
      PE: {
        medicalCreditRate: 0.098,
        donationFirstTierRate: 0.098,
        donationSecondTierRate: 0.167,
        donationFirstTierLimit: 200,
        name: 'Prince Edward Island',
      },
      QC: {
        medicalCreditRate: 0.14,
        donationFirstTierRate: 0.20,
        donationSecondTierRate: 0.2575,
        donationFirstTierLimit: 200,
        name: 'Quebec',
      },
      SK: {
        medicalCreditRate: 0.105,
        donationFirstTierRate: 0.105,
        donationSecondTierRate: 0.145,
        donationFirstTierLimit: 200,
        name: 'Saskatchewan',
      },
      YT: {
        medicalCreditRate: 0.064,
        donationFirstTierRate: 0.064,
        donationSecondTierRate: 0.128,
        donationFirstTierLimit: 200,
        name: 'Yukon',
      },
    },
    2022: {
      AB: {
        medicalCreditRate: 0.10,
        donationFirstTierRate: 0.10,
        donationSecondTierRate: 0.21,
        donationFirstTierLimit: 200,
        name: 'Alberta',
      },
      BC: {
        medicalCreditRate: 0.0506,
        donationFirstTierRate: 0.0506,
        donationSecondTierRate: 0.168,
        donationFirstTierLimit: 200,
        name: 'British Columbia',
      },
      MB: {
        medicalCreditRate: 0.108,
        donationFirstTierRate: 0.108,
        donationSecondTierRate: 0.174,
        donationFirstTierLimit: 200,
        name: 'Manitoba',
      },
      NB: {
        medicalCreditRate: 0.094,
        donationFirstTierRate: 0.094,
        donationSecondTierRate: 0.1752,
        donationFirstTierLimit: 200,
        name: 'New Brunswick',
      },
      NL: {
        medicalCreditRate: 0.087,
        donationFirstTierRate: 0.087,
        donationSecondTierRate: 0.183,
        donationFirstTierLimit: 200,
        name: 'Newfoundland and Labrador',
      },
      NS: {
        medicalCreditRate: 0.0879,
        donationFirstTierRate: 0.0879,
        donationSecondTierRate: 0.21,
        donationFirstTierLimit: 200,
        name: 'Nova Scotia',
      },
      NT: {
        medicalCreditRate: 0.059,
        donationFirstTierRate: 0.059,
        donationSecondTierRate: 0.1405,
        donationFirstTierLimit: 200,
        name: 'Northwest Territories',
      },
      NU: {
        medicalCreditRate: 0.04,
        donationFirstTierRate: 0.04,
        donationSecondTierRate: 0.115,
        donationFirstTierLimit: 200,
        name: 'Nunavut',
      },
      ON: {
        medicalCreditRate: 0.0505,
        donationFirstTierRate: 0.0505,
        donationSecondTierRate: 0.1116,
        donationFirstTierLimit: 200,
        name: 'Ontario',
      },
      PE: {
        medicalCreditRate: 0.098,
        donationFirstTierRate: 0.098,
        donationSecondTierRate: 0.167,
        donationFirstTierLimit: 200,
        name: 'Prince Edward Island',
      },
      QC: {
        medicalCreditRate: 0.14,
        donationFirstTierRate: 0.20,
        donationSecondTierRate: 0.2575,
        donationFirstTierLimit: 200,
        name: 'Quebec',
      },
      SK: {
        medicalCreditRate: 0.105,
        donationFirstTierRate: 0.105,
        donationSecondTierRate: 0.145,
        donationFirstTierLimit: 200,
        name: 'Saskatchewan',
      },
      YT: {
        medicalCreditRate: 0.064,
        donationFirstTierRate: 0.064,
        donationSecondTierRate: 0.128,
        donationFirstTierLimit: 200,
        name: 'Yukon',
      },
    },
  },

  // List of all provinces for selector
  provinces: [
    { code: 'AB', name: 'Alberta' },
    { code: 'BC', name: 'British Columbia' },
    { code: 'MB', name: 'Manitoba' },
    { code: 'NB', name: 'New Brunswick' },
    { code: 'NL', name: 'Newfoundland and Labrador' },
    { code: 'NS', name: 'Nova Scotia' },
    { code: 'NT', name: 'Northwest Territories' },
    { code: 'NU', name: 'Nunavut' },
    { code: 'ON', name: 'Ontario' },
    { code: 'PE', name: 'Prince Edward Island' },
    { code: 'QC', name: 'Quebec' },
    { code: 'SK', name: 'Saskatchewan' },
    { code: 'YT', name: 'Yukon' },
  ],
};

/**
 * Get tax rates for a specific year with fallback
 * Requirements: 7.5, 7.6
 * 
 * @param {number} year - Tax year
 * @returns {{ federal: Object, provincial: Object, fallbackUsed: boolean, fallbackYear: number|null }}
 */
export const getTaxRatesForYear = (year) => {
  const federalYears = Object.keys(TAX_RATES.federal).map(Number);
  const provincialYears = Object.keys(TAX_RATES.provincial).map(Number);
  
  const mostRecentFederalYear = Math.max(...federalYears);
  const mostRecentProvincialYear = Math.max(...provincialYears);
  
  const hasFederalRates = TAX_RATES.federal[year] !== undefined;
  const hasProvincialRates = TAX_RATES.provincial[year] !== undefined;
  
  const federal = TAX_RATES.federal[year] || TAX_RATES.federal[mostRecentFederalYear];
  const provincial = TAX_RATES.provincial[year] || TAX_RATES.provincial[mostRecentProvincialYear];
  
  const fallbackUsed = !hasFederalRates || !hasProvincialRates;
  const fallbackYear = fallbackUsed 
    ? Math.max(mostRecentFederalYear, mostRecentProvincialYear) 
    : null;
  
  return { federal, provincial, fallbackUsed, fallbackYear };
};
