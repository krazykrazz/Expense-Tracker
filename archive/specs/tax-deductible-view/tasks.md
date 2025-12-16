# Implementation Plan

- [x] 1. Implement backend repository method for tax-deductible expenses





  - Create `getTaxDeductibleExpenses(year)` method in `backend/repositories/expenseRepository.js`
  - Write SQL query to filter expenses by year and tax types ('Tax - Medical', 'Tax - Donation')
  - Return array of expense objects ordered by date
  - _Requirements: 4.2, 4.3_

- [x] 2. Implement backend service layer for tax-deductible summary





  - Create `getTaxDeductibleSummary(year)` method in `backend/services/expenseService.js`
  - Validate year parameter
  - Call repository method to fetch expenses
  - Separate expenses into medical and donations arrays
  - Calculate totalDeductible, medicalTotal, and donationTotal
  - Generate monthly breakdown by grouping expenses by month
  - Return structured summary object matching the design interface
  - _Requirements: 1.4, 1.5, 2.5, 3.2, 3.5, 4.2_

- [x] 3. Implement backend API endpoint for tax-deductible expenses





  - Add `getTaxDeductibleSummary` controller function in `backend/controllers/expenseController.js`
  - Validate year query parameter and return 400 if missing
  - Call service layer method
  - Handle errors and return appropriate status codes (400, 500)
  - Return JSON response with tax-deductible summary data
  - Add route `GET /api/expenses/tax-deductible` in `backend/server.js`
  - _Requirements: 4.1, 4.2_

- [x] 4. Add tax-deductible data fetching to AnnualSummary component





  - Add state variables for tax-deductible data and loading state in `frontend/src/components/AnnualSummary.jsx`
  - Create `fetchTaxDeductibleData` function to call new API endpoint
  - Call fetch function in useEffect when year changes
  - Implement error handling and logging
  - Update loading state appropriately
  - _Requirements: 4.4, 4.5_

- [x] 5. Create tax-deductible summary cards section





  - Add "Tax Deductible Expenses" section header with icon in AnnualSummary component
  - Create three summary cards displaying totalDeductible, medicalTotal, and donationTotal
  - Format amounts using existing `formatAmount` helper
  - Use consistent styling with existing summary cards
  - Handle empty state when no tax-deductible expenses exist
  - _Requirements: 1.1, 1.2, 1.3, 1.5, 5.1, 5.2, 5.5_

- [x] 6. Implement monthly breakdown visualization for tax expenses





  - Create monthly breakdown section within tax-deductible view
  - Display all 12 months with three-letter abbreviations using existing `getMonthName` helper
  - Show bar chart visualization similar to existing monthly breakdown
  - Calculate bar widths based on highest month total
  - Display zero amounts for months without tax-deductible expenses
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 7. Create detailed expense lists for medical and donations




  - Add two categorized sections: Medical Expenses and Donations
  - Display list of expenses for each category with date, place, amount, and notes
  - Use icons to distinguish medical (🏥) from donations (❤️)
  - Format dates and amounts consistently
  - Sort expenses chronologically within each category
  - Add visual separators between categories
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 5.3, 5.4_

- [x] 8. Add CSS styling for tax-deductible section
  - Add styles for tax-deductible section in `frontend/src/components/AnnualSummary.css`
  - Style summary cards to match existing design
  - Style monthly breakdown bars
  - Style expense list items with proper spacing and typography
  - Add responsive styles for mobile devices
  - Ensure visual consistency with existing annual summary sections
  - _Requirements: 5.1, 5.2, 5.3, 5.4_
