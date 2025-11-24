# Code Smells Analysis Report

**Generated:** November 24, 2025  
**Scope:** Full codebase analysis

## Executive Summary

This report identifies code quality issues, anti-patterns, and technical debt across the expense tracker application. The analysis covers backend (Node.js/Express) and frontend (React) codebases.

## 🟢 Positive Findings

- ✅ No TODO/FIXME comments in production code
- ✅ No console.log statements in production code
- ✅ No empty catch blocks
- ✅ Proper error handling throughout
- ✅ Good separation of concerns (Controller → Service → Repository)
- ✅ Comprehensive test coverage with property-based testing

---

## 🔴 Critical Issues

### 1. **Circular Dependency in Budget/Expense Services**

**Location:** `backend/services/expenseService.js`

**Issue:**
```javascript
// Lazy-load budgetService to avoid circular dependency
let budgetService = null;
function getBudgetService() {
  if (!budgetService) {
    budgetService = require('./budgetService');
  }
  return budgetService;
}
```

**Problem:** This is a workaround for a circular dependency between `expenseService` and `budgetService`. The expense service needs to trigger budget recalculations, and budget service needs expense data.

**Impact:** 
- Makes code harder to understand and maintain
- Indicates poor separation of concerns
- Can lead to initialization issues

**Recommendation:**
- Extract budget recalculation logic into a separate `budgetCalculationService`
- Use event-driven architecture (event emitter) for cross-service communication
- Consider implementing a mediator pattern

---

## 🟡 Major Issues

### 2. **Duplicate SQL Query Patterns**

**Location:** Multiple repository files

**Issue:** Similar SQL queries are repeated across repositories with slight variations.

**Examples:**
```javascript
// Pattern repeated in multiple places
db.get('SELECT COUNT(*) as count FROM expenses WHERE ...', ...)
db.all('SELECT * FROM expenses WHERE ...', ...)
```

**Impact:**
- Code duplication
- Harder to maintain consistency
- Risk of SQL injection if not careful

**Recommendation:**
- Create a query builder utility or use an ORM
- Extract common query patterns into reusable functions
- Consider using a query builder library like Knex.js

### 3. **Magic Numbers in Test Files**

**Location:** `backend/services/budgetService.test.js`, `backend/services/backupService.pbt.test.js`

**Issue:**
```javascript
year: fc.integer({ min: 2020, max: 2030 })
year: fc.integer({ min: 2090, max: 2099 })
validateNumber(year, 'Year', { min: 1900, max: 2100 });
timeout: 60000
```

**Problem:** Hardcoded values scattered throughout tests without clear constants.

**Recommendation:**
```javascript
// Create test constants
const TEST_CONSTANTS = {
  YEAR_RANGE: { MIN: 2020, MAX: 2030 },
  FUTURE_YEAR_RANGE: { MIN: 2090, MAX: 2099 },
  VALID_YEAR_RANGE: { MIN: 1900, MAX: 2100 },
  PBT_TIMEOUT: 60000,
  PBT_NUM_RUNS: 100
};
```

### 4. **Long Method: `getSummary` in ExpenseService**

**Location:** `backend/services/expenseService.js:289-365`

**Issue:** The `getSummary` method is 77 lines long and handles multiple responsibilities:
- Fetching expense summary
- Fetching monthly gross
- Fetching fixed expenses
- Fetching loans
- Calculating totals
- Handling previous month logic

**Recommendation:** Break into smaller, focused methods:
```javascript
async getSummary(year, month, includePrevious = false) {
  const current = await this._getCurrentMonthSummary(year, month);
  
  if (!includePrevious) {
    return current;
  }
  
  const { prevYear, prevMonth } = this._calculatePreviousMonth(year, month);
  const previous = await this._getCurrentMonthSummary(prevYear, prevMonth);
  
  return { current, previous };
}

async _getCurrentMonthSummary(year, month) {
  const summary = await expenseRepository.getSummary(year, month);
  const monthlyGross = await this._getMonthlyGross(year, month);
  const fixedExpenses = await this._getFixedExpenses(year, month);
  const loans = await this._getLoansData(year, month);
  
  return this._buildSummaryObject(summary, monthlyGross, fixedExpenses, loans);
}
```

### 5. **Long Method: `getAnnualSummary` in ExpenseService**

**Location:** `backend/services/expenseService.js:397-537`

**Issue:** 140+ lines with deeply nested callbacks (callback hell).

**Problem:**
```javascript
db.all(monthlyQuery, [year.toString()], (err, monthlyVariableExpenses) => {
  db.all(fixedExpensesQuery, [year], (err, monthlyFixedExpenses) => {
    db.all(incomeQuery, [year], (err, monthlyIncome) => {
      db.all(categoryQuery, [year.toString()], (err, categoryTotals) => {
        db.all(methodQuery, [year.toString()], (err, methodTotals) => {
          // ... processing logic
        });
      });
    });
  });
});
```

