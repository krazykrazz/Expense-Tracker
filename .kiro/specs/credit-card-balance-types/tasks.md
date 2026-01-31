# Implementation Plan: Credit Card Balance Types

## Overview

This implementation adds three distinct balance calculations (Statement, Current, Projected) and billing cycle management to credit cards. The work extends the existing `PaymentMethodService` with new calculation methods and updates the `CreditCardDetailView` component to display all balance types and billing cycle details.

## Tasks

- [x] 1. Implement core balance calculation methods in PaymentMethodService
  - [x] 1.1 Implement `calculateStatementBalance()` method
    - Sum expenses where COALESCE(posted_date, date) < current billing cycle start
    - Subtract payments where payment_date < current billing cycle start
    - Return null if no billing cycle configured
    - Ensure result is never negative (minimum 0)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  
  - [x] 1.2 Implement `calculateCurrentBalance()` method
    - Sum expenses where COALESCE(posted_date, date) <= today
    - Subtract payments where payment_date <= today
    - Ensure result is never negative (minimum 0)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  
  - [x] 1.3 Implement `calculateProjectedBalance()` method
    - Sum ALL expenses regardless of date
    - Subtract ALL payments regardless of date
    - Ensure result is never negative (minimum 0)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  
  - [x] 1.4 Implement `getAllBalanceTypes()` method
    - Call all three balance calculation methods
    - Calculate has_pending_expenses flag (projected != current)
    - Include billing cycle dates if configured
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  
  - [x] 1.5 Write property test for balance ordering invariant
    - **Property 1: Balance Ordering Invariant**
    - **Validates: Requirements 1.1, 2.1, 3.1**
  
  - [x] 1.6 Write property test for non-negative balance invariant
    - **Property 3: Non-Negative Balance Invariant**
    - **Validates: Requirements 1.5, 2.4, 3.3**

- [x] 2. Implement billing cycle details methods
  - [x] 2.1 Implement `getBillingCycleDetails()` method
    - Accept paymentMethodId, startDate, endDate parameters
    - Query transaction count and total for the period using effective_date
    - Query payment count and total for the period
    - Return BillingCycleDetails object
    - _Requirements: 8.4, 9.4_
  
  - [x] 2.2 Implement `getCurrentBillingCycleDetails()` method
    - Calculate current billing cycle dates using existing calculateCurrentBillingCycle()
    - Call getBillingCycleDetails() with current cycle dates
    - Return null if no billing cycle configured
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [x] 2.3 Implement `getPreviousBillingCycles()` method
    - Calculate previous N billing cycle date ranges
    - Call getBillingCycleDetails() for each cycle
    - Return array of BillingCycleDetails sorted by date descending
    - _Requirements: 9.1, 9.2, 9.3_
  
  - [x] 2.4 Write property test for billing cycle transaction count accuracy
    - **Property 8: Billing Cycle Transaction Count Accuracy**
    - **Validates: Requirements 8.2, 8.3**
  
  - [x] 2.5 Write property test for billing cycle total accuracy
    - **Property 9: Billing Cycle Total Accuracy**
    - **Validates: Requirements 8.3, 9.3**

- [x] 3. Checkpoint - Ensure all service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update getCreditCardWithComputedFields to return all balance types
  - [x] 4.1 Modify getCreditCardWithComputedFields() to include new balance fields
    - Add statement_balance, current_balance, projected_balance
    - Add has_pending_expenses flag
    - Add current_cycle object with transaction count and totals
    - Deprecate expense_count in favor of current_cycle.transaction_count
    - _Requirements: 4.1, 4.2, 4.3, 7.1_
  
  - [x] 4.2 Update _calculateDynamicBalance() to use calculateCurrentBalance()
    - Refactor to avoid code duplication
    - Ensure backward compatibility
    - _Requirements: 2.5_
  
  - [x] 4.3 Write property test for effective date consistency
    - **Property 2: Effective Date Consistency**
    - **Validates: Requirements 1.4, 2.3, 5.1**
  
  - [x] 4.4 Write property test for expense count and balance consistency
    - **Property 5: Expense Count and Balance Consistency**
    - **Validates: Requirements 5.2, 5.3, 5.4**

- [x] 5. Add billing cycles API endpoint
  - [x] 5.1 Add route in backend/routes/paymentMethodRoutes.js
    - GET /api/payment-methods/:id/billing-cycles
    - Accept optional count query parameter (default 6)
    - _Requirements: 9.1_
  
  - [x] 5.2 Add controller method in paymentMethodController.js
    - getBillingCycles(req, res) handler
    - Validate payment method exists and is credit card
    - Call service method and return response
    - _Requirements: 9.1, 9.2, 9.3_
  
  - [x] 5.3 Add endpoint to frontend/src/config.js
    - Add BILLING_CYCLES endpoint constant
    - _Requirements: 9.1_
  
  - [x] 5.4 Add API function in frontend/src/services/creditCardApi.js
    - getBillingCycles(paymentMethodId, count) function
    - _Requirements: 9.1_

- [x] 6. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Update CreditCardDetailView to display all balance types
  - [x] 7.1 Update overview section to show all three balance types
    - Show current balance prominently (primary card)
    - Show statement balance if billing cycle configured
    - Show projected balance if different from current
    - Update utilization to use current balance
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [x] 7.2 Add current billing cycle card
    - Display cycle start and end dates
    - Show transaction count for current cycle
    - Show total amount for current cycle
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [x] 7.3 Add billing cycle history section
    - Expandable/collapsible section
    - List previous cycles with dates, counts, and totals
    - Allow navigation to view cycle details
    - _Requirements: 9.1, 9.2, 9.3_
  
  - [x] 7.4 Update CSS for new balance display components
    - Style statement balance card
    - Style projected balance indicator
    - Style billing cycle cards and history section
    - _Requirements: 4.1, 4.2, 4.3, 8.5_

- [x] 8. Write property tests for payment impact
  - [x] 8.1 Write property test for payment reduction
    - **Property 4: Payment Reduction Property**
    - **Validates: Requirements 3.2, 6.3**
  
  - [x] 8.2 Write property test for statement balance null when no billing cycle
    - **Property 6: Statement Balance Null When No Billing Cycle**
    - **Validates: Requirements 1.3, 7.2**
  
  - [x] 8.3 Write property test for projected equals current when no future expenses
    - **Property 7: Projected Equals Current When No Future Expenses**
    - **Validates: Requirements 4.4**

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required including property-based tests for comprehensive validation
- Each task references specific requirements for traceability
- No database schema changes required - uses existing tables
- The existing `_calculateDynamicBalance()` method will be refactored to use the new `calculateCurrentBalance()` method
- Property tests validate universal correctness properties using fast-check library (100+ iterations each)
