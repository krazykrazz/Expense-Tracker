# Global Expense Filtering

## Overview

Global filters search expenses across all time instead of only the selected month. State lives in `FilterContext` (`frontend/src/contexts/FilterContext.jsx`); fetching and client-side filtering live in `ExpenseContext`; the controls are `SearchBar` (`frontend/src/components/expenses/SearchBar.jsx`), rendered twice by `App.jsx`.

## Filter Controls

- **Text search** (left column, above the expense list): matches place or notes (case-insensitive substring). Debounced 300 ms.
- **Filter column** (right column, above the summary panel):
  - **Category**: All Categories + each category (validated against `CATEGORIES`)
  - **Payment Method**: All Payment Methods + each method name
  - **Year**: All Years + every year from current year + 2 down to 2000
  - **Date range**: From / To date inputs (inclusive). Leave To empty for "through today". Quick presets **7 days**, **30 days**, **This month** and **YTD** set the start date and leave the end open (through today); the matching preset is highlighted while active.

These are separate from the expense list's own local dropdowns (Type, Method, Invoice, Insurance), which only narrow the loaded list — see [Expense List](./EXPENSE_LIST_UX_IMPROVEMENTS.md).

## How It Works

### Monthly View (Default)

Shows the month chosen in the month selector (`GET /api/expenses?year=Y&month=M`). The selector has previous/next month buttons and a jump-to-current-month button.

### Global View

`isGlobalView` is true when any of these is set: search text, category, payment method, year, insurance status, start date, or end date. Insurance status is set only by the `filterByInsuranceStatus` window event (insurance notification click-through).

In global view:
- A "🔍 Global View" banner lists the active triggers ("Triggered by: Search, Category, Date Range (…)") with a **📅 Return to Monthly View** button.
- The month selector is dimmed and non-interactive.
- Expenses are fetched with `GET /api/expenses` plus `year`, `startDate`, `endDate` when set. With no year or dates, all expenses are fetched.
- Search, category and payment method are then applied client-side (AND logic).

### Date Range

- Bounds are inclusive `YYYY-MM-DD`. An empty end date is sent as today, unless the start date is in the future.
- Combined with Year as an intersection.
- A range is only applied once both dates are complete (year ≥ 2000) and start ≤ end; partial input is kept as a draft. The backend also rejects invalid dates or start > end with 400.
- The expense list summary line shows the range length and average per day.
- Clicking a category in the Analytics Hub **Spending** breakdown clears existing filters, then sets that category plus the selected period as the date range (see [Analytics Hub](./ANALYTICS_HUB.md)).

## Clearing Filters

- **Clear Filters** (labelled **🗑️ Clear All** in global view) appears in the filter column when a search, category, method, year or date filter is active.
- **Clear Search** appears next to the search box when text is entered.
- Both buttons, and **Return to Monthly View**, clear all global filters (including insurance status) and return to monthly view.

## Accessibility

- Every control has a label or `aria-label`; the date inputs sit in a group labelled "Date range".
- Filter changes are announced via a polite live region.
- **Clear Search** returns focus to the search input.

## Related Features

- [Expense List](./EXPENSE_LIST_UX_IMPROVEMENTS.md) — local filters, quick views, pagination
- [Place Name Standardization](./PLACE_NAME_STANDARDIZATION.md) — consistent place names improve search

---

**Last Updated**: 2026-10-04

