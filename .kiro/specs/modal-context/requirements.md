# Requirements Document

## Introduction

This specification defines the requirements for extracting modal visibility state management from App.jsx into a dedicated ModalContext. This is Phase 3 of the frontend state management refactoring series. Phase 1 (FilterContext) extracted filter and view mode state. Phase 2 (ExpenseContext) extracted expense data, CRUD handlers, and filtering. Phase 3 targets all modal open/close boolean states and their associated handlers, removing 8+ useState hooks from AppContent and centralizing modal management so any component can open or close modals without prop drilling.

## Glossary

- **Modal_Context**: A React Context that provides modal visibility state and open/close handlers to child components
- **Modal_Provider**: The React Context Provider component that manages all modal visibility state
- **Filter_Context**: The existing React Context (from Phase 1) providing filter and view mode state
- **Expense_Context**: The existing React Context (from Phase 2) providing expense data and CRUD operations
- **Modal_State**: A boolean value indicating whether a specific modal is currently visible
- **Focus_Category**: An optional string parameter passed when opening the budget management modal to auto-focus a specific category

## Requirements

### Requirement 1: Modal Context Creation

**User Story:** As a developer, I want all modal visibility state managed in a dedicated context, so that I can open and close modals from any component without prop drilling through App.jsx.

#### Acceptance Criteria

1. THE Modal_Context SHALL provide boolean visibility state for the expense form modal
2. THE Modal_Context SHALL provide boolean visibility state for the backup settings modal
3. THE Modal_Context SHALL provide boolean visibility state for the annual summary modal
4. THE Modal_Context SHALL provide boolean visibility state for the tax deductible modal
5. THE Modal_Context SHALL provide boolean visibility state for the budget management modal
6. THE Modal_Context SHALL provide boolean visibility state for the budget history modal
7. THE Modal_Context SHALL provide boolean visibility state for the people management modal
8. THE Modal_Context SHALL provide boolean visibility state for the analytics hub modal
9. THE Modal_Context SHALL provide the budget management focus category value (string or null)

### Requirement 2: Modal Open and Close Handlers

**User Story:** As a developer, I want centralized open and close handler functions for each modal, so that modal state transitions are consistent and predictable.

#### Acceptance Criteria

1. THE Modal_Context SHALL provide an openExpenseForm handler that sets the expense form modal to visible
2. THE Modal_Context SHALL provide a closeExpenseForm handler that sets the expense form modal to hidden
3. THE Modal_Context SHALL provide an openBackupSettings handler that sets the backup settings modal to visible
4. THE Modal_Context SHALL provide a closeBackupSettings handler that sets the backup settings modal to hidden
5. THE Modal_Context SHALL provide an openAnnualSummary handler that sets the annual summary modal to visible
6. THE Modal_Context SHALL provide a closeAnnualSummary handler that sets the annual summary modal to hidden
7. THE Modal_Context SHALL provide an openTaxDeductible handler that sets the tax deductible modal to visible
8. THE Modal_Context SHALL provide a closeTaxDeductible handler that sets the tax deductible modal to hidden
9. THE Modal_Context SHALL provide an openBudgetManagement handler that sets the budget management modal to visible and accepts an optional focus category parameter
10. THE Modal_Context SHALL provide a closeBudgetManagement handler that sets the budget management modal to hidden and resets the focus category to null
11. THE Modal_Context SHALL provide an openBudgetHistory handler that sets the budget history modal to visible
12. THE Modal_Context SHALL provide a closeBudgetHistory handler that sets the budget history modal to hidden
13. THE Modal_Context SHALL provide an openPeopleManagement handler that sets the people management modal to visible
14. THE Modal_Context SHALL provide a closePeopleManagement handler that sets the people management modal to hidden
15. THE Modal_Context SHALL provide an openAnalyticsHub handler that sets the analytics hub modal to visible
16. THE Modal_Context SHALL provide a closeAnalyticsHub handler that sets the analytics hub modal to hidden

### Requirement 3: Bulk Modal Close for Navigation Events

**User Story:** As a developer, I want a handler that closes multiple overlay modals at once, so that navigation events (like navigateToExpenseList) can return the user to the main expense list view.

#### Acceptance Criteria

1. THE Modal_Context SHALL provide a closeAllOverlays handler that sets the tax deductible, annual summary, backup settings, and budget history modals to hidden
2. WHEN closeAllOverlays is called, THE Modal_Context SHALL NOT affect the expense form, budget management, people management, or analytics hub modal states

### Requirement 4: Custom Hook for Modal Access

**User Story:** As a developer, I want a custom hook to access modal context, so that I have a clean API for consuming modal state.

#### Acceptance Criteria

1. THE useModalContext hook SHALL return all modal visibility state values and handler functions
2. IF useModalContext is called outside of Modal_Provider, THEN THE hook SHALL throw a descriptive error message
3. THE useModalContext hook SHALL be importable from a dedicated context file

### Requirement 5: Modal Provider Integration

**User Story:** As a developer, I want the Modal Provider nested within the existing context hierarchy, so that modal state is available to all components.

#### Acceptance Criteria

1. THE App component SHALL wrap its content with Modal_Provider inside the existing Expense_Provider
2. THE Modal_Provider SHALL NOT depend on Filter_Context or Expense_Context (modal state is independent)
3. WHEN the refactoring is complete, THE AppContent component SHALL consume modal state via useModalContext hook
4. WHEN the refactoring is complete, THE AppContent component SHALL NOT contain useState hooks for modal visibility (showExpenseForm, showBackupSettings, showAnnualSummary, showTaxDeductible, showBudgetManagement, budgetManagementFocusCategory, showBudgetHistory, showPeopleManagement, showAnalyticsHub)

### Requirement 6: Window Event Listener Integration

**User Story:** As a developer, I want modal-related window event listeners to use the modal context, so that external events can control modal visibility through the centralized state.

#### Acceptance Criteria

1. WHEN a "navigateToTaxDeductible" window event is dispatched, THE Modal_Provider SHALL open the tax deductible modal
2. WHEN a "navigateToExpenseList" window event is dispatched, THE Modal_Provider SHALL close all overlay modals via closeAllOverlays
3. WHEN a "filterByInsuranceStatus" window event is dispatched, THE Modal_Provider SHALL close all overlay modals via closeAllOverlays

### Requirement 7: Backward Compatibility

**User Story:** As a user, I want the application to behave exactly the same after refactoring, so that my workflow is not disrupted.

#### Acceptance Criteria

1. THE refactored application SHALL maintain identical modal open and close behavior for all modals
2. THE refactored application SHALL maintain identical budget management focus category behavior
3. THE refactored application SHALL maintain identical navigation event handling (navigateToTaxDeductible, navigateToExpenseList, filterByInsuranceStatus)
4. THE refactored application SHALL maintain identical modal overlay click-to-close behavior
5. THE refactored application SHALL maintain identical keyboard and accessibility behavior for modals
