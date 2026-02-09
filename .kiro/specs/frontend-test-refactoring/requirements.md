# Requirements Document

## Introduction

The frontend test suite has grown complex and brittle, particularly for ExpenseForm tests. Tests are tightly coupled to implementation details (CollapsibleSection expansion, timing, state propagation), leading to unreliable behavior in the jsdom test environment. This spec addresses test simplification, reliability improvements, and establishes clear testing guidelines to reduce cognitive load and improve maintainability.

## Glossary

- **Test_Suite**: The collection of all frontend tests using Vitest and @testing-library/react
- **ExpenseForm**: The primary complex component with collapsible sections and conditional field display
- **CollapsibleSection**: A UI component that expands/collapses content, causing test reliability issues in jsdom
- **PBT**: Property-Based Testing using fast-check library
- **jsdom**: JavaScript implementation of web standards used as the test environment
- **Implementation_Detail**: Internal component structure or behavior not visible to users
- **User_Facing_Behavior**: Observable behavior from a user's perspective (what they see and interact with)
- **Test_Brittleness**: Tests that fail due to minor implementation changes unrelated to actual functionality
- **Integration_Test**: Tests that verify multiple components working together
- **Unit_Test**: Tests that verify a single component or function in isolation
- **E2E_Test**: End-to-end tests that verify complete user workflows in a real browser

## Requirements

### Requirement 1: Reduce Test Coupling to Implementation Details

**User Story:** As a developer, I want tests that focus on user-facing behavior rather than implementation details, so that I can refactor code without breaking tests unnecessarily.

#### Acceptance Criteria

1. WHEN a component's internal structure changes without affecting user behavior, THEN existing tests SHALL continue to pass
2. WHEN testing CollapsibleSection interactions, THE Test_Suite SHALL mock the component and test expansion behavior separately
3. WHEN testing form interactions, THE Test_Suite SHALL use @testing-library/user-event instead of fireEvent for realistic user simulation
4. WHEN a test queries the DOM, THE Test_Suite SHALL use accessible queries (getByRole, getByLabelText) instead of implementation-specific queries (getByTestId, querySelector)
5. WHEN testing component state, THE Test_Suite SHALL verify state through observable UI changes rather than direct state inspection

### Requirement 2: Improve Test Reliability in jsdom Environment

**User Story:** As a developer, I want tests that run reliably in the jsdom environment, so that I don't have to skip tests or deal with flaky failures.

#### Acceptance Criteria

1. WHEN CollapsibleSection expansion is required for a test, THE Test_Suite SHALL mock the component to avoid jsdom limitations
2. WHEN testing async operations, THE Test_Suite SHALL use proper async utilities (waitFor, findBy queries) with appropriate timeouts
3. WHEN a test depends on timing, THE Test_Suite SHALL use explicit waits rather than arbitrary delays
4. WHEN a component interaction fails in jsdom, THE Test_Suite SHALL document the limitation and provide an alternative testing approach
5. WHEN tests are skipped due to jsdom limitations, THE Test_Suite SHALL include a comment explaining why and suggesting E2E test coverage

### Requirement 3: Establish Clear Testing Strategy Guidelines

**User Story:** As a developer, I want clear guidelines on when to use different testing approaches, so that I can write appropriate tests without overthinking the decision.

#### Acceptance Criteria

1. THE Test_Suite SHALL document when to use unit tests (single component/function, specific examples, edge cases)
2. THE Test_Suite SHALL document when to use integration tests (multiple components working together, user workflows)
3. THE Test_Suite SHALL document when to use PBT (algorithms, data transformations, business logic with clear properties)
4. THE Test_Suite SHALL document when to use E2E tests (critical user paths, browser-specific behavior, visual validation)
5. THE Test_Suite SHALL document when NOT to use PBT (UI interactions, component rendering, user events)
6. THE Test_Suite SHALL provide decision tree or flowchart for selecting test approach
7. WHEN a test type is chosen, THE documentation SHALL include example patterns and anti-patterns

### Requirement 4: Reduce Property-Based Testing Scope for UI

**User Story:** As a developer, I want to use PBT for appropriate scenarios (algorithms, business logic), so that tests are simpler and more maintainable.

#### Acceptance Criteria

1. WHEN testing UI component rendering, THE Test_Suite SHALL use unit tests instead of PBT
2. WHEN testing user interactions (clicks, typing, form submission), THE Test_Suite SHALL use integration tests instead of PBT
3. WHEN testing data transformations or calculations, THE Test_Suite SHALL use PBT to verify properties across input ranges
4. WHEN testing business logic with clear invariants, THE Test_Suite SHALL use PBT to verify those invariants
5. WHEN a PBT test for UI exists, THE Test_Suite SHALL evaluate if it should be converted to a simpler unit or integration test

