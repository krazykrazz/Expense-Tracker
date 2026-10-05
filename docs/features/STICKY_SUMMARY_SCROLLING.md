# Sticky Summary Scrolling

## Overview

On the main page the expense list (`.content-left`) and the summary column (`.content-right`: filter `SearchBar` + `SummaryPanel`) sit side by side. The summary column stays in view and scrolls independently, and a floating "Add Expense" button stays reachable while scrolling long lists. Frontend-only (CSS in `frontend/src/App.css` and `frontend/src/styles/mobile.css`).

## Independent Summary Column

`.content-layout` is a grid (`1fr 400px`). `.content-right`:

```css
.content-right {
  position: sticky;
  top: var(--spacing-4);
  max-height: calc(100vh - var(--spacing-4) * 2);
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-behavior: smooth;
}
```

- Thin custom scrollbar (`scrollbar-width: thin` / 8px WebKit scrollbar) that darkens on hover.
- `App.jsx` gives the column `tabIndex="0"`, `role="region"` and `aria-label="Monthly summary panel - scrollable"`, so it can be focused and scrolled with the keyboard; `:focus-within` draws an outline.
- `prefers-reduced-motion` disables smooth scrolling and transitions.

## Floating Add Button

`FloatingAddButton` (`frontend/src/components/shared/FloatingAddButton.jsx`):

- Rendered by `App.jsx` with `expenseCount={currentMonthExpenseCount}`; shown only when the count is above 10. The count comes from `ExpenseContext` (`GET /api/expenses/count` for the current calendar month), not from the list being viewed.
- Fixed bottom-right; clicking opens the same expense form modal as the list's "+ Add Expense" button.
- `aria-label`/`title` "Add new expense"; slide-in animation (disabled under reduced motion).

## Responsive Behaviour

| Width | Layout |
|-------|--------|
| > 1024px | Two columns (`1fr 400px`); sticky, independently scrolling summary |
| ≤ 1024px | Two columns (`1fr 350px`) |
| ≤ 768px | Single column; summary loses sticky/scroll styling. A fixed bottom tab bar (Expenses / Summary) shows one panel at a time via `data-mobile-tab` on `.content-layout` |
| ≤ 480px | Floating button becomes a 48px round icon-only button |

## Files

- `frontend/src/App.jsx`, `frontend/src/App.css`
- `frontend/src/styles/mobile.css`
- `frontend/src/components/shared/FloatingAddButton.jsx`, `FloatingAddButton.css`

---

**Last Updated**: 2026-10-04

