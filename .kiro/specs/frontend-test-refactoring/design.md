# Design Document: Frontend Test Simplification

## Overview

This design addresses the complexity and brittleness in the frontend test suite, particularly for ExpenseForm tests. The solution focuses on three key areas:

1. **Testing Strategy Refinement**: Clear guidelines on when to use unit tests, integration tests, PBT, and E2E tests
2. **Test Utilities and Patterns**: Reusable mocks, helpers, and patterns to reduce boilerplate and improve consistency
3. **Gradual Refactoring**: Incremental improvements starting with the most problematic tests (ExpenseForm)

The design prioritizes pragmatism over perfection - we'll establish patterns and utilities that make it easy to write good tests, then gradually apply them as we touch existing code.

## Architecture

### Testing Pyramid for Frontend

```
         /\
        /E2E\          Critical user paths, visual validation
       /------\
      /  PBT   \       Business logic, algorithms, data transformations
     /----------\
    /Integration \     Component interactions, user workflows
   /--------------\
  /   Unit Tests   \   Component rendering, specific examples, edge cases
 /------------------\
```

**Key Principles:**
- **Unit tests**: Fast, focused, test single components in isolation
- **Integration tests**: Test multiple components working together, user workflows
- **PBT**: Test algorithms and business logic with clear invariants, NOT UI interactions
- **E2E**: Test critical paths in real browsers, visual validation, browser-specific behavior

### Test Utility Organization

```
frontend/src/test-utils/
├── index.js                    # Unified exports
├── arbitraries.js              # fast-check generators (existing)
├── wrappers.jsx                # Context provider wrappers (existing)
├── assertions.js               # Async helpers (existing)
├── mocks.js                    # API mocks (existing)
├── parameterized.js            # testEach helper (existing)
├── expenseFormHelpers.js       # ExpenseForm-specific helpers (existing)
└── componentMocks.jsx          # NEW: Mocked components for testing
```

## Components and Interfaces

### 1. Mocked CollapsibleSection Component

**Purpose**: Provide a simplified CollapsibleSection mock that works reliably in jsdom without expansion issues.

**Interface**:
```typescript
interface MockCollapsibleSectionProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  badge?: string | number;
  children: React.ReactNode;
}
```

**Implementation Strategy**:
- Always render children regardless of `isExpanded` state (jsdom limitation workaround)
- Add `data-testid` attributes for easy querying
- Maintain same prop interface as real component
- Include visual indicators for expanded/collapsed state in test output

**File**: `frontend/src/test-utils/componentMocks.jsx`

