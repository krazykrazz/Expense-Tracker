# Implementation Plan: UI Modernization

## Overview

This implementation plan breaks down the UI modernization into incremental phases, starting with the design system foundation and progressively updating components. Each phase builds on the previous, ensuring the application remains functional throughout the modernization process.

## Tasks

- [x] 1. Phase 1: Design System Foundation
  - [x] 1.1 Update variables.css with modern design tokens
    - Add expanded spacing scale (4px to 48px)
    - Add modern border-radius tokens (6px, 8px, 12px, 16px, 24px, full)
    - Add multi-level shadow system (xs, sm, md, lg, xl, inner)
    - Add typography tokens (font families, sizes, weights, line heights)
    - Add transition timing tokens (fast, normal, slow, bounce)
    - Add enhanced color tokens (backgrounds, borders, overlays)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 1.2 Update index.css with modern base styles
    - Update font-family to use Inter with system fallbacks
    - Update base font-size to 14px
    - Add CSS reset improvements
    - _Requirements: 1.4, 8.2_

  - [x] 1.3 Write unit tests for design token values
    - Verify spacing scale values
    - Verify border-radius token values
    - Verify shadow system values
    - Verify typography token values
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Phase 2: Core Component Refresh - Buttons and Inputs
  - [x] 2.1 Update button styles in ExpenseForm.css
    - Apply modern border-radius (8px)
    - Add padding using design tokens
    - Add hover transform and shadow elevation
    - Add active/pressed state with scale
    - Add smooth transitions
    - Update disabled state styling
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6_

  - [x] 2.2 Update button styles in ExpenseList.css
    - Update edit and delete button styling
    - Apply consistent button styling with ExpenseForm
    - Add hover and active states
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 7.5_

  - [x] 2.3 Update form input styles in ExpenseForm.css
    - Apply modern border-radius (8px)
    - Update padding and font-size
    - Add focus ring with colored outline
    - Update placeholder styling
    - Update label styling (font-weight, spacing)
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6_

  - [x] 2.4 Update form input styles in ExpenseList.css (edit modal)
    - Apply consistent input styling with ExpenseForm
    - Update filter select styling
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 3. Checkpoint - Verify buttons and inputs
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Phase 3: Card and Container Components
  - [x] 4.1 Update card styles in SummaryPanel.css
    - Apply modern border-radius (12px)
    - Replace borders with subtle shadows
    - Add hover shadow elevation
    - Update internal padding (16-24px)
    - Update card header styling
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 11.1_

  - [x] 4.2 Update summary value typography in SummaryPanel.css
    - Update value font sizes for hierarchy
    - Update icon sizing and colors
    - Update positive/negative value colors
    - Update grid gap between cards
    - _Requirements: 11.2, 11.3, 11.4, 11.5_

  - [x] 4.3 Update expense list container in ExpenseList.css
    - Apply modern card styling to container
    - Update header styling
    - Remove heavy borders
    - _Requirements: 2.1, 2.4, 2.5_

  - [x] 4.4 Update expense form container in ExpenseForm.css
    - Apply modern card styling
    - Update header styling
    - _Requirements: 2.1, 2.4, 2.5_

- [x] 5. Phase 4: Modal Components
  - [x] 5.1 Update modal styles in App.css
    - Apply modern border-radius (16-24px)
    - Add prominent box-shadow
    - Update internal padding (24-32px)
    - Add backdrop blur to overlay
    - Add open animation (scale + fade)
    - Update close button styling
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 5.2 Update modal styles in component CSS files
    - Update FixedExpensesModal.css
    - Update IncomeManagementModal.css
    - Update LoansModal.css
    - Update InvestmentsModal.css
    - Update BudgetManagementModal.css
    - Update PeopleManagementModal.css
    - Apply consistent modal styling
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [-] 6. Checkpoint - Verify cards and modals
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Phase 5: Table and List Components
  - [ ] 7.1 Update table styles in ExpenseList.css
    - Update table header styling (subtle background)
    - Update row hover states
    - Update row height and padding
    - Update row separators (light borders)
    - Update tax-deductible row styling
    - Add rounded corners to table
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ] 7.2 Update badge and indicator styles
    - Update people indicator styling
    - Update invoice indicator styling
    - Apply pill shape with full border-radius
    - Update padding and font-size
    - Add color variants for categories
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ] 7.3 Update responsive table behavior in ExpenseList.css
    - Improve mobile table display
    - Consider card-style rows on small screens
    - _Requirements: 7.6, 12.4_

