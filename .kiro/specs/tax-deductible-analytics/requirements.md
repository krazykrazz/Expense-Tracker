# Requirements Document

## Introduction

This feature enhances the existing TaxDeductible component with two major capabilities: Year-over-Year (YoY) comparison of tax deductible expenses and a Tax Credit Calculator that estimates potential tax savings based on Canadian tax rules. The feature helps users understand their tax deductible spending trends and estimate the actual tax benefit they may receive from their medical expenses and charitable donations.

## Glossary

- **Tax_Deductible_Analytics_System**: The enhanced TaxDeductible component providing YoY comparison and tax credit calculations
- **YoY_Comparison_Module**: The subsystem responsible for displaying previous year's tax deductible totals alongside current year data
- **Tax_Credit_Calculator**: The subsystem that calculates estimated tax credits based on Canadian tax rules for a specific tax year
- **AGI_Threshold**: The 3% of net income threshold for medical expense deductibility (lesser of 3% of net income or the federal threshold amount, which changes annually)
- **Federal_Threshold_Amount**: The maximum AGI threshold set by the federal government, adjusted annually for inflation (e.g., $2,759 for 2024, $2,635 for 2023)
- **Deductible_Amount**: The portion of medical expenses that exceeds the AGI threshold and qualifies for tax credits
- **Federal_Tax_Credit_Rate**: The non-refundable tax credit rate (15% for medical expenses, 15%/29% tiered for donations)
- **Provincial_Tax_Credit_Rate**: Province-specific tax credit rates (varies by province and may change by year)
- **Net_Income**: The user's annual net income for a specific tax year, used for AGI threshold calculation
- **Settings_Storage**: localStorage-based persistence for user configuration (net income by year, province selection)
- **Tax_Year_Config**: Year-specific configuration containing tax rates, thresholds, and other parameters that may change annually

## Requirements

### Requirement 1: Year-over-Year Data Retrieval

**User Story:** As a user, I want to see my previous year's tax deductible totals alongside the current year, so that I can understand my spending trends.

#### Acceptance Criteria

1. WHEN the Tax_Deductible_Analytics_System loads for a given year, THE Tax_Deductible_Analytics_System SHALL fetch tax deductible data for both the current year and the previous year
2. WHEN the previous year has no tax deductible data, THE Tax_Deductible_Analytics_System SHALL display "No data" or appropriate placeholder values for the previous year
3. WHEN fetching previous year data fails, THE Tax_Deductible_Analytics_System SHALL display the current year data and show an error indicator for the previous year section

### Requirement 2: Year-over-Year Display

**User Story:** As a user, I want to see a clear comparison between this year and last year's tax deductible expenses, so that I can track my progress.

#### Acceptance Criteria

1. THE YoY_Comparison_Module SHALL display medical expenses, donations, and total deductible amounts for both current and previous years in a side-by-side format
2. WHEN displaying YoY comparison, THE YoY_Comparison_Module SHALL calculate and display the percentage change between years for each category
3. WHEN the current year amount is greater than the previous year, THE YoY_Comparison_Module SHALL display an upward indicator (↑) with the percentage increase
4. WHEN the current year amount is less than the previous year, THE YoY_Comparison_Module SHALL display a downward indicator (↓) with the percentage decrease
5. WHEN the previous year amount is zero and current year has data, THE YoY_Comparison_Module SHALL display "New" instead of a percentage change
6. WHEN both years have zero amounts for a category, THE YoY_Comparison_Module SHALL display no change indicator

### Requirement 3: Net Income Configuration

**User Story:** As a user, I want to input my annual net income on a per-year basis, so that the system can calculate my medical expense threshold accurately for each tax year.

#### Acceptance Criteria

1. THE Tax_Credit_Calculator SHALL provide an input field for the user to enter their annual net income for the currently viewed year
2. WHEN the user enters a net income value, THE Settings_Storage SHALL persist the value to localStorage keyed by year
3. WHEN the Tax_Credit_Calculator loads, THE Tax_Credit_Calculator SHALL retrieve the previously saved net income for the currently viewed year from localStorage
4. WHEN no net income is configured for the current year, THE Tax_Credit_Calculator SHALL display a prompt to enter net income before showing tax credit calculations
5. THE Tax_Credit_Calculator SHALL allow the user to pull their annual income from the app's income_sources data for the current year as a convenience option
6. WHEN the user changes the viewed year, THE Tax_Credit_Calculator SHALL load the net income configuration specific to that year

