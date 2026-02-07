# Implementation Plan: Mortgage Payment Date Display

## Overview

Frontend-only implementation that displays the next mortgage payment date in CurrentStatusInsights by leveraging the existing `payment_due_day` from linked fixed expenses. No database, API, or form changes needed.

## Tasks

- [x] 1. Create next payment calculator utility
  - [x] 1.1 Create `frontend/src/utils/nextPaymentCalculator.js`
    - Implement `calculateNextPaymentDate(paymentDueDay, referenceDate)` returning `{ nextDate, daysUntil }` or `null`
    - Implement `getLastDayOfMonth(year, month)` helper
    - Implement `formatNextPaymentDate(date)` for display formatting
    - Mirror logic from `backend/utils/dateUtils.js` `calculateDaysUntilDue`
    - Handle edge cases: February, 30-day months, paymentDueDay > last day of month
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 1.2 Write property test for next payment calculation
    - Create `frontend/src/utils/nextPaymentCalculator.pbt.test.js`
    - **Property 1: Next payment date calculation**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

  - [x] 1.3 Write property test for payment urgency indicator
    - Add to `frontend/src/utils/nextPaymentCalculator.pbt.test.js`
    - **Property 2: Payment urgency indicator**
    - **Validates: Requirements 3.2, 3.3**

- [x] 2. Wire payment due day through component tree
  - [x] 2.1 Update LoanDetailView to extract and pass paymentDueDay
    - Extract `payment_due_day` from `linkedFixedExpenses[0]` (already fetched)
    - Pass `paymentDueDay` prop to `MortgageInsightsPanel`
    - _Requirements: 1.1, 1.2_

  - [x] 2.2 Update MortgageInsightsPanel to forward paymentDueDay
    - Accept `paymentDueDay` prop in component signature
    - Forward `paymentDueDay` prop to `CurrentStatusInsights`
    - _Requirements: 1.3_

- [x] 3. Add next payment display to CurrentStatusInsights
  - [x] 3.1 Add paymentDueDay prop and next payment section to CurrentStatusInsights
    - Accept `paymentDueDay` prop
    - Import and use `calculateNextPaymentDate` and `formatNextPaymentDate`
    - Render next payment date when paymentDueDay is set
    - Show "Payment due today" when daysUntil is 0
    - Show "Due soon" badge when daysUntil is 1-7
    - Show "Payment day not set" fallback when paymentDueDay is null
    - Place section between Current Payment and Current Balance sections
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 3.2 Add CSS styles for next payment display
    - Style `.insights-next-payment`, `.next-payment-label`, `.next-payment-date`
    - Style `.next-payment-date.soon` with warning color
    - Style `.next-payment-date.today` with emphasis color
    - Style `.payment-soon-badge` matching existing badge patterns
    - Style `.next-payment-not-set` and `.next-payment-hint` with muted styling
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 3.3 Write unit tests for CurrentStatusInsights payment date display
    - Create `frontend/src/components/CurrentStatusInsights.paymentDate.test.jsx`
    - Test rendering with paymentDueDay set (shows formatted date)
    - Test "Due soon" badge when within 7 days
    - Test "Payment due today" display
    - Test "Payment day not set" fallback when paymentDueDay is null
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required
- This is a frontend-only feature — no backend, database, or API changes
- The `payment_due_day` data already exists via the fixed expense - loan linkage system
- Property tests use fast-check via Vitest (already configured in the project)