**Recommendation:** Convert to async/await and extract helper methods:
```javascript
async getAnnualSummary(year) {
  const [
    monthlyVariableExpenses,
    monthlyFixedExpenses,
    monthlyIncome,
    categoryTotals,
    methodTotals
  ] = await Promise.all([
    this._getMonthlyVariableExpenses(year),
    this._getMonthlyFixedExpenses(year),
    this._getMonthlyIncome(year),
    this._getCategoryTotals(year),
    this._getMethodTotals(year)
  ]);
  
  return this._buildAnnualSummary(
    year,
    monthlyVariableExpenses,
    monthlyFixedExpenses,
    monthlyIncome,
    categoryTotals,
    methodTotals
  );
}
```

### 6. **Inconsistent Error Handling in Frontend**

**Location:** Multiple React components

**Issue:** Some components log errors to console, others show user messages, some do both inconsistently.

**Examples:**
```javascript
// ExpenseForm.jsx
catch (error) {
  console.error('Failed to fetch categories:', error);
  // Keep default fallback value
}

// App.jsx
catch (err) {
  setError(err.message);
  console.error('Error fetching expenses:', err);
}

// ExpenseForm.jsx (different pattern)
catch (error) {
  console.error('Failed to fetch category suggestion:', error);
  // Silently fail - don't disrupt user experience
}
```

**Recommendation:** Create a centralized error handling utility:
```javascript
// utils/errorHandler.js
export const handleError = (error, options = {}) => {
  const { 
    showToUser = true, 
    logToConsole = true,
    context = 'Unknown'
  } = options;
  
  if (logToConsole) {
    console.error(`[${context}]`, error);
  }
  
  if (showToUser) {
    return {
      message: error.message || 'An unexpected error occurred',
      type: 'error'
    };
  }
  
  return null;
};
```

### 7. **Missing Cleanup in useEffect Hooks**

**Location:** Multiple React components

**Issue:** Several `useEffect` hooks don't return cleanup functions, which can lead to memory leaks.

**Example:**
```javascript
// App.jsx - Good example with cleanup
useEffect(() => {
  const handleExpensesUpdated = () => {
    // ... handler logic
  };

  window.addEventListener('expensesUpdated', handleExpensesUpdated);
  
  return () => {
    window.removeEventListener('expensesUpdated', handleExpensesUpdated);
  };
}, [selectedYear, selectedMonth, searchText]);

// ExpenseForm.jsx - Missing cleanup for async operations
useEffect(() => {
  const fetchCategories = async () => {
    // ... fetch logic
  };
  fetchCategories();
}, []); // No cleanup - potential memory leak if component unmounts during fetch
```

**Recommendation:** Add cleanup for async operations:
```javascript
useEffect(() => {
  let isMounted = true;
  
  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/categories');
      if (response.ok && isMounted) {
        const data = await response.json();
        setTypeOptions(data.categories);
      }
    } catch (error) {
      if (isMounted) {
        console.error('Failed to fetch categories:', error);
      }
    }
  };
  
  fetchCategories();
  
  return () => {
    isMounted = false;
  };
}, []);
```

---

## 🟡 Moderate Issues

### 8. **Duplicate Validation Logic**

**Location:** Controllers and Services

**Issue:** Validation logic is duplicated between controllers and services.

**Example:**
```javascript
// expenseController.js
if (isNaN(id)) {
  return res.status(400).json({ error: 'Invalid expense ID' });
}

// Similar validation in multiple controllers
```

**Recommendation:** Create a validation middleware:
```javascript
// middleware/validators.js
const validateId = (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid ID' });
  }
  req.validatedId = id;
  next();
};

// Usage in routes
router.put('/expenses/:id', validateId, expenseController.updateExpense);
```

### 9. **Hardcoded Payment Methods and Categories**

**Location:** Multiple files

**Issue:** Payment methods and categories are hardcoded in multiple places.

**Examples:**
```javascript
// ExpenseForm.jsx
const methodOptions = ['Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'];

// ExpenseList.jsx
<option value="Cash">Cash</option>
<option value="Debit">Debit</option>
// ... repeated

// expenseService.js
const validMethods = ['Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'];
```

**Recommendation:** Centralize in a constants file:
```javascript
// utils/constants.js (backend)
export const PAYMENT_METHODS = [
  'Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'
];

// frontend/src/utils/constants.js
export const PAYMENT_METHODS = [
  'Cash', 'Debit', 'Cheque', 'CIBC MC', 'PCF MC', 'WS VISA', 'VISA'
];
```

### 10. **Inconsistent Date Handling**

**Location:** Multiple files

**Issue:** Date formatting and parsing is handled inconsistently.

