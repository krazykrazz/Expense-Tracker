# Design Document: Tax Deductible Analytics

## Overview

This design enhances the existing TaxDeductible component with two major features:

1. **Year-over-Year (YoY) Comparison** - Displays previous year's tax deductible totals alongside current year data with percentage change indicators
2. **Tax Credit Calculator** - Calculates estimated federal and provincial tax credits based on Canadian tax rules, with per-year configuration support

The implementation is primarily frontend-focused, with one new backend endpoint needed to fetch previous year's tax deductible summary data efficiently.

## Architecture

### Component Structure

```
TaxDeductible.jsx (enhanced)
├── YoYComparisonSection (new)
│   ├── YoYComparisonCard (medical)
│   ├── YoYComparisonCard (donations)
│   └── YoYComparisonCard (total)
├── TaxCreditCalculator (new)
│   ├── NetIncomeConfig
│   ├── AGIThresholdProgress
│   ├── TaxCreditBreakdown
│   │   ├── FederalCredits
│   │   └── ProvincialCredits
│   └── TaxSavingsSummary
└── Existing sections (summary cards, expense lists, etc.)
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        TaxDeductible                             │
├─────────────────────────────────────────────────────────────────┤
│  Props: year, refreshTrigger                                     │
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────────────────────┐   │
│  │ Current Year API │    │ Previous Year API (new endpoint) │   │
│  │ /api/expenses/   │    │ /api/expenses/tax-deductible/    │   │
│  │ tax-deductible   │    │ summary?year={year-1}            │   │
│  └────────┬─────────┘    └────────────────┬─────────────────┘   │
│           │                               │                      │
│           ▼                               ▼                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    YoYComparisonSection                     │ │
│  │  - Displays side-by-side comparison                        │ │
│  │  - Calculates percentage changes                           │ │
│  │  - Shows up/down indicators                                │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    TaxCreditCalculator                      │ │
│  │                                                             │ │
│  │  ┌─────────────────┐   ┌─────────────────────────────────┐ │ │
│  │  │ localStorage    │   │ taxRatesConfig.js (constants)   │ │ │
│  │  │ - netIncome     │   │ - Federal rates by year         │ │ │
│  │  │   by year       │   │ - Provincial rates by year      │ │ │
│  │  │ - province      │   │ - AGI thresholds by year        │ │ │
│  │  └────────┬────────┘   └────────────────┬────────────────┘ │ │
│  │           │                             │                   │ │
│  │           ▼                             ▼                   │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │              Tax Credit Calculations                  │  │ │
│  │  │  - AGI threshold (min of 3% income or federal max)   │  │ │
│  │  │  - Deductible amount (medical - threshold)           │  │ │
│  │  │  - Federal credits (15% medical, tiered donations)   │  │ │
│  │  │  - Provincial credits (province-specific rates)      │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### New Backend Endpoint

**GET /api/expenses/tax-deductible/summary**

Returns a lightweight summary of tax deductible data for YoY comparison (without full expense lists).

```javascript
// Request
GET /api/expenses/tax-deductible/summary?year=2023

// Response
{
  year: 2023,
  medicalTotal: 1500.00,
  donationTotal: 500.00,
  totalDeductible: 2000.00,
  medicalCount: 15,
  donationCount: 5
}
```

### Tax Rates Configuration Module

**File: `frontend/src/utils/taxRatesConfig.js`**

```javascript
/**
 * Canadian Tax Rates Configuration
 * Organized by tax year for historical accuracy
 */

