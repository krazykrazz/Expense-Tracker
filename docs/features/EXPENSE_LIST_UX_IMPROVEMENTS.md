# Expense List

## Overview

`ExpenseList` (`frontend/src/components/expenses/ExpenseList.jsx`) renders the expenses passed in by `App.jsx` — `filteredExpenses` from `ExpenseContext`, i.e. the selected month or the global-view result. On that set it applies local filters, quick views, date grouping and client-side pagination. All of this is frontend-only.

Local filters only narrow the already-loaded list and never trigger global view. Global filters (search, category, payment method, year, date range) are covered in [Global Expense Filtering](./GLOBAL_EXPENSE_FILTERING.md).

## Local Filters

Four dropdowns in the list header:

| Filter | Options | Notes |
|--------|---------|-------|
| Type | All Types + each category | |
| Method (smart) | All Methods, grouped by payment type | See below |
| Invoice | All Invoices, With Invoice, Without Invoice | Limits the list to `Tax - Medical` / `Tax - Donation` |
| Insurance | All Insurance, Insurance Eligible, Not Eligible, Not Claimed, In Progress, Paid, Denied | Limits the list to `Tax - Medical`; seeded from `FilterContext.filterInsurance` via `initialInsuranceFilter`; clearing it calls `onInsuranceFilterChange('')` |

A ✕ button clears all four. Budget alerts dispatch a `navigateToExpenseList` window event with `detail.categoryFilter`, which sets the local Type filter (staying in monthly view).

### Smart Method Filter

`generateGroupedMethodOptions(paymentMethods)` builds one dropdown from all payment methods, including inactive ones (suffixed "(inactive)"):

- Types are ordered Cash, Debit, Cheque, Credit Card, then Other (unrecognised type).
- A type with several methods, or a single method whose name differs from the type label, gets a selectable type header (`type:<type>`) followed by indented methods (`method:<display_name>`).
- A type with one method named the same as the type shows just that method.

`parseSmartMethodFilter` decodes the value: type mode matches the method's `type`; method mode matches `expense.method`.

### Filter Count Badge and Chips

- A badge beside the dropdowns shows the number of active local filters (hidden at 0).
- `FilterChip` renders one "Label: Value" pill per active filter (Type, Method, Invoice, Insurance); its × clears only that filter. Type-mode method chips read e.g. "Credit Card (all)".

## Quick Views

A tab bar (shown when the list has expenses) narrows the locally filtered set further:

| Tab | Matches |
|-----|---------|
| All | Everything |
| Needs review | Tax-deductible expenses without an invoice, or medical expenses with no person assigned or an eligible claim still `not_claimed` / `in_progress` (`needsReview`) |
| Tax-deductible | `Tax - Medical`, `Tax - Donation` |
| Recurring | Generated from a recurring template (`is_generated`) |

Tabs other than All show a count when non-zero (Needs review is highlighted).

## Summary Line

Under the tabs: `N expenses · $X total`, plus:
- `D days · $Y/day` when a global date range is active (`dateRange` prop; an empty end counts through today).
- A "N need(s) review" button that jumps to the Needs review tab.

When filters or a quick view hide everything, a contextual message replaces the table (e.g. "Nothing needs review — all caught up.").

## Date Grouping

Rows are grouped by date in API order (ascending). Each group is a `<tbody>` with a header row showing the formatted date and that day's total. Grouping runs on the current page, so a day split across pages shows a partial total on each.

## Pagination

- Page sizes: 25, 50 (default), 100, All; the choice is persisted in `localStorage` (`expenseListPageSize`).
- Controls (shown whenever the filtered list is non-empty): "Showing X-Y of Z expenses", ← Previous / Next →, page buttons (first, previous, current, next, last, with ellipses) and a "Per page:" selector.
- Resets to page 1 when a local filter, the quick view, or the page size changes. If the list shrinks below the current page (e.g. after a reload or delete), the page is clamped to the last page.
- Changing page smooth-scrolls to the top of the list.

## Loading Behaviour

Only the very first load shows the "Loading expenses..." message (`ExpenseContext.hasLoaded`). Later reloads keep the current list mounted, dimmed and marked `aria-busy`, until the new data arrives. The empty-state message is suppressed until the first load completes (`awaitingFirstLoad`).

## Files

- `frontend/src/components/expenses/ExpenseList.jsx`, `ExpenseList.css`
- `frontend/src/components/expenses/FilterChip.jsx`, `FilterChip.css`

## Related Documentation

- [Global Expense Filtering](./GLOBAL_EXPENSE_FILTERING.md)
- [Configurable Payment Methods](./CONFIGURABLE_PAYMENT_METHODS.md)

---

**Last Updated**: 2026-10-04

