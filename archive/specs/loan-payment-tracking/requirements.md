# Requirements Document

## Introduction

This feature introduces payment-based tracking for loans and mortgages, replacing the current balance-based tracking approach. For traditional loans and mortgages, users will log payments made rather than manually entering remaining balances each month. The system will calculate the current balance automatically from the initial balance minus the sum of all payments. Lines of credit will continue to use balance-based tracking since their usage is variable.

## Glossary

- **Loan_Payment_Tracker**: The system component responsible for recording and managing payment entries for loans and mortgages
- **Payment_Entry**: A record of a payment made toward a loan, including amount, date, and optional notes
- **Balance_Calculator**: The component that computes current loan balance from initial_balance minus sum of payments
- **Payment_Suggester**: The component that suggests payment amounts based on history or mortgage monthly_payment field
- **Migration_Utility**: The tool that converts existing balance entries to payment entries
- **Loan**: A debt instrument of type 'loan' in the loans table
- **Mortgage**: A debt instrument of type 'mortgage' in the loans table with monthly_payment field
- **Line_of_Credit**: A debt instrument of type 'line_of_credit' that continues using balance-based tracking

## Requirements

### Requirement 1: Payment Entry Management

**User Story:** As a user, I want to log payments for my loans and mortgages, so that I can track my debt repayment progress without manually calculating remaining balances.

#### Acceptance Criteria

1. WHEN a user creates a payment entry for a loan or mortgage, THE Loan_Payment_Tracker SHALL store the payment amount, payment date, and optional notes
2. WHEN a user views a loan or mortgage, THE Loan_Payment_Tracker SHALL display a list of all payment entries in reverse chronological order
3. WHEN a user edits a payment entry, THE Loan_Payment_Tracker SHALL update the stored payment amount, date, or notes
4. WHEN a user deletes a payment entry, THE Loan_Payment_Tracker SHALL remove the entry and recalculate the current balance
5. THE Loan_Payment_Tracker SHALL validate that payment amounts are positive numbers
6. THE Loan_Payment_Tracker SHALL validate that payment dates are in YYYY-MM-DD format and not in the future

### Requirement 2: Automatic Balance Calculation

**User Story:** As a user, I want the system to automatically calculate my current loan balance, so that I don't have to manually track remaining amounts.

#### Acceptance Criteria

1. THE Balance_Calculator SHALL compute current balance as: initial_balance - sum(all_payment_amounts)
2. WHEN a payment is added, edited, or deleted, THE Balance_Calculator SHALL recalculate the current balance immediately
3. WHEN displaying loan details, THE Balance_Calculator SHALL show the calculated current balance
4. IF the calculated balance would be negative, THEN THE Balance_Calculator SHALL display zero as the current balance
5. THE Balance_Calculator SHALL preserve the existing balance history data for historical reference

### Requirement 3: Smart Payment Suggestions

**User Story:** As a user, I want the system to suggest payment amounts, so that I can quickly log my regular payments without looking up the amount.

#### Acceptance Criteria

1. WHEN a user opens the payment form for a mortgage, THE Payment_Suggester SHALL pre-fill the amount with the mortgage's monthly_payment field value
2. WHEN a user opens the payment form for a regular loan with payment history, THE Payment_Suggester SHALL suggest the average of previous payment amounts
3. WHEN a user opens the payment form for a loan with no payment history, THE Payment_Suggester SHALL leave the amount field empty
4. THE Payment_Suggester SHALL allow users to override the suggested amount

### Requirement 4: Balance Entry Migration

**User Story:** As a user with existing balance entries, I want to convert them to payment entries, so that I can use the new payment-based tracking system.

#### Acceptance Criteria

1. WHEN a user initiates migration for a loan, THE Migration_Utility SHALL calculate payment amounts from consecutive balance differences
2. THE Migration_Utility SHALL create payment entries with dates corresponding to the balance entry months
3. THE Migration_Utility SHALL preserve the original balance entries for historical reference
4. IF balance increased between entries (indicating additional borrowing), THEN THE Migration_Utility SHALL skip that entry and notify the user
5. WHEN migration completes, THE Migration_Utility SHALL display a summary of converted entries and any skipped entries

### Requirement 5: Loan Type Differentiation

**User Story:** As a user, I want different tracking methods for different loan types, so that each type is tracked appropriately.

#### Acceptance Criteria

1. WHEN a loan has type 'loan' or 'mortgage', THE Loan_Payment_Tracker SHALL use payment-based tracking
2. WHEN a loan has type 'line_of_credit', THE Loan_Payment_Tracker SHALL continue using balance-based tracking
3. WHEN displaying a loan detail view, THE Loan_Payment_Tracker SHALL show "Log Payment" for loans/mortgages and "Log Balance" for lines of credit
4. THE Loan_Payment_Tracker SHALL maintain backward compatibility with existing balance entries

### Requirement 6: UI Updates for Payment Tracking

**User Story:** As a user, I want a clear interface for logging payments, so that I can easily track my loan repayments.

#### Acceptance Criteria

1. WHEN viewing a loan or mortgage detail, THE Loan_Payment_Tracker SHALL display a "Log Payment" button instead of "Add Balance Entry"
2. WHEN viewing payment history, THE Loan_Payment_Tracker SHALL show payment date, amount, and running balance after each payment
3. WHEN a suggested payment amount is available, THE Loan_Payment_Tracker SHALL display it as a pre-filled value with a "Suggested" label
4. THE Loan_Payment_Tracker SHALL display total payments made and remaining balance prominently
5. WHEN viewing a line of credit, THE Loan_Payment_Tracker SHALL continue showing the existing balance entry interface

### Requirement 7: Payment History Visualization

**User Story:** As a user, I want to see my payment history visually, so that I can understand my repayment progress over time.

#### Acceptance Criteria

1. WHEN a loan has payment entries, THE Loan_Payment_Tracker SHALL display a chart showing balance reduction over time
2. THE Loan_Payment_Tracker SHALL show cumulative payments made on the chart
3. WHEN hovering over chart points, THE Loan_Payment_Tracker SHALL display the payment amount and resulting balance