export const TAX_RATES = {
  // Federal rates (same across all provinces)
  federal: {
    2024: {
      medicalCreditRate: 0.15,           // 15% non-refundable credit
      donationFirstTierRate: 0.15,       // 15% on first $200
      donationSecondTierRate: 0.29,      // 29% on amount over $200
      donationFirstTierLimit: 200,       // First tier threshold
      agiThresholdPercent: 0.03,         // 3% of net income
      agiThresholdMax: 2759,             // Maximum threshold for 2024
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
    // Add more years as needed
  },

  // Provincial rates (vary by province)
  provincial: {
    2024: {
      ON: { // Ontario
        medicalCreditRate: 0.0505,       // 5.05% lowest bracket rate
        donationFirstTierRate: 0.0505,
        donationSecondTierRate: 0.1116,  // 11.16% highest bracket rate
        donationFirstTierLimit: 200,
        name: 'Ontario',
      },
      BC: { // British Columbia
        medicalCreditRate: 0.0506,
        donationFirstTierRate: 0.0506,
        donationSecondTierRate: 0.168,
        donationFirstTierLimit: 200,
        name: 'British Columbia',
      },
      AB: { // Alberta
        medicalCreditRate: 0.10,
        donationFirstTierRate: 0.10,
        donationSecondTierRate: 0.21,
        donationFirstTierLimit: 200,
        name: 'Alberta',
      },
      // ... other provinces
    },
    2023: {
      // Same structure for 2023
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
 * @param {number} year - Tax year
 * @returns {{ federal: Object, provincial: Object, fallbackUsed: boolean }}
 */
export const getTaxRatesForYear = (year) => {
  const federal = TAX_RATES.federal[year] || TAX_RATES.federal[Math.max(...Object.keys(TAX_RATES.federal).map(Number))];
  const provincial = TAX_RATES.provincial[year] || TAX_RATES.provincial[Math.max(...Object.keys(TAX_RATES.provincial).map(Number))];
  const fallbackUsed = !TAX_RATES.federal[year];
  
  return { federal, provincial, fallbackUsed };
};
```

### Tax Credit Calculator Utilities

**File: `frontend/src/utils/taxCreditCalculator.js`**

```javascript
import { getTaxRatesForYear } from './taxRatesConfig';

/**
 * Calculate AGI threshold for medical expenses
 * @param {number} netIncome - Annual net income
 * @param {number} year - Tax year
 * @returns {number} AGI threshold amount
 */
export const calculateAGIThreshold = (netIncome, year) => {
  const { federal } = getTaxRatesForYear(year);
  const percentThreshold = netIncome * federal.agiThresholdPercent;
  return Math.min(percentThreshold, federal.agiThresholdMax);
};

/**
 * Calculate deductible medical amount (above threshold)
 * @param {number} medicalTotal - Total medical expenses
 * @param {number} agiThreshold - Calculated AGI threshold
 * @returns {number} Deductible amount
 */
export const calculateDeductibleMedical = (medicalTotal, agiThreshold) => {
  return Math.max(0, medicalTotal - agiThreshold);
};

/**
 * Calculate federal medical expense tax credit
 * @param {number} deductibleAmount - Amount above AGI threshold
 * @param {number} year - Tax year
 * @returns {number} Federal tax credit
 */
export const calculateFederalMedicalCredit = (deductibleAmount, year) => {
  const { federal } = getTaxRatesForYear(year);
  return deductibleAmount * federal.medicalCreditRate;
};

/**
 * Calculate donation tax credit (tiered)
 * @param {number} donationTotal - Total donations
 * @param {number} year - Tax year
 * @param {string} level - 'federal' or province code
 * @returns {number} Tax credit
 */
export const calculateDonationCredit = (donationTotal, year, level = 'federal') => {
  const { federal, provincial } = getTaxRatesForYear(year);
  const rates = level === 'federal' ? federal : provincial[level];
  
  if (!rates) return 0;
  
  const firstTier = Math.min(donationTotal, rates.donationFirstTierLimit);
  const secondTier = Math.max(0, donationTotal - rates.donationFirstTierLimit);
  
  return (firstTier * rates.donationFirstTierRate) + (secondTier * rates.donationSecondTierRate);
};

/**
 * Calculate provincial medical expense tax credit
 * @param {number} deductibleAmount - Amount above AGI threshold
 * @param {number} year - Tax year
 * @param {string} provinceCode - Province code (e.g., 'ON')
 * @returns {number} Provincial tax credit
 */
export const calculateProvincialMedicalCredit = (deductibleAmount, year, provinceCode) => {
  const { provincial } = getTaxRatesForYear(year);
  const rates = provincial[provinceCode];
  
  if (!rates) return 0;
  
  return deductibleAmount * rates.medicalCreditRate;
};

/**
 * Calculate all tax credits for a given year
 * @param {Object} params - Calculation parameters
 * @returns {Object} Complete tax credit breakdown
 */
export const calculateAllTaxCredits = ({
  medicalTotal,
  donationTotal,
  netIncome,
  year,
  provinceCode
}) => {
  const { federal, provincial, fallbackUsed } = getTaxRatesForYear(year);
  
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
  
  return {
    // Threshold info
    agiThreshold,
    agiThresholdMax: federal.agiThresholdMax,
    deductibleMedical,
    thresholdProgress: medicalTotal / agiThreshold,
    
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
  };
};
```

### YoY Comparison Utilities

**File: `frontend/src/utils/yoyComparison.js`**

```javascript
/**
 * Calculate percentage change between two values
 * @param {number} current - Current year value
 * @param {number} previous - Previous year value
 * @returns {{ change: number, direction: 'up' | 'down' | 'same' | 'new', formatted: string }}
 */
export const calculatePercentageChange = (current, previous) => {
  if (previous === 0 && current === 0) {
    return { change: 0, direction: 'same', formatted: '—' };
  }
  
  if (previous === 0 && current > 0) {
    return { change: null, direction: 'new', formatted: 'New' };
  }
  
  const change = ((current - previous) / previous) * 100;
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'same';
  const formatted = `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
  
  return { change, direction, formatted };
};

/**
 * Get indicator symbol for change direction
 * @param {string} direction - 'up', 'down', 'same', or 'new'
 * @returns {string} Indicator symbol
 */
export const getChangeIndicator = (direction) => {
  switch (direction) {
    case 'up': return '↑';
    case 'down': return '↓';
    case 'new': return '✦';
    default: return '—';
  }
};
```

### Settings Storage Utilities

**File: `frontend/src/utils/taxSettingsStorage.js`**

```javascript
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
    return incomeByYear[year] || null;
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
```

## Data Models

### YoY Comparison Data

```typescript
interface YoYComparisonData {
  currentYear: {
    year: number;
    medicalTotal: number;
    donationTotal: number;
    totalDeductible: number;
  };
  previousYear: {
    year: number;
    medicalTotal: number;
    donationTotal: number;
    totalDeductible: number;
  } | null;
  changes: {
    medical: PercentageChange;
    donations: PercentageChange;
    total: PercentageChange;
  };
}

interface PercentageChange {
  change: number | null;
  direction: 'up' | 'down' | 'same' | 'new';
  formatted: string;
}
```

### Tax Credit Calculation Result

```typescript
interface TaxCreditResult {
  // Threshold info
  agiThreshold: number;
  agiThresholdMax: number;
  deductibleMedical: number;
  thresholdProgress: number;  // 0-1+ ratio
  
  // Federal breakdown
  federal: {
    medicalCredit: number;
    donationCredit: number;
    total: number;
    rates: FederalRates;
  };
  
  // Provincial breakdown
  provincial: {
    medicalCredit: number;
    donationCredit: number;
    total: number;
    rates: ProvincialRates;
    provinceName: string;
  };
  
  // Summary
  totalTaxSavings: number;
  fallbackUsed: boolean;
}
```

### User Settings

```typescript
interface TaxSettings {
  netIncomeByYear: Record<number, number>;  // { 2024: 75000, 2023: 70000 }
  province: string;  // 'ON', 'BC', etc.
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: YoY Data Fetching

*For any* year Y passed to the TaxDeductible component, the system should fetch tax deductible data for both year Y and year Y-1.

**Validates: Requirements 1.1**

### Property 2: YoY Display Completeness

*For any* valid YoY comparison data containing current and previous year values, the rendered output should contain all six values: medical (current), medical (previous), donations (current), donations (previous), total (current), and total (previous).

**Validates: Requirements 2.1**

### Property 3: Percentage Change Calculation

*For any* pair of current year value C and previous year value P where P > 0, the calculated percentage change should equal ((C - P) / P) × 100.

**Validates: Requirements 2.2**

### Property 4: Change Indicator Correctness

*For any* pair of current year value C and previous year value P:
- If C > P, the indicator should be "↑" (up)
- If C < P, the indicator should be "↓" (down)
- If C = P and both > 0, the indicator should be "—" (same)
- If P = 0 and C > 0, the indicator should be "New"
- If P = 0 and C = 0, the indicator should be "—" (same)

**Validates: Requirements 2.3, 2.4, 2.5, 2.6**

### Property 5: Net Income Storage Round-Trip

*For any* year Y and net income value N, saving N for year Y and then loading for year Y should return N. Additionally, loading for a different year Y2 should not return N (unless N was also saved for Y2).

**Validates: Requirements 3.2, 3.3, 3.6**

### Property 6: Province Storage Round-Trip

*For any* valid province code P, saving P and then loading should return P.

**Validates: Requirements 6.2**

### Property 7: AGI Threshold Calculation

*For any* net income N and tax year Y with configured federal threshold max M, the calculated AGI threshold should equal min(N × 0.03, M).

**Validates: Requirements 4.1, 4.2**

### Property 8: Deductible Amount Calculation

*For any* medical expense total T and AGI threshold A, the deductible amount should equal max(0, T - A).

**Validates: Requirements 4.6, 5.5**

### Property 9: Federal Tax Credit Calculation

*For any* deductible medical amount D and donation total T:
- Medical credit = D × 0.15
- Donation credit = min(T, 200) × 0.15 + max(0, T - 200) × 0.29
- Total federal credit = Medical credit + Donation credit

**Validates: Requirements 5.1, 5.2, 5.4**

### Property 10: Provincial Tax Credit Calculation

*For any* deductible medical amount D, donation total T, and province P with configured rates (medicalRate, donationFirstRate, donationSecondRate):
- Medical credit = D × medicalRate
- Donation credit = min(T, 200) × donationFirstRate + max(0, T - 200) × donationSecondRate
- Total provincial credit = Medical credit + Donation credit
- Total tax savings = Federal total + Provincial total

**Validates: Requirements 6.3, 6.4, 6.6**

### Property 11: Year-Specific Rate Usage

*For any* tax year Y with configured rates, all calculations for year Y should use the rates configured for year Y, not rates from any other year.

**Validates: Requirements 7.5**

### Property 12: Rate Fallback Behavior

*For any* tax year Y without configured rates, the system should use rates from the most recent configured year and set the fallbackUsed flag to true.

**Validates: Requirements 7.6**

## Error Handling

### API Errors

| Error Scenario | Handling Strategy |
|----------------|-------------------|
| Previous year API fails | Display current year data normally, show "Unable to load" for previous year section |
| Current year API fails | Show error message, retry option |
| Network timeout | Show loading state with timeout message after 10 seconds |

### Calculation Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Net income = 0 | AGI threshold = 0, all medical expenses are deductible |
| Net income not configured | Show configuration prompt, hide tax credit calculations |
| Medical expenses = 0 | Show $0 for medical credits, still calculate donation credits |
| Donations = 0 | Show $0 for donation credits, still calculate medical credits |
| Province rates not found | Fall back to Ontario rates with warning |
| Year rates not found | Fall back to most recent year with warning banner |

### Input Validation

| Input | Validation |
|-------|------------|
| Net income | Must be non-negative number, max 10,000,000 |
| Province | Must be valid Canadian province code |
| Year | Must be positive integer, reasonable range (2000-2100) |

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests:

- **Unit tests**: Verify specific examples, edge cases, UI rendering, and error conditions
- **Property tests**: Verify universal calculation properties across all valid inputs

### Property-Based Testing Configuration

- **Library**: fast-check (already used in the project)
- **Minimum iterations**: 100 per property test
- **Tag format**: `Feature: tax-deductible-analytics, Property {number}: {property_text}`

### Test Categories

#### Calculation Tests (Property-Based)

1. **AGI Threshold Calculation** - Property 7
   - Generate random net incomes and years
   - Verify threshold = min(income × 0.03, yearMax)

2. **Percentage Change Calculation** - Property 3
   - Generate random current/previous value pairs
   - Verify percentage formula correctness

3. **Federal Credit Calculation** - Property 9
   - Generate random medical and donation amounts
   - Verify tiered calculation correctness

4. **Provincial Credit Calculation** - Property 10
   - Generate random amounts and province codes
   - Verify province-specific rate application

5. **Change Indicator Correctness** - Property 4
   - Generate random value pairs
   - Verify correct indicator selection

#### Storage Tests (Property-Based)

6. **Net Income Round-Trip** - Property 5
   - Generate random years and income values
   - Verify save/load consistency

7. **Province Round-Trip** - Property 6
   - Generate random province codes
   - Verify save/load consistency

#### Unit Tests

1. **UI Rendering** - Verify components render correctly with various data states
2. **Edge Cases** - Zero values, missing data, API failures
3. **Integration** - Component interaction with existing TaxDeductible features
4. **Accessibility** - Keyboard navigation, screen reader compatibility

### Test File Structure

```
frontend/src/
├── utils/
│   ├── taxCreditCalculator.test.js      # Property tests for calculations
│   ├── taxSettingsStorage.test.js       # Property tests for storage
│   └── yoyComparison.test.js            # Property tests for YoY logic
└── components/
    └── TaxDeductible.analytics.test.jsx  # Integration tests
```