### Requirement 5: Simplify ExpenseForm Test Suite

**User Story:** As a developer, I want simplified ExpenseForm tests that are easy to understand and maintain, so that I can confidently modify the form without fear of breaking tests.

#### Acceptance Criteria

1. WHEN testing ExpenseForm sections, THE Test_Suite SHALL mock CollapsibleSection to avoid expansion issues
2. WHEN testing form field interactions, THE Test_Suite SHALL focus on user-visible behavior (field values, validation messages, submission)
3. WHEN testing conditional field display, THE Test_Suite SHALL verify fields appear/disappear based on user selections
4. WHEN testing form submission, THE Test_Suite SHALL verify the correct data is sent to the API
5. WHEN testing form validation, THE Test_Suite SHALL verify error messages appear for invalid inputs
6. WHEN testing section state preservation, THE Test_Suite SHALL verify data persists through user interactions without testing internal state management

### Requirement 6: Extract Complex Components into Testable Units

**User Story:** As a developer, I want complex components broken into smaller, focused components, so that each component is easier to test and understand.

#### Acceptance Criteria

1. WHEN a component has multiple responsibilities, THE codebase SHALL split it into focused sub-components
2. WHEN a sub-component is extracted, THE Test_Suite SHALL test it independently with simpler tests
3. WHEN components are composed, THE Test_Suite SHALL use integration tests to verify they work together
4. WHEN a component is too complex to test easily, THE Test_Suite SHALL identify extraction opportunities
5. WHEN extracting components, THE codebase SHALL maintain the same user-facing behavior

### Requirement 7: Improve Test Execution Performance

**User Story:** As a developer, I want faster test execution, so that I get quick feedback during development.

#### Acceptance Criteria

1. WHEN running the full test suite, THE Test_Suite SHALL complete in under 5 minutes locally
2. WHEN running focused test files, THE Test_Suite SHALL provide feedback within 10 seconds
3. WHEN PBT tests are converted to unit tests, THE Test_Suite SHALL reduce iteration counts or eliminate unnecessary randomization
4. WHEN tests have setup overhead, THE Test_Suite SHALL use appropriate test utilities to reduce duplication
5. WHEN tests can run in parallel, THE Test_Suite SHALL not introduce artificial serialization

### Requirement 8: Create Reusable Test Patterns and Utilities

**User Story:** As a developer, I want reusable test patterns and utilities, so that I can write consistent tests with less boilerplate.

#### Acceptance Criteria

1. THE Test_Suite SHALL provide a mocked CollapsibleSection component for use in integration tests
2. THE Test_Suite SHALL provide helper functions for common form interactions (fill field, submit form, verify validation)
3. THE Test_Suite SHALL provide helper functions for common assertions (field visible, field has value, error message shown)
4. THE Test_Suite SHALL provide example test files demonstrating recommended patterns
5. THE Test_Suite SHALL document all test utilities in the testing guidelines
6. WHEN a test pattern is used multiple times, THE Test_Suite SHALL extract it into a reusable utility

### Requirement 9: Document Testing Best Practices

**User Story:** As a developer, I want comprehensive testing documentation, so that I can write effective tests without trial and error.

#### Acceptance Criteria

1. THE documentation SHALL include guidelines for testing user interactions with @testing-library/user-event
2. THE documentation SHALL include guidelines for mocking components and modules
3. THE documentation SHALL include guidelines for async testing with waitFor and findBy queries
4. THE documentation SHALL include anti-patterns to avoid (testing implementation details, brittle selectors, arbitrary timeouts)
5. THE documentation SHALL include examples of good and bad tests for common scenarios
6. THE documentation SHALL include troubleshooting guide for common test failures
7. THE documentation SHALL be located in docs/development/FRONTEND_TESTING_GUIDELINES.md and kept up to date

### Requirement 10: Gradual Refactoring Strategy

**User Story:** As a developer, I want a gradual refactoring approach, so that I can improve tests incrementally without blocking other work.

#### Acceptance Criteria

1. WHEN refactoring tests, THE Test_Suite SHALL prioritize the most brittle or complex tests first
2. WHEN touching code with existing tests, THE developer SHALL apply new testing patterns to those tests
3. WHEN new features are added, THE Test_Suite SHALL use the new testing patterns from the start
4. WHEN a test file is refactored, THE Test_Suite SHALL document the changes in a comment or commit message
5. THE Test_Suite SHALL maintain a list of test files that need refactoring for future reference