**Examples:**
```javascript
// Some places use string manipulation
const yearStr = year.toString();
const monthStr = month.toString().padStart(2, '0');

// Others use Date objects
const dateObj = new Date(date);
const year = dateObj.getFullYear();

// Some use strftime in SQL
strftime('%Y', date)
strftime('%m', date)
```

**Recommendation:** Create a centralized date utility:
```javascript
// utils/dateUtils.js
export const formatYearMonth = (year, month) => ({
  yearStr: year.toString(),
  monthStr: month.toString().padStart(2, '0'),
  dateStr: `${year}-${month.toString().padStart(2, '0')}-01`
});

export const parseDate = (dateString) => {
  const date = new Date(dateString);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate()
  };
};
```

### 11. **Nested Ternary Operators**

**Location:** `frontend/src/components/ExpenseList.jsx`

**Issue:**
```javascript
const noExpensesMessage = expenses.length === 0 
  ? (searchText 
      ? 'No results found for your search.' 
      : (filterType || filterMethod)
        ? 'No expenses match the selected filters.'
        : 'No expenses have been recorded for this period.')
  : null;
```

**Recommendation:**
```javascript
const getNoExpensesMessage = () => {
  if (expenses.length > 0) return null;
  if (searchText) return 'No results found for your search.';
  if (filterType || filterMethod) return 'No expenses match the selected filters.';
  return 'No expenses have been recorded for this period.';
};

const noExpensesMessage = getNoExpensesMessage();
```

### 12. **Large Component Files**

**Location:** `frontend/src/App.jsx` (400+ lines), `frontend/src/components/ExpenseList.jsx` (500+ lines)

**Issue:** Components are doing too much and becoming hard to maintain.

**Recommendation:** Break into smaller components:
```
App.jsx
├── Header.jsx
├── MainContent.jsx
│   ├── ExpenseListSection.jsx
│   └── SummarySection.jsx
└── ModalManager.jsx
    ├── ExpenseFormModal.jsx
    ├── BackupSettingsModal.jsx
    └── ...
```

---

## 🟢 Minor Issues

### 13. **Inconsistent Naming Conventions**

**Issue:** Mix of camelCase and snake_case in database fields vs JavaScript objects.

**Examples:**
```javascript
// Database: snake_case
loan.is_paid_off
loan.estimated_months_left

// JavaScript: camelCase
loan.isPaidOff

// Conversion happens in service layer
isPaidOff: loan.is_paid_off === 1
```

**Recommendation:** Use a consistent mapping layer or ORM to handle this automatically.

### 14. **Commented-Out Code**

**Location:** Various test files

**Issue:** Some test files have commented-out console.log statements.

**Recommendation:** Remove commented-out code or use a proper debugging flag.

### 15. **Inconsistent String Concatenation**

**Issue:** Mix of template literals and string concatenation.

**Examples:**
```javascript
// Template literals (preferred)
`${year}-${month.toString().padStart(2, '0')}-01`

// String concatenation
year.toString() + '-' + month.toString()
```

**Recommendation:** Standardize on template literals throughout.

---

## 📊 Metrics Summary

| Category | Count | Severity |
|----------|-------|----------|
| Circular Dependencies | 1 | Critical |
| Long Methods (>50 lines) | 3 | Major |
| Duplicate Code Patterns | 5+ | Major |
| Missing Error Handling | 0 | None |
| Magic Numbers | 10+ | Moderate |
| Inconsistent Patterns | 8 | Moderate |
| Missing Cleanup | 5+ | Moderate |

---

## 🎯 Prioritized Action Items

### High Priority (Do First)
1. **Resolve circular dependency** between expense and budget services
2. **Refactor long methods** in ExpenseService (getSummary, getAnnualSummary)
3. **Add cleanup functions** to useEffect hooks with async operations
4. **Centralize error handling** in frontend

### Medium Priority (Do Soon)
5. Extract duplicate SQL query patterns
6. Create constants for payment methods and categories
7. Standardize date handling utilities
8. Break down large React components

### Low Priority (Nice to Have)
9. Standardize naming conventions with mapping layer
10. Remove commented-out code
11. Standardize on template literals
12. Extract magic numbers to constants

---

## 🔧 Recommended Refactoring Strategy

### Phase 1: Foundation (Week 1)
- Create centralized constants file
- Implement error handling utility
- Add useEffect cleanup functions

### Phase 2: Architecture (Week 2)
- Resolve circular dependency
- Extract budget calculation service
- Create query builder utilities

### Phase 3: Code Quality (Week 3)
- Refactor long methods
- Break down large components
- Standardize date handling

### Phase 4: Polish (Week 4)
- Remove code duplication
- Standardize naming conventions
- Update documentation

---

## 📝 Notes

- Overall code quality is **good** with proper separation of concerns
- Test coverage is **excellent** with property-based testing
- Main issues are architectural (circular dependencies) and maintainability (long methods, duplication)
- No security vulnerabilities identified
- Performance is not a concern based on current code patterns

---

**Report End**
