# Expense Form & Credit Card UX Improvements

> **Spec format:** Single-document spec (requirements + design + tasks combined). One file per feature.

## Introduction

The expense entry form (`ExpenseForm.jsx`, 1,576 lines) and the credit-card management
flow are the most-used and most complex surfaces in the app. They are functionally
mature — collapsible sections, help tooltips, section badges, and smart defaults for
date/payment-method already exist — but several friction points remain: a buried
credit-card posted-date field, a native multi-`<select>` people picker, modal nesting
up to three levels deep for statement entry, duplicated input primitives, and a
mega-component that is hard to test and maintain.

This spec captures a prioritized set of UX improvements. Items are grouped into
**Phase 1 (high-impact, low-effort, ship first)** and **Phase 2 (structural refactors,
separate PRs)**. Each item is implementation-ready: it names the exact files, line
anchors, current behavior, target behavior, and acceptance criteria.

## Glossary

- **ExpenseForm**: `frontend/src/components/expenses/ExpenseForm.jsx` — the primary
  add/edit expense form. ~1,576 lines, 17+ `useState` hooks, 4 collapsible sections.
- **CollapsibleSection**: `frontend/src/components/shared/CollapsibleSection.jsx` —
  existing reusable expand/collapse wrapper with title, badge, and error indicator.
- **HelpTooltip**: `frontend/src/components/shared/HelpTooltip.jsx` — existing inline
  help tooltip used throughout the form.
- **Posted Date**: The credit-card statement posting date (`posted_date`), distinct from
  the transaction date. Currently lives in the collapsed **Advanced Options** section.
- **People Assignment**: Medical-expense-only section that assigns an expense to one or
  more family members, with optional per-person amount allocation.
- **PersonAllocationModal**: `frontend/src/components/tax/PersonAllocationModal.jsx` —
  modal launched from the People Assignment section to edit per-person amounts.
- **CreditCardDetailView**: `frontend/src/components/credit-cards/CreditCardDetailView.jsx`
  (754 lines) — tabbed modal (Overview / Payments / Billing Cycles) for a single card.
- **BillingCycleHistoryForm**: `frontend/src/components/credit-cards/BillingCycleHistoryForm.jsx`
  (546 lines) — modal for entering an actual statement balance for a billing cycle.
- **UnifiedBillingCycleList**: `frontend/src/components/credit-cards/UnifiedBillingCycleList.jsx`
  — list of billing cycles inside the Billing Cycles tab.
- **MoneyInput / DateInput**: Proposed shared input primitives (do not exist yet).

## Current-State Map (ground truth)

### ExpenseForm structure

