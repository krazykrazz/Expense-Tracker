# Design Document: Smart Expense Entry

## Overview

This feature enhances the expense entry workflow by reordering form fields to prioritize the Place input and implementing an intelligent category suggestion system. When a user enters a place name, the system analyzes historical expenses to suggest the most likely category, reducing manual selection and improving data consistency.

## Architecture

The feature follows the existing layered architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                          │
│  ┌─────────────────┐  ┌──────────────────────────────────┐  │
│  │  ExpenseForm    │  │  CategorySuggestionService       │  │
│  │  (reordered)    │──│  (new frontend service)          │  │
│  └─────────────────┘  └──────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Express)                         │
│  ┌─────────────────┐  ┌──────────────────────────────────┐  │
│  │ ExpenseController│  │  CategorySuggestionService      │  │
│  │ (new endpoint)   │──│  (new backend service)          │  │
│  └─────────────────┘  └──────────────────────────────────┘  │
│                              │                               │
│                              ▼                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              ExpenseRepository                        │   │
│  │  (new query: getCategoryFrequencyByPlace)            │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Backend Components

#### 1. Category Suggestion Service (`backend/services/categorySuggestionService.js`)

```javascript
/**
 * Get suggested category for a place based on historical data
 * @param {string} place - The place name to get suggestion for
 * @returns {Promise<{category: string|null, confidence: number, count: number}>}
 */
async function getSuggestedCategory(place) { }

/**
 * Get category frequency breakdown for a place
 * @param {string} place - The place name
 * @returns {Promise<Array<{category: string, count: number, lastUsed: string}>>}
 */
async function getCategoryBreakdown(place) { }
```

#### 2. Expense Repository Extension (`backend/repositories/expenseRepository.js`)

```javascript
/**
 * Get category frequency for a specific place
 * @param {string} place - The place name (case-insensitive match)
 * @returns {Promise<Array<{category: string, count: number, last_used: string}>>}
 */
function getCategoryFrequencyByPlace(place) { }
```

#### 3. New API Endpoint

```
GET /api/expenses/suggest-category?place={placeName}

Response:
{
  "suggestion": {
    "category": "Groceries",
    "confidence": 0.85,
    "count": 17
  },
  "breakdown": [
    { "category": "Groceries", "count": 17, "lastUsed": "2025-11-25" },
    { "category": "Other", "count": 3, "lastUsed": "2025-10-15" }
  ]
}
```

### Frontend Components

#### 1. ExpenseForm Updates (`frontend/src/components/ExpenseForm.jsx`)

**Field Order Change:**
- Current: Date, Type, Place, Amount, Method, Notes
- New: Date, Place, Type, Amount, Method, Notes

**New Behaviors:**
- Place field gets initial focus
- On place blur/selection, fetch category suggestion
- Show suggestion indicator when category is auto-filled
- Remember last payment method in localStorage

#### 2. Category Suggestion API Service (`frontend/src/services/categorySuggestionApi.js`)

```javascript
/**
 * Fetch category suggestion for a place
 * @param {string} place - The place name
 * @returns {Promise<{category: string|null, confidence: number}>}
 */
export async function fetchCategorySuggestion(place) { }
```

## Data Models

### Category Suggestion Response

```typescript
interface CategorySuggestion {
  category: string | null;  // Suggested category or null if no history
  confidence: number;       // 0-1 confidence score (frequency ratio)
  count: number;           // Number of times this category was used
}

interface CategoryBreakdown {
  category: string;
  count: number;
  lastUsed: string;  // ISO date string
}

interface SuggestionResponse {
  suggestion: CategorySuggestion;
  breakdown: CategoryBreakdown[];
}
```

### Local Storage Schema

```javascript
// Key: 'expense-tracker-last-payment-method'
// Value: string (e.g., "Credit Card", "Debit Card", "Cash")
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Most Frequent Category Suggestion

*For any* place name with historical expenses, the suggested category SHALL be the category with the highest frequency count for that place.

**Validates: Requirements 1.4, 2.1, 4.1**

### Property 2: Tie-Breaker Uses Most Recent

*For any* place name where multiple categories have equal frequency, the suggested category SHALL be the one most recently used.

**Validates: Requirements 4.2**

### Property 3: New Place Defaults to Null

*For any* place name with no historical expenses, the suggestion SHALL return null (and the form defaults to "Other").

**Validates: Requirements 2.2, 4.4**

### Property 4: Form Validation Enables Submit

*For any* form state where all required fields (date, place, type, amount, method) have valid values, the submit button SHALL be enabled.

**Validates: Requirements 3.3**

### Property 5: Payment Method Persistence

*For any* expense submission, the payment method used SHALL be stored and pre-selected on the next form open.

**Validates: Requirements 5.1, 5.3**

## Error Handling

| Error Scenario | Handling Strategy |
|----------------|-------------------|
| API timeout for suggestion | Use default "Other" category, don't block form |
| Invalid place name | Allow submission, no suggestion |
| Network error | Graceful degradation, form works without suggestions |
| Empty place name | No API call, no suggestion |

## Testing Strategy

### Unit Tests

**Backend:**
- `categorySuggestionService.test.js` - Test suggestion algorithm logic
- `expenseRepository.test.js` - Test new query method

**Frontend:**
- `ExpenseForm.test.jsx` - Test field order, focus behavior, suggestion display
- `categorySuggestionApi.test.js` - Test API service

### Property-Based Tests

The testing strategy uses a dual approach:
- **Unit tests** verify specific examples and edge cases
- **Property-based tests** verify universal properties across all inputs

**Property-Based Testing Library:** fast-check (already in project)

**Backend PBT:**
- `categorySuggestionService.pbt.test.js`
  - Property 1: Most frequent category is always suggested
  - Property 2: Tie-breaker uses most recent
  - Property 3: New places return null

**Frontend PBT:**
- `ExpenseForm.pbt.test.jsx`
  - Property 4: Form validation correctness
  - Property 5: Payment method persistence

Each property-based test MUST:
- Run a minimum of 100 iterations
- Include a comment referencing the correctness property: `**Feature: smart-expense-entry, Property {number}: {property_text}**`

### Integration Tests

- End-to-end flow: Enter place → Get suggestion → Submit expense
- Verify suggestion accuracy with real database queries