```javascript
export const MockCollapsibleSection = ({ 
  title, 
  isExpanded, 
  onToggle, 
  badge, 
  children 
}) => (
  <div data-testid={`collapsible-section-${title.toLowerCase().replace(/\s+/g, '-')}`}>
    <button 
      onClick={onToggle}
      aria-expanded={isExpanded}
      data-testid={`collapsible-header-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {title}
      {badge && <span data-testid="section-badge">{badge}</span>}
    </button>
    {/* Always render children in tests - jsdom doesn't handle CSS display well */}
    <div data-testid={`collapsible-content-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      {children}
    </div>
  </div>
);
```

### 2. Enhanced ExpenseForm Test Helpers

**Purpose**: Extend existing `expenseFormHelpers.js` with additional utilities for common test scenarios.

**New Functions**:

```javascript
// Mock CollapsibleSection for ExpenseForm tests
export const mockCollapsibleSection = () => {
  vi.mock('./CollapsibleSection', () => ({
    default: MockCollapsibleSection
  }));
};

// Verify field visibility without expanding sections
export const assertFieldVisible = (fieldName) => {
  const field = screen.queryByLabelText(fieldName) || screen.queryByRole('textbox', { name: fieldName });
  expect(field).toBeInTheDocument();
  expect(field).toBeVisible();
};

export const assertFieldHidden = (fieldName) => {
  const field = screen.queryByLabelText(fieldName) || screen.queryByRole('textbox', { name: fieldName });
  expect(field).not.toBeInTheDocument();
};

// Verify form submission data
export const assertSubmittedData = (mockFn, expectedData) => {
  expect(mockFn).toHaveBeenCalledWith(
    expect.objectContaining(expectedData)
  );
};

// Verify validation error display
export const assertValidationError = async (message) => {
  await waitFor(() => {
    expect(screen.getByText(message)).toBeInTheDocument();
  });
};
```

### 3. Testing Guidelines Documentation

**Purpose**: Comprehensive documentation in `docs/development/FRONTEND_TESTING_GUIDELINES.md`

**New Sections to Add**:

1. **When to Use Each Test Type** (decision flowchart)
2. **Testing UI Components** (patterns and anti-patterns)
3. **Mocking Strategies** (components, modules, APIs)
4. **Async Testing Best Practices** (waitFor, findBy, user-event)
5. **Common Pitfalls and Solutions** (troubleshooting guide)
6. **Migration Examples** (before/after refactoring examples)

### 4. Test Refactoring Patterns

**Pattern 1: Mock CollapsibleSection in Integration Tests**

**Before** (brittle, jsdom issues):
```javascript
it('should show insurance fields when Tax - Medical is selected', async () => {
  render(<ExpenseForm onExpenseAdded={vi.fn()} />);
  
  // This fails in jsdom - section doesn't actually expand
  await expandSection(container, 'Advanced Options');
  
  const insuranceField = screen.getByLabelText('Insurance Status');
  expect(insuranceField).toBeVisible();
});
```

**After** (reliable, mocked):
```javascript
// At top of file
vi.mock('./CollapsibleSection', () => ({
  default: MockCollapsibleSection
}));

it('should show insurance fields when Tax - Medical is selected', async () => {
  render(<ExpenseForm onExpenseAdded={vi.fn()} />);
  
  // Select tax-deductible category
  const categorySelect = screen.getByLabelText('Category');
  await userEvent.selectOptions(categorySelect, 'Tax - Medical');
  
  // Field is now visible (no section expansion needed)
  const insuranceField = screen.getByLabelText('Insurance Status');
  expect(insuranceField).toBeInTheDocument();
});
```

**Pattern 2: Test CollapsibleSection Separately**

```javascript
// CollapsibleSection.test.jsx
describe('CollapsibleSection', () => {
  it('should toggle expansion on click', async () => {
    const onToggle = vi.fn();
    render(
      <CollapsibleSection title="Test" isExpanded={false} onToggle={onToggle}>
        <div>Content</div>
      </CollapsibleSection>
    );
    
    const header = screen.getByRole('button', { name: /test/i });
    await userEvent.click(header);
    
    expect(onToggle).toHaveBeenCalled();
  });
  
  it('should show badge when provided', () => {
    render(
      <CollapsibleSection title="Test" isExpanded={false} onToggle={vi.fn()} badge="3">
        <div>Content</div>
      </CollapsibleSection>
    );
    
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
```

**Pattern 3: Convert UI PBT to Parameterized Tests**

**Before** (PBT for finite inputs):
```javascript
it('Property: form validates all required fields', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('date', 'place', 'amount', 'category'),
      (field) => {
        const { getByLabelText, getByText } = render(<ExpenseForm />);
        // Leave field empty
        fireEvent.click(getByText('Add Expense'));
        expect(getByText(/required/i)).toBeInTheDocument();
        cleanup();
      }
    )
  );
});
```

**After** (parameterized):
```javascript
import { testEach } from '../test-utils';

testEach([
  { field: 'Date', label: 'Date' },
  { field: 'Place', label: 'Place' },
  { field: 'Amount', label: 'Amount' },
  { field: 'Category', label: 'Category' }
]).test('shows validation error when $field is empty', async ({ label }) => {
  render(<ExpenseForm onExpenseAdded={vi.fn()} />);
  
  const submitButton = screen.getByRole('button', { name: /add expense/i });
  await userEvent.click(submitButton);
  
  await waitFor(() => {
    expect(screen.getByText(/required/i)).toBeInTheDocument();
  });
});
```

**Pattern 4: Use user-event Instead of fireEvent**

**Before**:
```javascript
fireEvent.change(input, { target: { value: 'test' } });
fireEvent.click(button);
```

**After**:
```javascript
await userEvent.type(input, 'test');
await userEvent.click(button);
```

**Benefits**: user-event simulates real user interactions more accurately (focus, blur, keyboard events, etc.)

## Data Models

### Test Execution Metrics

Track test performance to ensure we meet performance requirements:

```typescript
interface TestMetrics {
  totalTests: number;
  executionTime: number; // milliseconds
  passRate: number; // percentage
  slowTests: Array<{
    name: string;
    duration: number;
  }>;
}
```

**Target Metrics**:
- Full suite: < 5 minutes (300,000ms)
- Focused file: < 10 seconds (10,000ms)
- Individual test: < 1 second (1,000ms) for unit tests

### Refactoring Tracking

Maintain a list of test files that need refactoring:

```typescript
interface RefactoringTask {
  file: string;
  priority: 'high' | 'medium' | 'low';
  issues: string[];
  estimatedEffort: 'small' | 'medium' | 'large';
}
```

**High Priority Files** (based on current issues):
1. `ExpenseForm.sections.test.jsx` - CollapsibleSection expansion issues
2. `ExpenseForm.pbt.test.jsx` - UI interactions in PBT
3. `ExpenseForm.dataPreservation.test.jsx` - Implementation detail coupling

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Analysis

After reviewing all acceptance criteria through the prework analysis, we found that this spec is primarily about **testing strategy, documentation, and process improvements** rather than functional requirements with testable properties.

**Key Findings**:
- 0 criteria are testable as properties (no universal invariants to verify)
- 2 criteria are testable as examples (performance thresholds)
- 48 criteria are not testable (documentation, strategy, process requirements)

This is expected for a "meta" spec about improving the test suite itself. The validation of this spec's success will come through:
1. **Code review**: Verifying new tests follow the documented patterns
2. **Performance measurement**: Tracking test execution times
3. **Developer feedback**: Assessing whether tests are easier to write and maintain
4. **Test stability**: Monitoring test flakiness and failure rates

### Testable Examples

While there are no universal properties to verify, we can validate specific performance thresholds:

**Example 1: Full Test Suite Performance**
- **Validates: Requirements 7.1**
- Run full frontend test suite locally
- Measure total execution time
- Assert: execution time < 300,000ms (5 minutes)

**Example 2: Focused Test File Performance**
- **Validates: Requirements 7.2**
- Run a single test file (e.g., `ExpenseForm.core.test.jsx`)
- Measure execution time
- Assert: execution time < 10,000ms (10 seconds)

These can be implemented as CI checks or local development scripts, but they're not property-based tests - they're specific performance benchmarks.

## Error Handling

### Test Failure Scenarios

**Scenario 1: jsdom Limitations**
- **Issue**: CollapsibleSection expansion doesn't work in jsdom
- **Solution**: Mock the component in integration tests, test it separately in unit tests
- **Documentation**: Add comment explaining why mocking is necessary

**Scenario 2: Async Timing Issues**
- **Issue**: Tests fail intermittently due to timing
- **Solution**: Use `waitFor` with appropriate timeouts, avoid arbitrary delays
- **Documentation**: Troubleshooting guide with common async patterns

**Scenario 3: Implementation Detail Coupling**
- **Issue**: Tests break when refactoring internal structure
- **Solution**: Query by accessible roles/labels, assert on user-visible behavior
- **Documentation**: Anti-patterns section with examples

### Migration Risks

**Risk 1: Breaking Existing Tests**
- **Mitigation**: Refactor incrementally, one file at a time
- **Validation**: Ensure all tests pass before and after refactoring

**Risk 2: Incomplete Coverage**
- **Mitigation**: Don't remove tests without equivalent replacement
- **Validation**: Track code coverage metrics

**Risk 3: Team Adoption**
- **Mitigation**: Provide clear examples and documentation
- **Validation**: Code review checklist for new tests

## Testing Strategy

### Dual Testing Approach

This spec is unique in that it's about improving the test suite itself. The "testing" for this spec consists of:

1. **Manual Validation**: Code review to ensure new patterns are followed
2. **Performance Benchmarks**: Automated checks for test execution time
3. **Developer Experience**: Qualitative feedback on test maintainability
4. **Test Stability**: Monitor flakiness and failure rates over time

### Unit Tests

**What to Test**:
- MockCollapsibleSection component renders correctly
- Test helper functions work as expected
- Documentation examples are accurate

**Example**:
```javascript
describe('MockCollapsibleSection', () => {
  it('should render children regardless of isExpanded state', () => {
    render(
      <MockCollapsibleSection title="Test" isExpanded={false} onToggle={vi.fn()}>
        <div>Content</div>
      </MockCollapsibleSection>
    );
    
    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});
```

### Integration Tests

**What to Test**:
- ExpenseForm tests using mocked CollapsibleSection work correctly
- Test helpers integrate properly with @testing-library
- Refactored tests maintain same coverage as originals

**Example**:
```javascript
describe('ExpenseForm with mocked CollapsibleSection', () => {
  beforeEach(() => {
    vi.mock('./CollapsibleSection', () => ({
      default: MockCollapsibleSection
    }));
  });
  
  it('should show conditional fields based on category selection', async () => {
    render(<ExpenseForm onExpenseAdded={vi.fn()} />);
    
    const categorySelect = screen.getByLabelText('Category');
    await userEvent.selectOptions(categorySelect, 'Tax - Medical');
    
    expect(screen.getByLabelText('Insurance Status')).toBeInTheDocument();
  });
});
```

### Performance Benchmarks

**Benchmark 1: Full Suite Execution Time**
```javascript
// scripts/measure-test-performance.js
const { execSync } = require('child_process');

const start = Date.now();
execSync('npm test', { stdio: 'inherit' });
const duration = Date.now() - start;

console.log(`Test suite completed in ${duration}ms`);
if (duration > 300000) {
  console.error('❌ Test suite exceeded 5 minute threshold');
  process.exit(1);
}
console.log('✅ Test suite performance acceptable');
```

### Documentation Validation

**Validation Method**: Manual review checklist
- [ ] Decision flowchart is clear and actionable
- [ ] Examples compile and run successfully
- [ ] Anti-patterns are clearly explained
- [ ] Troubleshooting guide covers common issues
- [ ] Migration examples show before/after correctly

## Implementation Notes

### Phase 1: Foundation (Week 1)
1. Create `componentMocks.jsx` with MockCollapsibleSection
2. Add new helper functions to `expenseFormHelpers.js`
3. Update `FRONTEND_TESTING_GUIDELINES.md` with new sections
4. Create performance benchmark script

### Phase 2: ExpenseForm Refactoring (Week 2-3)
1. Refactor `ExpenseForm.sections.test.jsx` to use mocked CollapsibleSection
2. Convert UI PBT tests to parameterized tests where appropriate
3. Replace fireEvent with user-event throughout
4. Update tests to use accessible queries

### Phase 3: Broader Application (Week 4+)
1. Apply patterns to other complex components as they're touched
2. Add examples to documentation based on real refactoring experiences
3. Gather developer feedback and iterate on patterns
4. Track test performance metrics over time

### Success Criteria

**Quantitative**:
- Test suite execution time < 5 minutes
- Focused test file execution < 10 seconds
- Zero skipped tests due to jsdom limitations (after refactoring)
- Test flakiness rate < 1%

**Qualitative**:
- Developers report tests are easier to write and understand
- Code reviews show consistent application of new patterns
- Test failures are easier to debug and fix
- New features have appropriate test coverage from the start