| Element | File anchor | Notes |
|---------|-------------|-------|
| Core fields (Date, Place, Type, Amount, Payment Method, Notes) | always visible | Payment Method is a `<select>` with `<optgroup>` by type |
| People Assignment section | [ExpenseForm.jsx#L1046](frontend/src/components/expenses/ExpenseForm.jsx#L1046) | Medical-only; native `multiple` `<select size>` at [L1059](frontend/src/components/expenses/ExpenseForm.jsx#L1059) |
| Insurance Tracking section | [ExpenseForm.jsx#L1117](frontend/src/components/expenses/ExpenseForm.jsx#L1117) | Medical-only; eligibility checkbox + 4 dependent fields |
| Invoice Attachments section | ~L1385 | Tax-deductible-only |
| Advanced Options section | ~L1465 | Holds Posted Date (CC-only) + Future Months |
| Posted Date field | [ExpenseForm.jsx#L1465](frontend/src/components/expenses/ExpenseForm.jsx#L1465) | Empty default; clear-button; hint "Leave empty to use transaction date" |
| Future Months control | [ExpenseForm.jsx#L1494](frontend/src/components/expenses/ExpenseForm.jsx#L1494) | Checkbox that reveals a count `<select>` |

### Credit-card modal nesting (deepest path)

```
CreditCardDetailView (L1 modal)
  └─ Billing Cycles tab → UnifiedBillingCycleList
       └─ BillingCycleHistoryForm (L2 modal)
            └─ Statement PDF upload (L3)
```

### Shared component inventory

- Exists: `CollapsibleSection`, `HelpTooltip`, `ConfirmDialog`, `MonthSelector`.
- Does **not** exist: a shared `Modal` container, `MoneyInput`, or `DateInput`.
  Each modal re-implements its own overlay/click-outside logic. There are existing
  PBT guardrails for modal consistency in
  `frontend/src/components/shared/UxConsistency.modalOverlay.pbt.test.jsx`,
  `UxConsistency.modalWidth.pbt.test.jsx`, and `UxConsistency.zIndex.pbt.test.jsx` —
  any new shared `Modal` must satisfy these.

---

## Phase 1 — High-impact, low-effort (ship first)

### Requirement 1: Inline posted date for credit-card expenses

**User Story:** As a user paying by credit card, I want the posted date to appear right
where I select the card, so I don't have to expand Advanced Options to set it.

#### Acceptance Criteria

1. WHEN the selected payment method has `type === 'credit_card'`, THE ExpenseForm SHALL
   render a compact Posted Date row directly beneath the Payment Method field (in the
   main form, not Advanced Options).
2. WHEN the selected payment method is not a credit card, THE ExpenseForm SHALL NOT
   render the inline Posted Date row.
3. THE inline Posted Date row SHALL retain existing semantics: empty by default, a clear
   (✕) button when set, the hint "Leave empty to use transaction date", and the existing
   `postedDateError` validation (`postedDate` ≥ `formData.date`).
4. THE ExpenseForm SHALL NOT render a duplicate Posted Date field inside Advanced Options
   once it is inlined (move, do not copy).
5. WHEN the user switches away from a credit-card payment method, THE ExpenseForm SHALL
   clear `postedDate` and `postedDateError` (existing behavior at ~L410 must be preserved).

#### Design / Implementation Notes

- Extract the existing Posted Date JSX block ([~L1465–1490](frontend/src/components/expenses/ExpenseForm.jsx#L1465))
  into a small render and place it conditionally after the Payment Method `<select>`
  (after [L1062](frontend/src/components/expenses/ExpenseForm.jsx#L1062)).
- Reuse the existing `postedDate`, `setPostedDate`, `postedDateError`, `setPostedDateError`
  state — no new state.
- The CC-detection predicate already exists in the payment-method handling; reuse the
  same `selectedMethod?.type === 'credit_card'` check rather than re-deriving it.
- Advanced Options remains for Future Months only; if it becomes empty for non-CC
  expenses, keep the section (Future Months still lives there).

#### Test Plan

- Unit: rendering with a credit-card method shows inline posted date; non-CC hides it.
- Unit: switching CC → cash clears posted date and error.
- Unit: posted date earlier than transaction date surfaces `postedDateError`.
- Regression: existing Advanced Options / Future Months tests still pass.

---

### Requirement 2: Replace native multi-select people picker with a chip/checkbox list

**User Story:** As a user assigning a medical expense to family members, I want a
click-to-toggle list with inline amounts, so I don't have to ctrl-click a native
multi-select and risk wiping my selection.

#### Acceptance Criteria

1. THE People Assignment section SHALL present each available person as an
   individually toggleable control (checkbox or chip), replacing the native
   `multiple` `<select>` at [ExpenseForm.jsx#L1059](frontend/src/components/expenses/ExpenseForm.jsx#L1059).
2. Selecting/deselecting a person SHALL NOT clear other selections.
3. WHEN two or more people are selected, THE section SHALL allow per-person amount entry
   inline (no modal) for the common case.
4. THE inline per-person amounts SHALL enforce the same validation as
   `PersonAllocationModal`: the sum of per-person out-of-pocket amounts SHALL equal the
   expense amount, and (for insurance-eligible expenses) the sum of per-person original
   costs SHALL equal the original cost; per-person out-of-pocket SHALL NOT exceed that
   person's original-cost allocation.
5. THE component SHALL remain keyboard-accessible (each toggle reachable by Tab,
   actuated by Space/Enter) and screen-reader labeled.
6. Existing single-person and zero-person behaviors SHALL be preserved (single person
   shows "Selected: <name>" summary; none selected shows the prompt).

#### Design / Implementation Notes

- This can **eliminate `PersonAllocationModal`** for the common 2–3 person case, removing
  one modal layer. Keep the modal only if a complex/edge allocation UI is still desired;
  otherwise port its validation logic (`PersonAllocationModal.jsx` ~L70–95) into the
  inline rows and delete the modal + its trigger button ([~L1230](frontend/src/components/expenses/ExpenseForm.jsx#L1230)).
- State already exists: `selectedPeople`, `setSelectedPeople`. The chip toggles mutate
  this array; amount edits update `p.amount` (and `p.originalAmount` when insurance
  eligible).
- Preserve the `handlePeopleChange` payload shape consumed by `useFormSubmission` so the
  submit payload (`people[]`) is unchanged.

#### Test Plan

- Unit: toggling a chip adds/removes exactly one person; others unaffected.
- Unit: inline amounts that don't sum to the expense amount block submission with a clear
  error (parity with prior modal validation).
- Unit: insurance-eligible path validates original-cost allocation and the
  out-of-pocket ≤ original constraint.
- Accessibility: each toggle is focusable and operable via keyboard.
- If modal removed: delete `PersonAllocationModal.test.jsx` cases or repoint them.

---

### Requirement 3: Inline statement entry (flatten billing-cycle modal nesting)

**User Story:** As a user entering a monthly statement, I want to type the actual balance
right in the billing-cycle row, so I don't have to open a separate modal for the most
frequent credit-card task.

#### Acceptance Criteria

1. WHEN a user chooses to enter/update a statement for a billing cycle in
   `UnifiedBillingCycleList`, THE list SHALL reveal an inline expand-in-place editor for
   that row instead of opening the `BillingCycleHistoryForm` modal.
2. THE inline editor SHALL contain the two primary editable fields — Actual Statement
   Balance (required) and Minimum Payment (optional) — plus Notes (optional).
3. THE inline editor SHALL display the read-only context already shown by the modal:
   cycle start/end dates and the live-calculated balance.
4. Statement PDF upload SHALL remain available from the inline editor (it MAY remain a
   nested control, but SHALL NOT require opening the full `BillingCycleHistoryForm` modal
   first).
5. THE inline editor SHALL apply identical validation to the current modal: actual
   balance required, start ≤ end, live recalculation on open.
6. Saving SHALL produce the same activity-log events and the same success result the modal
   produces today.

#### Design / Implementation Notes

- Target depth reduction: `CreditCardDetailView → BillingCycleHistoryForm → PDF` (3) →
  `CreditCardDetailView → inline row editor` (1, with PDF as a contained sub-control).
- Reuse the existing data hooks/handlers that `BillingCycleHistoryForm` calls; the form is
  mostly read-only context + two inputs, so the body can be lifted into an expandable row
  region in `UnifiedBillingCycleList`.
- Keep `BillingCycleHistoryForm` available if any caller still needs the full modal; this
  spec only changes the entry path from `UnifiedBillingCycleList`.

#### Test Plan

- Unit: clicking "Enter Statement" expands the row editor (no modal opens).
- Unit: required-balance and start≤end validation behave identically to the modal.
- Unit: save fires the same activity-log event and returns the same success payload.
- Regression: PDF upload still works from the inline editor.

---

### Requirement 4: Configured-state summary strip

**User Story:** As a user editing an existing expense, I want a one-line summary of what's
configured, so I can see medical/people/invoice/recurring state without expanding each
section.

#### Acceptance Criteria

1. WHEN any optional section has non-default state (people assigned, insurance eligible,
   invoices attached, or future months > 0), THE ExpenseForm SHALL render a compact,
   read-only summary strip beneath the Amount field.
2. THE summary strip SHALL reuse the existing per-section badge values (no new derived
   computations) — e.g. `Medical · 2 people · 1 invoice · repeats 3mo`.
3. THE summary strip SHALL be purely informational (no interactive controls) and SHALL be
   omitted entirely when no optional state is set.

#### Design / Implementation Notes

- Badge values are already computed (`calculatePeopleBadge`, `calculateInsuranceBadge`,
  invoice/future-months badges via `useBadgeCalculations`). Compose them into a strip;
  do not recompute.

#### Test Plan

- Unit: strip hidden when all sections default.
- Unit: strip shows the correct composed badges when sections are populated.

---

### Requirement 5: "Repeat for N months" single control

**User Story:** As a user adding a recurring expense, I want one control to set the
repeat count, instead of a checkbox that then reveals a dropdown.

#### Acceptance Criteria

1. THE Future Months control SHALL be a single control (stepper or `<select>` defaulting
   to "Off") that sets `futureMonths` directly, replacing the checkbox-then-dropdown
   pattern at [ExpenseForm.jsx#L1494](frontend/src/components/expenses/ExpenseForm.jsx#L1494).
2. Selecting "Off" (or 0) SHALL set `futureMonths = 0`; selecting N SHALL set
   `futureMonths = N`.
3. THE submit behavior (creating N additional future expenses) SHALL be unchanged.

#### Design / Implementation Notes

- Removes one piece of conditional rendering and the intermediate checkbox state.
- Keep the existing `HelpTooltip` and `HELP_TEXT.futureMonths`.

#### Test Plan

- Unit: choosing N sets `futureMonths`; choosing Off resets to 0.
- Regression: existing future-month creation tests pass unchanged.

---

### Requirement 6: Clarify "Actual" vs "Calculated" balance

**User Story:** As a user, I want to understand the difference between the calculated and
actual statement balance, so the two numbers on the Overview tab aren't confusing.

#### Acceptance Criteria

1. THE Overview tab of `CreditCardDetailView` SHALL display a one-line explanation or a
   `HelpTooltip` on the "Actual"/"Calculated" badges clarifying that *Calculated* = sum of
   recorded transactions for the cycle, and *Actual* = the statement balance the user
   entered.
2. THE explanation SHALL use existing `HelpTooltip` for consistency.

#### Test Plan

- Unit: tooltip/explanation renders on the Overview tab.

---

## Phase 2 — Structural refactors (separate PRs, own test runs)

These are tracked here for completeness but SHOULD ship as independent PRs because each
touches large surfaces and warrants a full-suite run via
`scripts/run-test-summary.ps1`.

### Requirement 7: Split ExpenseForm into child components

**User Story:** As a maintainer, I want `ExpenseForm` decomposed so each section is
testable and re-renders independently.

#### Acceptance Criteria

1. THE ExpenseForm SHALL extract `<MedicalExpenseFields>` (People + Insurance),
   `<InvoiceSection>`, and `<AdvancedOptions>` (Future Months) into child components,
   each owning its slice of state via the existing hooks.
2. THE public behavior, validation, and submit payload SHALL be unchanged (pure refactor).
3. Each extracted child SHALL have its own focused unit test file.

#### Design Notes

- Sections are already delineated by `CollapsibleSection`; extraction is mechanical.
- Lifting section state into children reduces parent re-render scope (perf win).

### Requirement 8: Shared input primitives (`MoneyInput`, `DateInput`)

**User Story:** As a maintainer, I want one money input and one date input so validation
and error display are consistent.

#### Acceptance Criteria

1. A shared `MoneyInput` SHALL replace the three separate amount inputs (Amount, Original
   Cost, Generic Original Cost) with consistent min/step/validation and error display.
2. A shared `DateInput` SHALL replace the duplicated date-input + error blocks (Posted
   Date, billing-cycle dates) with a single error-display convention.
3. Both primitives SHALL live in `frontend/src/components/shared/` with tests.

### Requirement 9: Shared `Modal` container

**User Story:** As a maintainer, I want one modal container so overlay, focus-trap,
escape-to-close, and scroll-lock behave consistently.

#### Acceptance Criteria

1. A shared `Modal` component SHALL centralize overlay rendering, click-outside, Escape
   handling, focus trapping, and body scroll-lock.
2. `PersonAllocationModal` (if retained), `CreditCardDetailView`, `InvoiceUpload`, and the
   credit-card forms SHALL adopt it.
3. THE shared `Modal` SHALL satisfy the existing UX-consistency PBT guardrails:
   `UxConsistency.modalOverlay.pbt.test.jsx`, `UxConsistency.modalWidth.pbt.test.jsx`,
   and `UxConsistency.zIndex.pbt.test.jsx`.

---

## Out of Scope

- Backend/API changes — all items are frontend-only; no schema, route, controller, or
  service changes are required.
- Changing the expense submit payload shape (Requirements 1–6 are behavior-preserving on
  the wire).
- Redesigning the Insurance claim workflow beyond the inline-vs-section disclosure noted
  in the current-state map.

## Implementation Order (recommended)

1. **PR A (Phase 1 quick wins):** Requirements 1, 4, 5, 6 — low-risk, no modal removal.
2. **PR B:** Requirement 2 (chip people picker; removes `PersonAllocationModal` layer).
3. **PR C:** Requirement 3 (inline statement entry; removes a modal layer).
4. **PR D+:** Requirements 7, 8, 9 (structural refactors), each as its own PR with a full
   `scripts/run-test-summary.ps1` run.

## Validation

- Phase 1 PRs: targeted Vitest runs for the touched components
  (`ExpenseForm`, `CreditCardDetailView`, `UnifiedBillingCycleList`).
- Phase 2 PRs: full-suite validation via `scripts/run-test-summary.ps1`.
- All new shared components require unit tests; `Modal` must additionally pass the
  existing UX-consistency PBT guardrails listed in Requirement 9.

---

## Progress

| Requirement | Status | Branch / PR | Notes |
|-------------|--------|-------------|-------|
| Req 1: Inline posted date | ✅ Done | `feature/expense-form-ux-phase1` | Moved posted date inline after Payment Method; removed from Advanced Options |
| Req 4: Configured-state strip | ✅ Done | `feature/expense-form-ux-phase1` | Shows people/insurance/invoice/repeat/posted badges below Amount |
| Req 5: Single repeat control | ✅ Done | `feature/expense-form-ux-phase1` | Replaced checkbox+dropdown with single `<select>` defaulting to "Off" |
| Req 6: Actual/Calculated tooltips | ✅ Done | `feature/expense-form-ux-phase1` | Added HelpTooltip to both badges in CreditCardDetailView |
| Req 2: Chip people picker | Not started | — | Phase 2 |
| Req 3: Inline statement entry | Not started | — | Phase 2 |
| Req 7: Split ExpenseForm | Not started | — | Phase 2 |
| Req 8: Shared input primitives | Not started | — | Phase 2 |
| Req 9: Shared Modal | Not started | — | Phase 2 |
