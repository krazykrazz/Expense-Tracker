# Implementation Plan: Tax Deductible Analytics

## Overview

This implementation adds Year-over-Year comparison and Tax Credit Calculator features to the existing TaxDeductible component. The approach prioritizes creating the utility modules first, then the backend endpoint, followed by the UI components.

## Tasks

- [x] 1. Create tax rates configuration module
  - [x] 1.1 Create `frontend/src/utils/taxRatesConfig.js` with federal rates by year
    - Define federal tax credit rates (medical 15%, donation tiered 15%/29%)
    - Define AGI threshold amounts by year (2024: $2,759, 2023: $2,635, 2022: $2,479)
    - _Requirements: 7.1, 7.3_
  
  - [x] 1.2 Add provincial tax rates for all Canadian provinces
    - Define rates for all 13 provinces/territories organized by year
    - Include province name mapping and code list
    - _Requirements: 7.2_
  
  - [x] 1.3 Implement `getTaxRatesForYear()` helper with fallback logic
    - Return rates for specified year or most recent available
    - Include fallbackUsed flag in return value
    - _Requirements: 7.5, 7.6_

- [x] 2. Create tax credit calculation utilities
  - [x] 2.1 Create `frontend/src/utils/taxCreditCalculator.js` with core calculation functions
    - Implement `calculateAGIThreshold(netIncome, year)`
    - Implement `calculateDeductibleMedical(medicalTotal, agiThreshold)`
    - Implement `calculateFederalMedicalCredit(deductibleAmount, year)`
    - _Requirements: 4.1, 4.2, 4.6, 5.1_
  
  - [x] 2.2 Implement donation credit calculations
    - Implement `calculateDonationCredit(donationTotal, year, level)` with tiered logic
    - Support both federal and provincial levels
    - _Requirements: 5.2, 6.4_
  
  - [x] 2.3 Implement provincial credit calculations
    - Implement `calculateProvincialMedicalCredit(deductibleAmount, year, provinceCode)`
    - _Requirements: 6.3_
  
  - [x] 2.4 Implement `calculateAllTaxCredits()` comprehensive function
    - Combine all calculations into single result object
    - Include threshold info, federal breakdown, provincial breakdown, and totals
    - _Requirements: 5.4, 6.6_
  
  - [x] 2.5 Write property tests for tax credit calculations
    - **Property 7: AGI Threshold Calculation**
    - **Property 8: Deductible Amount Calculation**
    - **Property 9: Federal Tax Credit Calculation**
    - **Property 10: Provincial Tax Credit Calculation**
    - **Validates: Requirements 4.1, 4.2, 4.6, 5.1, 5.2, 5.4, 6.3, 6.4, 6.6**

- [x] 3. Create settings storage utilities
  - [x] 3.1 Create `frontend/src/utils/taxSettingsStorage.js`
    - Implement `getNetIncomeForYear(year)` and `saveNetIncomeForYear(year, amount)`
    - Implement `getSelectedProvince()` and `saveSelectedProvince(provinceCode)`
    - _Requirements: 3.2, 3.3, 6.2_
  
  - [x] 3.2 Write property tests for settings storage
    - **Property 5: Net Income Storage Round-Trip**
    - **Property 6: Province Storage Round-Trip**
    - **Validates: Requirements 3.2, 3.3, 3.6, 6.2**

- [x] 4. Create YoY comparison utilities
  - [x] 4.1 Create `frontend/src/utils/yoyComparison.js`
    - Implement `calculatePercentageChange(current, previous)`
    - Implement `getChangeIndicator(direction)`
    - Handle edge cases (zero values, new data)
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6_
  
  - [x] 4.2 Write property tests for YoY comparison
    - **Property 3: Percentage Change Calculation**
    - **Property 4: Change Indicator Correctness**
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6**

