# Tax Deductible Analytics

**Version**: 4.18.0  
**Completed**: January 2026  
**Spec**: `archive/specs/tax-deductible-analytics/`

## Overview

Year-over-Year comparison and Tax Credit Calculator features for tax-deductible expenses. Helps users understand their tax deduction trends and estimate potential tax savings.

## Features

### Year-over-Year Comparison

Compare tax-deductible expenses between current and previous year.

**Key Features**:
- **Side-by-Side Display**: Current vs previous year totals
- **Medical Comparison**: Year-over-year medical expense changes
- **Donation Comparison**: Year-over-year donation changes
- **Total Comparison**: Combined tax-deductible totals
- **Change Indicators**: Percentage change with up/down arrows
- **Color Coding**: Green for increases, red for decreases, gray for new data

### Tax Credit Calculator

Estimate federal and provincial tax credits from deductible expenses.

**Key Features**:
- **Net Income Input**: Enter annual net income for AGI calculation
- **Use App Data**: Pull income from app's income_sources
- **Province Selector**: Choose province for provincial rates
- **AGI Threshold**: Shows 3% of net income threshold for medical
- **Progress Bar**: Visual indicator of medical expenses vs threshold
- **Federal Credits**: Medical (15%) and donation (15%/29% tiered) credits
- **Provincial Credits**: Province-specific rates for all 13 provinces/territories
- **Total Savings**: Combined federal + provincial tax credit estimate

### Tax Rates Configuration

- **Federal Rates**: Medical 15%, donations tiered 15%/29%
- **Provincial Rates**: All Canadian provinces with year-specific rates
- **AGI Thresholds**: Year-specific amounts (e.g., 2024: $2,759)
- **Fallback Logic**: Uses most recent rates if current year unavailable

## Usage

### Viewing YoY Comparison

1. Navigate to Tax Deductible view
2. YoY comparison cards appear at the top
3. Shows current year vs previous year automatically

### Using Tax Credit Calculator

1. Navigate to Tax Deductible view
2. Scroll to Tax Credit Calculator section
3. Enter your annual net income (or click "Use App Data")
4. Select your province
5. View estimated tax credits and savings

## Technical Details

### Settings Persistence

- Net income stored per year in localStorage
- Province selection persisted in localStorage
- Settings survive page refresh

### Calculation Logic

**Medical Credits**:
1. Calculate AGI threshold (3% of net income)
2. Deductible amount = medical total - threshold (if positive)
3. Federal credit = deductible × 15%
4. Provincial credit = deductible × provincial rate

**Donation Credits**:
1. First $200 at 15% (federal)
2. Amount over $200 at 29% (federal)
3. Provincial rates vary by province

## Components

| Component | Purpose |
|-----------|---------|
| `TaxDeductible.jsx` | Main view with YoY and calculator |
| `taxCreditCalculator.js` | Credit calculation utilities |
| `yoyComparison.js` | YoY comparison utilities |
| `taxSettingsStorage.js` | Settings persistence |
| `taxRatesConfig.js` | Federal and provincial rates |

## API Endpoints

- `GET /api/expenses/tax-deductible/summary?year=YYYY` - Lightweight summary for YoY

## Testing

Property-based tests validate:
- AGI threshold calculation
- Deductible amount calculation
- Federal and provincial credit calculations
- Settings storage round-trip
- Percentage change calculations
- Year-specific rate usage

---

**Last Updated**: February 2, 2026