- [ ] 8. Phase 6: Header and Navigation
  - [ ] 8.1 Update header styles in App.css
    - Update header background styling
    - Update header button styling (rounded, subtle backgrounds)
    - Update padding and spacing
    - Update logo and title sizing
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ] 8.2 Update header responsive styles
    - Ensure mobile header adapts properly
    - Maintain usability on small screens
    - _Requirements: 10.5, 12.4_

- [ ] 9. Phase 7: Typography and Spacing Polish
  - [ ] 9.1 Update typography throughout components
    - Apply heading size hierarchy
    - Update body text sizes
    - Update small/caption text sizes
    - Add tabular numerals for monetary values
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ] 9.2 Update spacing throughout components
    - Ensure minimum 16px between major sections
    - Ensure minimum 8px between related elements
    - Apply consistent spacing using design tokens
    - _Requirements: 8.5, 8.6_

- [ ] 10. Checkpoint - Verify tables, header, and typography
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Phase 8: Micro-interactions and Transitions
  - [ ] 11.1 Add smooth transitions to interactive elements
    - Verify all buttons have transitions
    - Verify all inputs have focus transitions
    - Verify all cards have hover transitions
    - Ensure timing is 150-300ms
    - _Requirements: 9.1, 9.5_

  - [ ] 11.2 Add fade-in animations for content
    - Add subtle fade-in for loading states
    - Add animation for modal open
    - _Requirements: 9.2_

  - [ ] 11.3 Update collapsible section animations
    - Ensure smooth height/opacity transitions
    - Apply to summary panel collapsibles
    - _Requirements: 9.3_

  - [ ] 11.4 Add reduced motion support
    - Add @media (prefers-reduced-motion: reduce) rules
    - Disable or reduce animations for accessibility
    - _Requirements: 9.4_

  - [ ] 11.5 Write property test for transition duration consistency
    - **Property 1: Transition Duration Consistency**
    - Parse all CSS files and verify transition durations are 150-300ms
    - **Validates: Requirements 9.1**

  - [ ] 11.6 Write property test for reduced motion accessibility
    - **Property 2: Reduced Motion Accessibility**
    - Verify all animations have prefers-reduced-motion handling
    - **Validates: Requirements 9.4**

- [ ] 12. Phase 9: Remaining Component Updates
  - [ ] 12.1 Update BudgetAlertBanner.css
    - Apply modern card and badge styling
    - Update alert colors and typography
    - _Requirements: 2.1, 6.1, 6.4_

  - [ ] 12.2 Update DataReminderBanner.css
    - Apply modern styling consistent with alerts
    - _Requirements: 2.1, 6.1_

  - [ ] 12.3 Update MonthSelector.css
    - Apply modern button and input styling
    - _Requirements: 3.1, 4.1_

  - [ ] 12.4 Update SearchBar.css
    - Apply modern input styling
    - Update search icon and clear button
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ] 12.5 Update TaxDeductible.css
    - Apply modern card and table styling
    - Update badge styling for tax categories
    - _Requirements: 2.1, 6.1, 6.3, 7.1_

  - [ ] 12.6 Update AnnualSummary.css
    - Apply modern card styling
    - Update typography and spacing
    - _Requirements: 2.1, 8.1, 8.5_

  - [ ] 12.7 Update BackupSettings.css
    - Apply modern card and button styling
    - Update changelog section styling
    - _Requirements: 2.1, 3.1_

- [ ] 13. Phase 10: Invoice and Detail View Components
  - [ ] 13.1 Update InvoiceUpload.css
    - Apply modern input and button styling
    - Update file input styling
    - _Requirements: 3.1, 4.1_

  - [ ] 13.2 Update InvoiceList.css
    - Apply modern list styling
    - Update invoice item cards
    - _Requirements: 2.1, 6.1_

  - [ ] 13.3 Update InvoicePDFViewer.css
    - Apply modern modal styling
    - Update viewer controls
    - _Requirements: 5.1, 3.1_

  - [ ] 13.4 Update MerchantAnalyticsModal.css and MerchantDetailView.css
    - Apply modern modal and card styling
    - Update chart container styling
    - _Requirements: 2.1, 5.1_

  - [ ] 13.5 Update InvestmentDetailView.css and LoanDetailView.css
    - Apply modern card styling
    - Update chart and data display styling
    - _Requirements: 2.1, 8.1_

  - [ ] 13.6 Update TotalDebtView.css
    - Apply modern card styling
    - _Requirements: 2.1_

- [ ] 14. Final Checkpoint - Complete verification
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all components have consistent modern styling
  - Verify responsive behavior is maintained
  - Verify no accessibility regressions

## Notes

- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- The implementation is CSS-only where possible, minimizing JSX changes
- All changes should be backward compatible with existing functionality