- [ ] 5. Checkpoint - Ensure all utility tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Create backend endpoint for YoY summary data
  - [ ] 6.1 Add route in `backend/routes/expenseRoutes.js`
    - Add GET `/api/expenses/tax-deductible/summary` route
    - _Requirements: 1.1_
  
  - [ ] 6.2 Add controller method in `backend/controllers/expenseController.js`
    - Implement `getTaxDeductibleSummary(req, res)`
    - Extract year from query params, validate input
    - _Requirements: 1.1_
  
  - [ ] 6.3 Add service method in `backend/services/expenseService.js`
    - Implement `getTaxDeductibleSummary(year)` returning lightweight summary
    - Return medicalTotal, donationTotal, totalDeductible, counts
    - _Requirements: 1.1_
  
  - [ ] 6.4 Add endpoint to `frontend/src/config.js`
    - Add `TAX_DEDUCTIBLE_SUMMARY` endpoint constant
    - _Requirements: 1.1_
  
  - [ ] 6.5 Add API function in `frontend/src/services/expenseApi.js`
    - Implement `getTaxDeductibleSummary(year)` function
    - _Requirements: 1.1_

- [ ] 7. Implement YoY Comparison UI section
  - [ ] 7.1 Create YoY comparison section in TaxDeductible component
    - Add state for previous year data and loading state
    - Fetch both current and previous year data on load
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [ ] 7.2 Create YoY comparison cards UI
    - Display side-by-side comparison for medical, donations, and total
    - Show percentage change with up/down indicators
    - Handle edge cases (no previous data, API errors)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  
  - [ ] 7.3 Add CSS styles for YoY comparison section
    - Style comparison cards with current/previous columns
    - Style change indicators (green for up, red for down, gray for same/new)
    - _Requirements: 2.1_

- [ ] 8. Implement Tax Credit Calculator UI
  - [ ] 8.1 Create net income configuration section
    - Add input field for annual net income
    - Add "Use app income data" button to pull from income_sources
    - Persist to localStorage on change
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  
  - [ ] 8.2 Create province selector
    - Add dropdown with all Canadian provinces
    - Default to Ontario, persist selection
    - _Requirements: 6.1, 6.2_
  
  - [ ] 8.3 Create AGI threshold progress section
    - Display calculated threshold amount
    - Show progress bar for medical expenses vs threshold
    - Display deductible amount when threshold exceeded
    - _Requirements: 4.3, 4.4, 4.5, 4.6_
  
  - [ ] 8.4 Create tax credit breakdown display
    - Show federal credits (medical and donation line items)
    - Show provincial credits (medical and donation line items)
    - Display totals for each level
    - _Requirements: 5.3, 5.4, 6.5, 6.6_
  
  - [ ] 8.5 Create tax savings summary card
    - Display total estimated tax savings prominently
    - Show federal/provincial breakdown
    - Show fallback warning if using non-current year rates
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  
  - [ ] 8.6 Add CSS styles for Tax Credit Calculator
    - Style configuration inputs and selectors
    - Style progress bar for AGI threshold
    - Style credit breakdown tables and summary card
    - _Requirements: 8.1, 8.2, 8.3_

- [ ] 9. Checkpoint - Ensure all components work together
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Write integration tests
  - [ ] 10.1 Write unit tests for UI rendering
    - Test YoY comparison renders correctly with various data states
    - Test Tax Credit Calculator renders correctly with/without net income
    - _Requirements: 2.1, 8.1, 8.4_
  
  - [ ] 10.2 Write property tests for YoY data fetching
    - **Property 1: YoY Data Fetching**
    - **Property 2: YoY Display Completeness**
    - **Validates: Requirements 1.1, 2.1**
  
  - [ ] 10.3 Write property tests for year-specific behavior
    - **Property 11: Year-Specific Rate Usage**
    - **Property 12: Rate Fallback Behavior**
    - **Validates: Requirements 7.5, 7.6**

- [ ] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive implementation
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The backend endpoint is lightweight (summary only) to minimize API overhead for YoY comparison
