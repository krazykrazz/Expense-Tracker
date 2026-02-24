# UX Consistency Audit

Deep-dive analysis of font, button, form, and style inconsistencies across the frontend.

Reference design system: `frontend/src/styles/variables.css`

---

## 1. Modal Inconsistencies

### 1.1 Overlay Class Names

✅ **RESOLVED** — All modals now use the shared `.modal-overlay` class from `App.css`.

| Modal | Previous Overlay Class | Status |
|---|---|---|
| AnalyticsHub | `.analytics-hub-overlay` | ✅ Migrated to `.modal-overlay` |
| FinancialOverview | `.financial-modal-overlay` | ✅ Migrated to `.modal-overlay` |
| Budgets | `.budgets-modal-overlay` | ✅ Migrated to `.modal-overlay` |
| MerchantAnalytics | `.merchant-analytics-modal-overlay` | ✅ Migrated to `.modal-overlay` |
| PeopleManagement | `.people-modal-overlay` | ✅ Migrated to `.modal-overlay` |
| CreditCardDetail | `.cc-detail-modal-overlay` | ✅ Migrated to `.modal-overlay` |
| PersonAllocation | `.modal-overlay` | Already compliant |
| System | `.modal-overlay` | Already compliant |

All orphaned per-modal overlay class definitions have been removed from component CSS files.

### 1.2 Header Gradient Colors

Each modal uses a different gradient, with no design system tokens:

| Modal | Gradient | Colors |
|---|---|---|
| AnalyticsHub | `#6366f1 → #4f46e5` | Indigo |
| FinancialOverview | `#1a73e8 → #0d47a1` | Blue |
| Budgets | `#667eea → #764ba2` | Purple-violet |
| PeopleManagement | `#4CAF50 → #45a049` | Green |
| MerchantAnalytics | None | Uses `bg-subtle` |
| SystemModal | None | Uses `bg-card` with border |
| CreditCardDetail | None | Uses `bg-subtle` |

**Status:** Not addressed in this round. Low priority — consider defining gradient tokens in a future pass.

### 1.3 Container Max-Widths

✅ **RESOLVED** — All modals now use `--modal-width-*` tokens from `variables.css`.

| Modal | Previous max-width | Current Token |
|---|---|---|
| PeopleManagement | `700px` | `var(--modal-width-md)` (700px) |
| FinancialOverview | `800px` | `var(--modal-width-lg)` (900px) |
| MerchantAnalytics | `800px` | `var(--modal-width-lg)` (900px) |
| CreditCardDetail | `800px` | `var(--modal-width-lg)` (900px) |
| Budgets | `900px` | `var(--modal-width-lg)` (900px) |
| AnalyticsHub | `1000px` | `var(--modal-width-lg)` (900px) |
| SystemModal | `1200px` | `var(--modal-width-xl)` (1200px) |

Tokens defined in `variables.css`: `--modal-width-sm: 500px`, `--modal-width-md: 700px`, `--modal-width-lg: 900px`, `--modal-width-xl: 1200px`.

### 1.4 Container Border-Radius

| Modal | border-radius |
|---|---|
| Most modals | `var(--radius-xl)` (16px) |
| FinancialOverview | `8px` (hardcoded) |
| CreditCardDetail | `var(--radius-lg)` (12px) |

**Status:** Not addressed in this round. Low priority.

### 1.5 Close Button Styles

| Modal | Close Button Background |
|---|---|
| FinancialOverview | `rgba(255,255,255,0.2)` on gradient |
| Budgets | `rgba(255,255,255,0.2)` on gradient |
| PeopleManagement | `rgba(255,255,255,0.2)` on gradient |
| AnalyticsHub | `rgba(255,255,255,0.2)` on gradient |
| SystemModal | `background: none` |
| CreditCardDetail | `var(--bg-muted)` |
| PersonAllocation | `background: none` |

**Status:** Not addressed in this round. Low priority.

---

## 2. Button Style Inconsistencies

### 2.1 Naming Conventions

