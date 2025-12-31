# Design Document

## Overview

This design addresses two critical usability issues in the expense tracker interface:
1. **Summary Panel Scrolling**: Users cannot access the bottom of the sticky summary panel when the expense list is very long
2. **Add Expense Accessibility**: Users must scroll to the top to add expenses when viewing a long expense list

The solution involves modifying the CSS layout to create an independently scrollable summary panel and adding a floating action button for expense creation.

## Architecture

### Current Layout Structure
```
App
├── Header
├── Main Content
│   ├── Content Layout (CSS Grid)
│   │   ├── Content Left (Expense List)
│   │   └── Content Right (Summary Panel - sticky positioned)
└── Footer
```

### Proposed Layout Structure
```
App
├── Header
├── Main Content
│   ├── Content Layout (CSS Grid)
│   │   ├── Content Left (Expense List + Floating Button)
│   │   └── Content Right (Scrollable Summary Panel Container)
│   │       └── Summary Panel (independently scrollable)
└── Footer
```

## Components and Interfaces

### 1. Summary Panel Container Enhancement

**File**: `frontend/src/App.css`

**Current Implementation**:
```css
.content-right {
  position: sticky;
  top: 15px;
}
```

**New Implementation**:
```css
.content-right {
  position: sticky;
  top: 15px;
  height: calc(100vh - 30px); /* Account for top offset */
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 #f1f5f9;
}

.content-right::-webkit-scrollbar {
  width: 8px;
}

.content-right::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 4px;
}

.content-right::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

.content-right::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
```

### 2. Floating Add Expense Button Component

**New Component**: `frontend/src/components/FloatingAddButton.jsx`

```jsx
import { useState, useEffect } from 'react';
import './FloatingAddButton.css';

const FloatingAddButton = ({ onAddExpense, expenseCount = 0 }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Show floating button when expense list has more than 10 items
    setIsVisible(expenseCount > 10);
  }, [expenseCount]);

  if (!isVisible) return null;

  return (
    <button 
      className="floating-add-button"
      onClick={onAddExpense}
      aria-label="Add new expense"
      title="Add new expense"
    >
      <span className="fab-icon">+</span>
      <span className="fab-text">Add Expense</span>
    </button>
  );
};

export default FloatingAddButton;
```

**New Stylesheet**: `frontend/src/components/FloatingAddButton.css`

```css
.floating-add-button {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  color: white;
  border: none;
  border-radius: 56px;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3);
  transition: all 0.3s ease;
  z-index: 100;
  min-height: 56px;
}

.floating-add-button:hover {
  background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
  box-shadow: 0 6px 16px rgba(14, 165, 233, 0.4);
  transform: translateY(-2px);
}

.floating-add-button:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(14, 165, 233, 0.3);
}

.fab-icon {
  font-size: 20px;
  font-weight: 300;
  line-height: 1;
}

.fab-text {
  white-space: nowrap;
}

/* Mobile responsive */
@media (max-width: 768px) {
  .floating-add-button {
    bottom: 16px;
    right: 16px;
    padding: 12px 20px;
    font-size: 13px;
    border-radius: 48px;
    min-height: 48px;
  }
  
  .fab-icon {
    font-size: 18px;
  }
}

/* Compact version for smaller screens */
@media (max-width: 480px) {
  .floating-add-button {
    padding: 12px;
    border-radius: 50%;
    width: 48px;
    height: 48px;
    min-height: 48px;
  }
  
  .fab-text {
    display: none;
  }
  
  .fab-icon {
    font-size: 20px;
  }
}

/* Animation for appearance */
@keyframes fabSlideIn {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.8);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.floating-add-button {
  animation: fabSlideIn 0.3s ease-out;
}
```

### 3. ExpenseList Integration

**File**: `frontend/src/components/ExpenseList.jsx`

**Integration Points**:
- Import and render FloatingAddButton component
- Pass expense count and onAddExpense handler
- Position floating button relative to expense list container

### 4. App Component Integration

**File**: `frontend/src/App.jsx`

**Changes Required**:
- Import FloatingAddButton component
- Pass expense count to ExpenseList
- Ensure floating button doesn't conflict with modals

## Data Models

### FloatingAddButton Props Interface

```typescript
interface FloatingAddButtonProps {
  onAddExpense: () => void;
  expenseCount: number;
}
```

### CSS Custom Properties

