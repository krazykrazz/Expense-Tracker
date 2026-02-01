# Requirements Document

## Introduction

This feature introduces a fixed interest rate configuration option for loans of type "loan" (not line_of_credit or mortgage). When a loan is configured with a fixed interest rate, the system simplifies balance entry by auto-populating the rate and hiding rate-related columns in the balance history display. This reduces data entry burden for users with traditional fixed-rate loans where the interest rate never changes.

## Glossary

- **Loan**: A debt instrument in the system with loan_type='loan' (as opposed to 'line_of_credit' or 'mortgage')
- **Fixed_Interest_Rate**: A nullable REAL column on the loans table that, when set, indicates the loan has a constant interest rate
- **Balance_Entry**: A record in the loan_balances table tracking the remaining balance and interest rate for a specific month
- **Rate_Change_Indicator**: A UI element showing the difference in interest rate between consecutive balance entries
- **Variable_Rate_Loan**: A loan without a fixed_interest_rate set, requiring manual rate entry for each balance entry

## Requirements

### Requirement 1: Fixed Interest Rate Storage

**User Story:** As a user, I want to configure a fixed interest rate on my loan, so that I don't have to enter the same rate every month.

#### Acceptance Criteria

1. THE Loan_Schema SHALL include a nullable fixed_interest_rate column of type REAL
2. WHEN a loan has loan_type='loan', THE System SHALL allow setting a fixed_interest_rate value
3. WHEN a loan has loan_type='line_of_credit' or loan_type='mortgage', THE System SHALL NOT allow setting a fixed_interest_rate value
4. WHEN fixed_interest_rate is set, THE System SHALL validate that the value is greater than or equal to zero
5. THE System SHALL support migration of existing loans table to add the fixed_interest_rate column

### Requirement 2: Simplified Balance Entry for Fixed-Rate Loans

**User Story:** As a user with a fixed-rate loan, I want a simplified balance entry form, so that I can quickly record my monthly balance without redundant rate entry.

#### Acceptance Criteria

1. WHEN adding a balance entry for a loan with fixed_interest_rate set, THE Balance_Entry_Form SHALL hide the interest rate input field
2. WHEN adding a balance entry for a loan with fixed_interest_rate set, THE System SHALL automatically use the fixed_interest_rate value for the rate field
3. WHEN adding a balance entry for a loan without fixed_interest_rate set, THE Balance_Entry_Form SHALL display the interest rate input field as required
4. WHEN editing a balance entry for a loan with fixed_interest_rate set, THE System SHALL still allow viewing the rate but not editing it
5. THE Balance_Entry_Form SHALL display a visual indicator showing that the rate is fixed when fixed_interest_rate is set

### Requirement 3: Balance History Display for Fixed-Rate Loans

**User Story:** As a user with a fixed-rate loan, I want the balance history to hide irrelevant rate change information, so that the display is cleaner and more relevant.

#### Acceptance Criteria

1. WHEN displaying balance history for a loan with fixed_interest_rate set, THE Balance_History_Table SHALL hide the Rate Change column
2. WHEN displaying balance history for a loan with fixed_interest_rate set, THE Balance_History_Table SHALL still display the Interest Rate column showing the fixed rate
3. WHEN displaying balance history for a loan without fixed_interest_rate set, THE Balance_History_Table SHALL display both Interest Rate and Rate Change columns
4. THE Balance_History_Table SHALL display a visual indicator that the loan has a fixed rate

### Requirement 4: Fixed Rate Configuration in Loan Management

**User Story:** As a user, I want to set or update the fixed interest rate when creating or editing a loan, so that I can configure my loan correctly.

#### Acceptance Criteria

1. WHEN creating a new loan with loan_type='loan', THE Loan_Form SHALL display an optional fixed interest rate input field
2. WHEN editing an existing loan with loan_type='loan', THE Loan_Form SHALL allow updating the fixed_interest_rate value
3. WHEN the user sets a fixed_interest_rate, THE System SHALL validate the rate is a valid non-negative number
4. WHEN the user clears the fixed_interest_rate, THE System SHALL allow the loan to revert to variable-rate behavior
5. THE Loan_Form SHALL NOT display the fixed interest rate field for loan_type='line_of_credit' or loan_type='mortgage'
6. WHEN a loan is converted from variable to fixed rate, THE System SHALL NOT retroactively update existing balance entries

### Requirement 5: API Support for Fixed Interest Rate

**User Story:** As a developer, I want the API to support fixed interest rate operations, so that the frontend can properly manage fixed-rate loans.

#### Acceptance Criteria

1. WHEN creating a loan via API, THE System SHALL accept an optional fixed_interest_rate parameter
2. WHEN updating a loan via API, THE System SHALL accept an optional fixed_interest_rate parameter
3. WHEN retrieving loans via API, THE System SHALL include the fixed_interest_rate field in the response
4. WHEN creating a balance entry for a fixed-rate loan, THE API SHALL accept balance entries without a rate parameter and auto-populate from fixed_interest_rate
5. IF a balance entry is submitted without a rate for a variable-rate loan, THEN THE API SHALL return a validation error

### Requirement 6: Backward Compatibility

**User Story:** As an existing user, I want my current loans and balance entries to continue working unchanged, so that the new feature doesn't disrupt my existing data.

#### Acceptance Criteria

1. THE System SHALL treat existing loans without fixed_interest_rate as variable-rate loans
2. THE System SHALL NOT require any changes to existing balance entries
3. WHEN fixed_interest_rate is NULL, THE System SHALL require rate input for new balance entries
4. THE Migration SHALL preserve all existing loan and balance data without modification
