# Requirements Document

## Introduction

This document specifies the requirements for Phase 4 of the frontend state management refactoring: SharedDataContext. This context will extract shared data fetching and state management from App.jsx, centralizing payment methods, people, and budgets data along with their refresh mechanisms. This is the final phase of the state management refactoring effort.

## Glossary

- **SharedDataContext**: A React context that manages shared data state (payment methods, people, budgets) and their refresh triggers
- **SharedDataProvider**: The React component that provides SharedDataContext to its children
- **Payment_Methods**: Array of payment method display names fetched from the API for filtering and form selection
- **People**: Array of person records for medical expense tracking
- **Budgets**: Array of budget records for budget management
- **Refresh_Trigger**: A counter state that increments to trigger data re-fetching
- **Payment_Methods_Modal**: The modal for managing payment methods configuration

## Requirements

### Requirement 1: Payment Methods State Management

**User Story:** As a developer, I want payment methods state centralized in SharedDataContext, so that any component can access and refresh payment methods data without prop drilling.

#### Acceptance Criteria

1. THE SharedDataProvider SHALL maintain a `paymentMethods` array state initialized as empty
2. THE SharedDataProvider SHALL maintain a `paymentMethodsRefreshTrigger` counter state initialized to 0
3. WHEN the SharedDataProvider mounts, THE SharedDataProvider SHALL fetch payment methods from the API
4. WHEN `paymentMethodsRefreshTrigger` changes, THE SharedDataProvider SHALL re-fetch payment methods from the API
5. THE SharedDataProvider SHALL expose a `refreshPaymentMethods` callback that increments the refresh trigger
6. THE SharedDataProvider SHALL expose the `paymentMethods` array through context

### Requirement 2: Payment Methods Modal State

**User Story:** As a developer, I want the payment methods modal visibility state in SharedDataContext, so that it can be opened from any component via context or window event.

#### Acceptance Criteria

1. THE SharedDataProvider SHALL maintain a `showPaymentMethods` boolean state initialized to false
2. THE SharedDataProvider SHALL expose `openPaymentMethods` callback that sets `showPaymentMethods` to true
3. THE SharedDataProvider SHALL expose `closePaymentMethods` callback that sets `showPaymentMethods` to false
4. WHEN the `openPaymentMethods` window event is dispatched, THE SharedDataProvider SHALL set `showPaymentMethods` to true
5. THE SharedDataProvider SHALL clean up the window event listener on unmount

### Requirement 3: People State Management

**User Story:** As a developer, I want people data centralized in SharedDataContext, so that components needing person data for medical expense tracking can access it without prop drilling.

#### Acceptance Criteria

1. THE SharedDataProvider SHALL maintain a `people` array state initialized as empty
2. THE SharedDataProvider SHALL maintain a `peopleRefreshTrigger` counter state initialized to 0
3. WHEN the SharedDataProvider mounts, THE SharedDataProvider SHALL fetch people from the API
4. WHEN `peopleRefreshTrigger` changes, THE SharedDataProvider SHALL re-fetch people from the API
5. THE SharedDataProvider SHALL expose a `refreshPeople` callback that increments the refresh trigger
6. THE SharedDataProvider SHALL expose the `people` array through context
7. WHEN the `peopleUpdated` window event is dispatched, THE SharedDataProvider SHALL increment `peopleRefreshTrigger`

### Requirement 4: Budgets State Management

**User Story:** As a developer, I want budgets data centralized in SharedDataContext, so that components needing budget information can access it consistently.

#### Acceptance Criteria

1. THE SharedDataProvider SHALL maintain a `budgets` array state initialized as empty
2. THE SharedDataProvider SHALL maintain a `budgetRefreshTrigger` counter state initialized to 0
3. WHEN the SharedDataProvider mounts or when year/month changes, THE SharedDataProvider SHALL fetch budgets from the API
4. WHEN `budgetRefreshTrigger` changes, THE SharedDataProvider SHALL re-fetch budgets from the API
5. THE SharedDataProvider SHALL expose a `refreshBudgets` callback that increments the refresh trigger
6. THE SharedDataProvider SHALL expose the `budgets` array through context

### Requirement 5: Context Hook and Error Handling

**User Story:** As a developer, I want a custom hook for consuming SharedDataContext with proper error handling, so that I get clear errors when using the context incorrectly.

#### Acceptance Criteria

1. THE useSharedDataContext hook SHALL return the context value when used within SharedDataProvider
2. IF useSharedDataContext is called outside of SharedDataProvider, THEN THE hook SHALL throw an error with message "useSharedDataContext must be used within a SharedDataProvider"
3. THE SharedDataProvider SHALL handle API fetch errors gracefully without crashing
4. WHEN an API fetch fails, THE SharedDataProvider SHALL log the error to console and maintain existing state

### Requirement 6: Provider Integration

**User Story:** As a developer, I want SharedDataProvider properly integrated into the component tree, so that all child components can access shared data.

#### Acceptance Criteria

1. THE SharedDataProvider SHALL be nested inside ModalProvider in the component tree
2. THE SharedDataProvider SHALL wrap AppContent component
3. THE SharedDataProvider SHALL NOT consume other contexts (FilterContext, ExpenseContext, ModalContext)
4. THE SharedDataProvider SHALL use useCallback for all handler functions to prevent unnecessary re-renders
5. THE SharedDataProvider SHALL use useMemo for the context value to prevent unnecessary re-renders

### Requirement 7: Backward Compatibility

**User Story:** As a developer, I want the refactoring to maintain backward compatibility, so that existing functionality continues to work without changes to consuming components.

#### Acceptance Criteria

1. WHEN SharedDataContext is integrated, THE App component SHALL continue to pass paymentMethods to FilterProvider
2. WHEN SharedDataContext is integrated, THE AppContent component SHALL receive people data from context instead of local state
3. WHEN SharedDataContext is integrated, THE PaymentMethodsModal SHALL continue to function with open/close from context
4. THE SharedDataProvider SHALL dispatch the same window events as the current implementation for cross-component communication