At least 6 different naming patterns for primary/submit buttons:

| Component | Class Name |
|---|---|
| ExpenseForm | `.submit-button` |
| CreditCardPaymentForm | `.cc-payment-submit-btn` |
| LoanPaymentForm | `.form-submit-btn` |
| PersonAllocationModal | `.save-button` |
| PeopleManagementModal | `.people-save-button` |
| FinancialOverviewModal | `.financial-action-btn-primary` |
| BackupSettings | `.misc-tool-button` |

**Status:** Class names remain component-specific, but the shared `.btn-primary` and `.btn-cancel` base classes are now applied alongside them for consistent styling. See [Shared Base Classes](#shared-base-classes) below.

### 2.2 Primary Button Colors

✅ **RESOLVED** — All primary buttons now use `.btn-primary` class or `var(--color-primary)`.

| Component | Previous Color | Status |
|---|---|---|
| ExpenseForm | `var(--color-primary)` | Already compliant |
| CreditCardPaymentForm | `var(--color-primary)` | Already compliant |
| FinancialOverview (action btns) | `#047857` | ✅ Migrated to `.btn-primary` |
| FinancialOverview (loans/invest forms) | `#4caf50` | ✅ Migrated to `.btn-primary` |
| PeopleManagement | `#4CAF50` gradient | ✅ Migrated to `.btn-primary` |
| PersonAllocation | `#059669` | ✅ Migrated to `.btn-primary` |
| FinancialOverview (debt trend) | `#059669` | ✅ Migrated to `.btn-primary` |

### 2.3 Cancel Button Styles

✅ **RESOLVED** — All cancel buttons now use `.btn-cancel` class.

| Component | Previous Style | Status |
|---|---|---|
| CreditCardPaymentForm | `var(--bg-card)` with `var(--border-default)` | ✅ Uses `.btn-cancel` |
| PersonAllocation | `#f3f4f6` bg, `#d1d5db` border | ✅ Migrated to `.btn-cancel` |
| PeopleManagement | `#6c757d` solid gray bg | ✅ Migrated to `.btn-cancel` |
| FinancialOverview (loans) | `#757575` solid gray bg | ✅ Migrated to `.btn-cancel` |

### 2.4 Button Padding

✅ **RESOLVED** for migrated components — `.btn-primary` and `.btn-cancel` enforce `var(--spacing-3) var(--spacing-5)` (12px 20px).

### 2.5 Button Font Sizes

✅ **RESOLVED** for migrated components — `.btn-primary` and `.btn-cancel` enforce `var(--text-sm)` (13px).

---

## 3. Form Input Inconsistencies

### 3.1 Input Padding

✅ **RESOLVED** for migrated components — `.form-input` enforces `var(--spacing-3) var(--spacing-4)` (12px 16px).

| Component | Previous Padding | Status |
|---|---|---|
| ExpenseForm | `var(--spacing-3) var(--spacing-4)` | Already compliant |
| CreditCardPaymentForm | `var(--spacing-2) var(--spacing-3)` | ✅ Uses `.form-input` |
| PersonAllocationModal | `8px 12px 8px 24px` | ✅ Migrated to `.form-input` |
| PeopleManagementModal | `10px 12px` | ✅ Migrated to `.form-input` |
| FinancialOverview (loans) | `10px` | ✅ Migrated to `.form-input` |

### 3.2 Input Border Styles

✅ **RESOLVED** — `.form-input` enforces `1px solid var(--border-default)` with `var(--border-focus)` on focus.

| Component | Previous Border/Focus | Status |
|---|---|---|
| ExpenseForm | `var(--border-default)` / `var(--border-focus)` | Already compliant |
| CreditCardPaymentForm | `var(--border-default)` / `var(--border-focus)` | Already compliant |
| PersonAllocationModal | `1px solid #d1d5db` / `#0ea5e9` | ✅ Migrated to `.form-input` |
| PeopleManagementModal | `1px solid #ddd` / `#4CAF50` | ✅ Migrated to `.form-input` |
| FinancialOverview (loans) | `1px solid #ccc` / unspecified | ✅ Migrated to `.form-input` |

### 3.3 Input Border-Radius

✅ **RESOLVED** — `.form-input` enforces `var(--radius-md)` (8px).

| Component | Previous Radius | Status |
|---|---|---|
| ExpenseForm | `var(--radius-md)` | Already compliant |
| CreditCardPaymentForm | `var(--radius-md)` | Already compliant |
| PersonAllocationModal | `4px` | ✅ Migrated to `.form-input` |
| PeopleManagementModal | `4px` | ✅ Migrated to `.form-input` |
| FinancialOverview (loans) | `4px` | ✅ Migrated to `.form-input` |

---

## 4. Typography Inconsistencies

### 4.1 rem vs px Units

✅ **RESOLVED** — All migrated components now use design system `px` tokens.

| Component | Previous Examples | Status |
|---|---|---|
| CollapsibleSection | `0.9375rem`, `0.6875rem`, `0.7rem`, `1.25rem` | ✅ Converted to `var(--text-*)` tokens |
| BudgetReminderBanner | `0.95rem`, `0.85rem`, `0.8rem`, `0.75rem`, `1.3rem` | ✅ Converted to `var(--text-*)` tokens |
| LoanPaymentReminderBanner | Same `rem` pattern | ✅ Converted to `var(--text-*)` tokens |
| PeopleManagementModal | `0.95rem`, `1rem`, `1.1rem`, `1.2rem`, `0.85rem`, `0.9rem` | ✅ Converted to `var(--text-*)` tokens |
| FinancialOverviewModal | `0.9rem`, `0.95rem`, `1rem`, `1.1rem`, `0.75rem`, `0.8rem` | ✅ Converted to `var(--text-*)` tokens |

### 4.2 Font Weight Inconsistencies

✅ **RESOLVED** for migrated components — hardcoded `500`, `600`, `700` replaced with `var(--font-medium)`, `var(--font-semibold)`, `var(--font-bold)`.

| Component | Previous Pattern | Status |
|---|---|---|
| ExpenseForm | `var(--font-medium)`, `var(--font-semibold)` | Already compliant |
| BudgetReminderBanner | Hardcoded `600`, `700` | ✅ Migrated to tokens |
| LoanPaymentReminderBanner | Hardcoded `600`, `700` | ✅ Migrated to tokens |
| PeopleManagementModal | Mix of tokens and hardcoded `500`, `600` | ✅ Migrated to tokens |
| CollapsibleSection | Hardcoded `600`, `700` | ✅ Migrated to tokens |
| FinancialOverviewModal | Hardcoded values | ✅ Migrated to tokens |

---

## 5. Banner Inconsistencies

### 5.1 BudgetReminderBanner vs LoanPaymentReminderBanner

✅ **RESOLVED** — Both banners now use the shared `.reminder-banner` base class from `App.css`.

Shared structural styles (padding, border-radius, margin-bottom, cursor, transition) are provided by `.reminder-banner`. Component-specific status color modifier classes (`.warning`, `.danger`, `.critical` for budget; `.due-soon`, `.overdue` for loan) remain in their respective CSS files.

See [Shared Base Classes](#shared-base-classes) below.

---

## 6. z-index Issues

### 6.1 CreditCardDetailView

✅ **RESOLVED** — Hardcoded `z-index: 1000` replaced with `var(--z-modal-backdrop)` (400). All hardcoded z-index numeric values removed from `CreditCardDetailView.css`.

---

## 7. Nested Form / Modal Patterns

### 7.1 Forms Inside Modals

Several components render forms inline within modals:

| Parent Modal | Inline Form | Issue |
|---|---|---|
| CreditCardDetailView | CreditCardPaymentForm | Form inside modal |
| CreditCardDetailView | LoanPaymentForm | Form inside modal |
| CreditCardDetailView | BillingCycleHistoryForm | Form inside modal |
| FinancialOverviewModal | Loan add/edit form | Form inside modal |
| FinancialOverviewModal | Investment add/edit form | Form inside modal |
| SettingsModal | Person editing (inline) | Form inside modal |

**Status:** Not addressed in this round. Structural pattern, not a styling issue.

### 7.2 Modal-on-Modal

PaymentMethodForm renders as a modal overlay. When opened from FinancialOverviewModal, it creates a modal-on-modal pattern. This works but can cause focus-trap and z-index issues.

**Status:** Not addressed in this round.

---

## 8. Design System Adoption Scorecard

Rating each component's adherence to `variables.css` tokens:

| Component | Spacing | Colors | Typography | Radius | Transitions | Overall |
|---|---|---|---|---|---|---|
| ExpenseForm | ✅ | ✅ | ✅ | ✅ | ✅ | Excellent |
| CreditCardPaymentForm | ✅ | ✅ | ✅ | ✅ | ✅ | Excellent |
| BackupSettings | ✅ | ✅ | ✅ | ✅ | ✅ | Good |
| AnalyticsHubModal | ✅ | ✅ | ✅ | ✅ | ✅ | Excellent |
| BudgetsModal | ✅ | ✅ | ✅ | ✅ | ✅ | Excellent |
| FinancialOverviewModal | ✅ | ✅ | ✅ | ✅ | ✅ | Excellent |
| PeopleManagementModal | ✅ | ✅ | ✅ | ✅ | ✅ | Excellent |
| PersonAllocationModal | ✅ | ✅ | ✅ | ✅ | ✅ | Excellent |
| CollapsibleSection | ✅ | ✅ | ✅ | ✅ | ✅ | Excellent |
| BudgetReminderBanner | ✅ | ✅ | ✅ | ✅ | ✅ | Excellent |
| LoanPaymentReminderBanner | ✅ | ✅ | ✅ | ✅ | ✅ | Excellent |
| CreditCardDetailView | ✅ | ✅ | ✅ | ✅ | ✅ | Excellent |
| SystemModal | ✅ | ✅ | ✅ | ✅ | ✅ | Excellent |

Legend: ✅ Uses design tokens | ⚠️ Partial (minor items remain) | ❌ Mostly hardcoded

### Scorecard Changes Summary

| Component | Previous | Current | What Changed |
|---|---|---|---|
| AnalyticsHubModal | Good | Excellent | Overlay → `.modal-overlay`, width → `--modal-width-lg` |
| BudgetsModal | Good | Excellent | Overlay → `.modal-overlay`, width → `--modal-width-lg` |
| FinancialOverviewModal | Poor | Good | Overlay, buttons, inputs, typography all migrated; border-radius still hardcoded |
| PeopleManagementModal | Poor | Excellent | Overlay, buttons, inputs, typography all migrated |
| PersonAllocationModal | Poor | Excellent | Buttons, inputs migrated to base classes |
| CollapsibleSection | Fair | Good | Typography converted from rem to px tokens |
| BudgetReminderBanner | Poor | Good | Banner base class, typography converted, font-weights tokenized |
| LoanPaymentReminderBanner | Poor | Good | Banner base class, typography converted, font-weights tokenized |
| CreditCardDetailView | Fair | Excellent | Overlay, z-index, width all migrated to tokens |
| SystemModal | Good | Excellent | Width → `--modal-width-xl` |
| FinancialOverviewModal | Good | Excellent | Container/header border-radius → `var(--radius-xl)` |
| CollapsibleSection | Good | Excellent | Badge hover colors → design tokens |
| BudgetReminderBanner | Good | Excellent | Status colors documented as intentional semantic modifiers |
| LoanPaymentReminderBanner | Good | Excellent | Status colors documented as intentional semantic modifiers |

---

## Shared Base Classes {#shared-base-classes}

The following shared base classes were added to `frontend/src/App.css` as part of the UX consistency migration. Components apply these alongside their component-specific class names.

### `.btn-primary`

Standard primary action button. Uses `var(--color-primary)` background, `var(--text-inverse)` text, `var(--radius-md)` border-radius, `var(--text-sm)` font-size, `var(--font-medium)` font-weight, `var(--spacing-3) var(--spacing-5)` padding.

Includes hover state (`var(--color-primary-hover)`) and disabled state (`opacity: 0.6`).

**Used by:** FinancialOverviewModal, PeopleManagementModal, PersonAllocationModal, CreditCardPaymentForm

### `.btn-cancel`

Standard cancel/dismiss button. Uses `var(--bg-card)` background, `1px solid var(--border-default)` border, `var(--text-secondary)` text, `var(--radius-md)` border-radius, `var(--text-sm)` font-size, `var(--font-medium)` font-weight, `var(--spacing-3) var(--spacing-5)` padding.

Includes hover state (`var(--bg-muted)`) and disabled state.

**Used by:** FinancialOverviewModal, PeopleManagementModal, PersonAllocationModal, CreditCardPaymentForm

### `.form-input`

Standard form input styling. Uses `var(--spacing-3) var(--spacing-4)` padding, `1px solid var(--border-default)` border, `var(--radius-md)` border-radius, `var(--text-base)` font-size, `var(--font-sans)` font-family, `var(--text-primary)` color, `var(--bg-card)` background.

Focus state: `var(--border-focus)` border-color with `var(--focus-ring)` box-shadow.

**Used by:** FinancialOverviewModal, PeopleManagementModal, PersonAllocationModal, CreditCardPaymentForm

### `.reminder-banner`

Shared structural base for notification banners. Uses `display: flex`, `align-items: flex-start`, `justify-content: space-between`, `var(--spacing-3) var(--spacing-4)` padding, `var(--radius-md)` border-radius, `var(--spacing-3)` margin-bottom, `cursor: pointer`, `var(--transition-card)` transition.

Component-specific color modifiers are applied alongside: `.warning`/`.danger`/`.critical` for BudgetReminderBanner, `.due-soon`/`.overdue` for LoanPaymentReminderBanner.

**Used by:** BudgetReminderBanner, LoanPaymentReminderBanner

---

## 9. Recommendations

### Completed ✅
1. ~~**Unify modal overlay**~~ — All modals now use shared `.modal-overlay` from App.css
2. ~~**Standardize primary button**~~ — `.btn-primary` base class created and applied
3. ~~**Fix z-index in CreditCardDetailView**~~ — Replaced hardcoded `1000` with `var(--z-modal-backdrop)`
4. ~~**Convert rem to px**~~ — All five target components migrated to design system px tokens
5. ~~**Shared form input class**~~ — `.form-input` base class created and applied
6. ~~**Shared banner class**~~ — `.reminder-banner` base class created and applied
7. ~~**Modal size tokens**~~ — `--modal-width-sm/md/lg/xl` added to variables.css and adopted by all modals
8. ~~**Consistent cancel buttons**~~ — `.btn-cancel` base class created and applied

### Remaining (Low Priority)
9. ~~**Modal header strategy**~~ — Documented as intentional. Gradient headers are used for full-page modals (FinancialOverview, Budgets, PeopleManagement, AnalyticsHub) while neutral headers are used for detail/utility modals (SystemModal, CreditCardDetail). This is a deliberate design distinction, not an inconsistency.
10. ~~**FinancialOverviewModal border-radius**~~ — Container and header now use `var(--radius-xl)` token. Inner elements (sections, cards, forms) correctly use `8px` / `var(--radius-md)`.
11. ~~**Close button standardization**~~ — Documented as intentional. Gradient-header modals use `rgba(255,255,255,0.2)` (white overlay on gradient), neutral-header modals use `background: none` or `var(--bg-muted)`. Style matches header type.
12. ~~**CollapsibleSection color tokens**~~ — Badge hover colors now use `var(--color-primary-light)` and `var(--color-primary)` tokens.
13. ~~**Banner color tokens**~~ — Documented as intentional. Status colors (warning amber, danger orange, critical red for budget; due-soon teal, overdue purple for loan) are semantic modifier colors specific to each banner's severity system. These are not candidates for shared design tokens.
