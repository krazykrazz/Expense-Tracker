# Implementation Plan: Insurance Claim Reminders

## Overview

This implementation adds insurance claim reminders to the existing reminder system, standardizes budget alerts to use the reminder banner pattern, and creates a dedicated Notifications section in the UI.

## Tasks

- [x] 1. Backend: Add insurance claim reminder functionality
  - [x] 1.1 Add `getMedicalExpensesWithPendingClaims()` method to `backend/repositories/reminderRepository.js`
    - Query expenses where type = 'Tax - Medical', insurance_eligible = 1, claim_status = 'in_progress'
    - Include days_pending calculation using julianday
    - Join with expense_people and people tables for person names
    - _Requirements: 1.1, 1.2_
  
  - [x] 1.2 Write property test for query filtering
    - **Property 1: Query Filtering - Only In-Progress Medical Expenses**
    - **Validates: Requirements 1.1**
  
  - [x] 1.3 Add `getInsuranceClaimReminders()` method to `backend/services/reminderService.js`
    - Accept thresholdDays parameter (default: 30)
    - Filter claims by threshold
    - Return structured response with pendingCount, hasPendingClaims, pendingClaims
    - _Requirements: 1.3, 1.4, 4.1, 4.2, 4.3_
  
  - [x] 1.4 Write property tests for service layer
    - **Property 3: Threshold Filtering**
    - **Property 4: Count Invariant**
    - **Validates: Requirements 1.3, 1.4, 4.2, 4.3**
  
  - [x] 1.5 Integrate insurance claim reminders into `getReminderStatus()` response
    - Add insuranceClaimReminders object to response
    - _Requirements: 5.2, 5.3_
  
  - [x] 1.6 Write property test for API response structure
    - **Property 8: API Response Structure**
    - **Validates: Requirements 5.2, 5.3**

- [x] 2. Checkpoint - Backend tests pass
  - Ensure all backend tests pass, ask the user if questions arise.

- [x] 3. Frontend: Create InsuranceClaimReminderBanner component
  - [x] 3.1 Create `frontend/src/components/InsuranceClaimReminderBanner.jsx`
    - Follow existing reminder banner pattern (CreditCardReminderBanner)
    - Display place, amount, days pending for each claim
    - Support single and multi-claim views
    - Use green/teal color scheme
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  
  - [x] 3.2 Create `frontend/src/components/InsuranceClaimReminderBanner.css`
    - Style consistent with other reminder banners
    - Green/teal color scheme for distinction
    - _Requirements: 2.4_
  
  - [x] 3.3 Write property tests for InsuranceClaimReminderBanner
    - **Property 5: Banner Rendering with Required Content**
    - **Property 6: Multi-Claim Summary Display**
    - **Validates: Requirements 2.1, 2.2, 2.3**

- [x] 4. Frontend: Create NotificationsSection component
  - [x] 4.1 Create `frontend/src/components/NotificationsSection.jsx`
    - Wrapper component for all reminder banners
    - Display "Notifications" header with count badge
    - Collapsible functionality
    - Only render when notifications exist
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  
  - [x] 4.2 Create `frontend/src/components/NotificationsSection.css`
    - Style header with icon and badge
    - Collapse/expand animation
    - Visual separation from Monthly Summary
    - _Requirements: 7.1_
  
  - [x] 4.3 Write unit tests for NotificationsSection
    - Test rendering with various notification counts
    - Test collapse/expand behavior
    - Test empty state (no render)
    - _Requirements: 7.2, 7.3, 7.4_

- [x] 5. Frontend: Refactor BudgetAlertBanner to BudgetReminderBanner
  - [x] 5.1 Create `frontend/src/components/BudgetReminderBanner.jsx`
    - Follow reminder banner pattern (single click to navigate)
    - Display category, spending percentage, budget limit
    - Support single and multi-alert views
    - Orange/amber color scheme
    - _Requirements: 6.1, 6.3, 6.5, 6.6_
  
  - [x] 5.2 Create `frontend/src/components/BudgetReminderBanner.css`
    - Style consistent with other reminder banners
    - Orange/amber color scheme
    - _Requirements: 6.3_
  
  - [x] 5.3 Write property tests for BudgetReminderBanner
    - **Property 9: Budget Alert Click Navigation**
    - **Property 10: Budget Alert Content Display**
    - **Property 11: Budget Alert Multi-Alert Summary**
    - **Validates: Requirements 6.4, 6.5, 6.6**

- [x] 6. Checkpoint - Component tests pass
  - Ensure all component tests pass, ask the user if questions arise.

- [x] 7. Frontend: Integrate into SummaryPanel
  - [x] 7.1 Update `frontend/src/components/SummaryPanel.jsx`
    - Import NotificationsSection, InsuranceClaimReminderBanner, BudgetReminderBanner
    - Add insuranceClaimReminders to reminderStatus state
    - Add dismissedReminders state for insurance claims and budget alerts
    - Calculate total notification count
    - Wrap all reminder banners in NotificationsSection
    - Move "Monthly Summary" header below NotificationsSection
    - _Requirements: 2.5, 5.2, 7.1, 7.5_
  
  - [x] 7.2 Add click handlers for insurance claim and budget reminders
    - Insurance claim click: Navigate to Tax Deductible view with "In Progress" filter
    - Budget click: Navigate to expense list filtered by category
    - _Requirements: 3.1, 3.2, 6.4_
  
  - [x] 7.3 Write property test for dismissal behavior
    - **Property 7: Dismissal Hides Banner**
    - **Validates: Requirements 2.5, 6.2**

- [x] 8. Frontend: Update BudgetAlertManager integration
  - [x] 8.1 Update `frontend/src/components/BudgetAlertManager.jsx`
    - Replace BudgetAlertBanner with BudgetReminderBanner
    - Simplify to use single onClick handler instead of multiple action buttons
    - Remove BudgetAlertErrorBoundary if no longer needed
    - _Requirements: 6.1, 6.2_
  
  - [x] 8.2 Update SummaryPanel to use refactored BudgetAlertManager
    - Pass onClick handler for category navigation
    - Integrate with NotificationsSection
    - _Requirements: 6.4_

- [x] 9. Checkpoint - Integration tests pass
  - Ensure all integration tests pass, ask the user if questions arise.

- [x] 10. Cleanup and documentation
  - [x] 10.1 Remove deprecated BudgetAlertBanner component (if fully replaced)
    - Keep backup in case rollback needed
    - Update any imports
  
  - [x] 10.2 Update feature documentation
    - Add entry to docs/features/ for insurance claim reminders
    - Update product.md with new feature description

- [x] 11. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive testing
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