### Requirement 4: AGI Threshold Calculation

**User Story:** As a user, I want to see how much of my medical expenses exceed the deductibility threshold, so that I understand what portion qualifies for tax credits.

#### Acceptance Criteria

1. WHEN net income is configured, THE Tax_Credit_Calculator SHALL calculate the AGI threshold as the lesser of 3% of net income or the federal threshold amount for the tax year
2. THE Tax_Credit_Calculator SHALL use year-specific federal threshold amounts (e.g., $2,759 for 2024, which changes annually with inflation)
3. THE Tax_Credit_Calculator SHALL display the calculated AGI threshold amount
4. THE Tax_Credit_Calculator SHALL display a progress bar showing how much of the medical expenses exceed the threshold
5. WHEN medical expenses are below the threshold, THE Tax_Credit_Calculator SHALL display the progress bar showing current progress toward the threshold
6. WHEN medical expenses exceed the threshold, THE Tax_Credit_Calculator SHALL display the deductible amount (medical expenses minus threshold)

### Requirement 5: Federal Tax Credit Calculation

**User Story:** As a user, I want to see my estimated federal tax credits for medical expenses and donations, so that I can understand my potential tax savings.

#### Acceptance Criteria

1. THE Tax_Credit_Calculator SHALL calculate medical expense federal tax credit as 15% of the deductible amount (amount above AGI threshold)
2. THE Tax_Credit_Calculator SHALL calculate donation federal tax credit as 15% on the first $200 of donations plus 29% on donations exceeding $200
3. THE Tax_Credit_Calculator SHALL display the federal tax credit amounts for both medical expenses and donations
4. THE Tax_Credit_Calculator SHALL display the total estimated federal tax credit (medical + donations)
5. WHEN medical expenses do not exceed the AGI threshold, THE Tax_Credit_Calculator SHALL display $0 for medical expense tax credit

### Requirement 6: Provincial Tax Credit Calculation

**User Story:** As a user, I want to see estimated provincial tax credits based on my province, so that I can understand my total tax savings.

#### Acceptance Criteria

1. THE Tax_Credit_Calculator SHALL provide a province selector defaulting to Ontario
2. WHEN the user selects a province, THE Settings_Storage SHALL persist the selection to localStorage
3. THE Tax_Credit_Calculator SHALL calculate provincial medical expense tax credit using the province's tax credit rate on the deductible amount
4. THE Tax_Credit_Calculator SHALL calculate provincial donation tax credit using the province's tiered rates
5. THE Tax_Credit_Calculator SHALL display provincial tax credit amounts alongside federal credits
6. THE Tax_Credit_Calculator SHALL display the combined total estimated tax savings (federal + provincial)

### Requirement 7: Tax Rate Configuration

**User Story:** As a developer, I want tax rates to be configurable constants on a per-year basis, so that they can be updated when tax rules change and historical calculations remain accurate.

#### Acceptance Criteria

1. THE Tax_Credit_Calculator SHALL store federal tax credit rates as configurable constants organized by tax year
2. THE Tax_Credit_Calculator SHALL store provincial tax credit rates for all Canadian provinces as configurable constants organized by tax year
3. THE Tax_Credit_Calculator SHALL store the federal AGI threshold amounts as configurable constants organized by tax year (e.g., 2024: $2,759, 2023: $2,635, etc.)
4. WHEN tax rates are updated in the configuration, THE Tax_Credit_Calculator SHALL use the updated rates without code changes
5. WHEN viewing a specific tax year, THE Tax_Credit_Calculator SHALL use the tax rates and thresholds applicable to that year
6. IF tax rates for a specific year are not configured, THE Tax_Credit_Calculator SHALL fall back to the most recent available year's rates and display a warning

### Requirement 8: Tax Credit Summary Display

**User Story:** As a user, I want to see a clear summary of my estimated tax savings, so that I can understand the benefit of my tax deductible expenses.

#### Acceptance Criteria

1. THE Tax_Credit_Calculator SHALL display a summary card showing total estimated tax savings
2. THE Tax_Credit_Calculator SHALL break down the summary into federal and provincial components
3. THE Tax_Credit_Calculator SHALL show separate line items for medical expense credits and donation credits
4. WHEN the user has not configured net income, THE Tax_Credit_Calculator SHALL display a message prompting configuration instead of showing incomplete calculations