```css
:root {
  --fab-primary-color: #0ea5e9;
  --fab-primary-hover: #0284c7;
  --fab-shadow-color: rgba(14, 165, 233, 0.3);
  --fab-shadow-hover: rgba(14, 165, 233, 0.4);
  --fab-z-index: 100;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, several properties can be consolidated to avoid redundancy:
- Properties 1.1, 1.2, and 1.5 all relate to independent scrolling behavior and can be combined
- Properties 2.1 and 2.2 test responsive behavior and can be combined with 2.3
- Properties 3.1 and 3.2 both test visual feedback and can be combined
- Properties 4.2 and 4.4 both test floating button positioning and can be combined

### Summary Panel Independent Scrolling Properties

**Property 1: Summary panel independent scrolling**
*For any* expense list length and summary panel content, the summary panel should scroll independently without affecting the expense list scroll position, and all summary content should be accessible regardless of expense list scroll state
**Validates: Requirements 1.1, 1.2, 1.5**

**Property 2: Summary panel scrollbar visibility**
*For any* summary panel content that exceeds the viewport height, the summary panel should display its own scrollbar and maintain sticky positioning behavior
**Validates: Requirements 1.3, 1.4**

### Responsive Layout Properties

**Property 3: Responsive layout adaptation**
*For any* viewport size change between mobile and desktop breakpoints, the summary panel should adapt its scrolling behavior appropriately while maintaining existing grid layout and breakpoints
**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

### Visual Feedback Properties

**Property 4: Summary panel visual feedback**
*For any* summary panel with scrollable content, hovering over the panel should provide visual feedback and scrollbar indicators should be visible when content overflows
**Validates: Requirements 3.1, 3.2**

**Property 5: Keyboard accessibility**
*For any* summary panel with scrollable content, keyboard navigation with arrow keys and page up/down should scroll the panel content appropriately
**Validates: Requirements 3.3**

### Floating Add Button Properties

**Property 6: Floating button visibility threshold**
*For any* expense list with more than 10 expenses, the floating add expense button should be visible and remain visible during scrolling
**Validates: Requirements 4.1, 4.2**

**Property 7: Floating button functionality**
*For any* floating add button click event, the expense form modal should open correctly
**Validates: Requirements 4.3**

**Property 8: Floating button positioning**
*For any* viewport size, the floating button should be positioned to not obstruct important content and remain accessible with appropriate sizing for the device type
**Validates: Requirements 4.4, 4.5**

### Performance Properties

**Property 9: Smooth scrolling behavior**
*For any* scroll event within the summary panel, smooth scrolling animation should be applied and scroll events should not bubble to the main page
**Validates: Requirements 5.1, 5.4**

## Error Handling

### CSS Fallbacks
- **Scrollbar Styling**: Provide fallbacks for browsers that don't support custom scrollbar styling
- **Sticky Positioning**: Graceful degradation for older browsers without sticky support
- **CSS Grid**: Fallback to flexbox for browsers with limited grid support

### JavaScript Error Handling
- **FloatingAddButton**: Handle cases where expense count is undefined or null
- **Event Listeners**: Prevent errors when DOM elements are not found
- **Responsive Breakpoints**: Handle edge cases during viewport transitions

### Accessibility Fallbacks
- **Reduced Motion**: Respect user preferences for reduced motion
- **High Contrast**: Ensure floating button remains visible in high contrast mode
- **Screen Readers**: Provide appropriate ARIA labels and roles

## Testing Strategy

### Dual Testing Approach
The testing strategy combines unit tests for specific functionality and property-based tests for comprehensive coverage:

**Unit Tests**:
- FloatingAddButton component rendering and visibility logic
- CSS class applications for different viewport sizes
- Event handler functionality (click, scroll, hover)
- Modal opening behavior
- Responsive breakpoint transitions

**Property-Based Tests**:
- Summary panel scrolling behavior across various content sizes
- Floating button visibility with different expense counts
- Responsive layout behavior across viewport size ranges
- Scroll event isolation and independence
- Visual feedback consistency across different states

### Property Test Configuration
- **Minimum 100 iterations** per property test due to randomization
- **Test tags**: Each property test references its design document property
- **Tag format**: **Feature: sticky-summary-scrolling, Property {number}: {property_text}**

### Testing Framework
- **Frontend**: Vitest with React Testing Library for component tests
- **Property Testing**: fast-check library for property-based testing
- **CSS Testing**: Computed style verification and layout testing
- **Accessibility Testing**: axe-core for accessibility compliance

### Integration Testing
- **Cross-browser**: Test sticky positioning and scrolling in different browsers
- **Device Testing**: Verify touch interactions on mobile devices
- **Performance**: Monitor scroll performance and animation smoothness
- **User Flow**: Test complete user journeys with long expense lists

<function_calls>
<invoke name="prework">
<parameter name="featureName">sticky-summary-scrolling