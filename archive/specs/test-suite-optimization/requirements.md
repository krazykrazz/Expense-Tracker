# Test Suite Optimization - Requirements

## Overview

Optimize the frontend test suite to reduce execution time and improve developer experience. The current ExpenseForm.test.jsx file has 67 tests taking ~16 seconds, and the overall test suite is slowing development velocity.

## Problem Statement

- ExpenseForm.test.jsx is a monolithic test file with 67 tests (3697 lines)
- Test execution takes ~16 seconds for this single file
- Running full test suite during development is slow
- Difficult to run specific test categories
- No clear organization of test types

## User Stories

### 1. Split ExpenseForm Tests
**As a** developer  
**I want** ExpenseForm tests split into focused files  
**So that** tests run in parallel and I can run specific test groups

**Acceptance Criteria:**
- 1.1 ExpenseForm.test.jsx is split into 5 focused files
- 1.2 Each file has a clear, single responsibility
- 1.3 All 67 tests are preserved (no tests lost)
- 1.4 All tests continue to pass after split
- 1.5 Test files follow naming convention: `ExpenseForm.<category>.test.jsx`

### 2. Fast Test Commands
**As a** developer  
**I want** npm scripts to run only changed or fast tests  
**So that** I get quick feedback during development

**Acceptance Criteria:**
- 2.1 `npm run test:changed` runs only tests for changed files
- 2.2 `npm run test:fast` runs with reduced PBT iterations
- 2.3 Commands are documented in package.json and testing.md
- 2.4 Commands work on both Windows and Unix systems

### 3. Test Documentation
**As a** developer  
**I want** clear documentation of test organization  
**So that** I know which tests to run for different scenarios

**Acceptance Criteria:**
- 3.1 testing.md documents the new test file structure
- 3.2 testing.md explains when to run each test category
- 3.3 testing.md includes examples of running specific test groups
- 3.4 Each test file has a header comment explaining its scope

## Test File Split Strategy

### ExpenseForm.core.test.jsx
- Basic rendering tests
- Form submission (happy path)
- Required field validation
- Default values
- Form reset after submission
- ~10-12 tests

### ExpenseForm.sections.test.jsx
- Collapsible section visibility
- Section expansion/collapse
- Badge display on section headers
- Help tooltips
- Section-specific validation
- ~15-18 tests

### ExpenseForm.people.test.jsx
- People dropdown visibility (medical expenses only)
- Single person selection
- Multiple people selection
- Person allocation modal
- People selection clearing
- ~8-10 tests

### ExpenseForm.futureMonths.test.jsx
- Future months checkbox
- Date range preview
- Future months dropdown
- API parameter passing
- Success messages with future expense count
- Reset after submission
- ~8-10 tests

### ExpenseForm.dataPreservation.test.jsx
- Data preservation during collapse/expand
- Field values retained across section toggles
- Reimbursement data preservation
- Insurance data preservation
- Advanced options data preservation
- ~8-10 tests

## Non-Functional Requirements

### Performance
- Individual test files should run in <5 seconds
- Full suite should benefit from parallel execution
- No increase in total test execution time in CI

### Maintainability
- Each test file should be <800 lines
- Clear separation of concerns
- Shared setup code extracted to test-utils
- Consistent test structure across files

### Compatibility
- Works with existing Vitest configuration
- Compatible with CI/CD pipeline
- No breaking changes to existing test commands

## Out of Scope

- Reducing test redundancy (future work)
- Test tagging system (future work)
- Mocking heavy dependencies (future work)
- Backend test optimization (separate effort)
- Property-based test iteration reduction (future work)

## Success Metrics

- ExpenseForm test execution time: 16s → 8-10s (with parallel execution)
- Developer can run specific test categories
- All 67 tests pass after split
- Zero tests lost during migration
- Documentation updated and clear

## Dependencies

- Existing test-utils infrastructure
- Vitest test runner
- Current ExpenseForm.test.jsx file

## Risks

- Tests might be accidentally lost during split
- Shared setup code might be duplicated
- Test execution order dependencies might break tests
- Parallel execution might reveal timing issues

## Mitigation

- Verify test count before and after split
- Extract common setup to shared utilities
- Ensure tests are independent (no shared state)
- Run tests multiple times to catch flaky tests
