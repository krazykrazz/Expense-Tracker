 # Implementation Plan

- [x] 1. Backend: Add category frequency query to repository





  - [x] 1.1 Add `getCategoryFrequencyByPlace` method to expenseRepository.js


    - Query expenses table grouped by category for a given place
    - Include count and most recent date for each category
    - Use case-insensitive matching for place name
    - _Requirements: 1.4, 4.1_

  - [x] 1.2 Write property test for category frequency query

    - **Property 1: Most Frequent Category Suggestion**
    - **Validates: Requirements 1.4, 2.1, 4.1**

- [x] 2. Backend: Create category suggestion service





  - [x] 2.1 Create `backend/services/categorySuggestionService.js`


    - Implement `getSuggestedCategory(place)` function
    - Return most frequent category with confidence score
    - Handle tie-breaker using most recent date
    - Return null for places with no history
    - _Requirements: 1.4, 2.2, 4.1, 4.2, 4.4_

  - [x] 2.2 Write property test for suggestion algorithm

    - **Property 2: Tie-Breaker Uses Most Recent**
    - **Validates: Requirements 4.2**
  - [x] 2.3 Write property test for new place handling


    - **Property 3: New Place Defaults to Null**
    - **Validates: Requirements 2.2, 4.4**

- [x] 3. Backend: Add API endpoint for category suggestion





  - [x] 3.1 Add route and controller for `GET /api/expenses/suggest-category`


    - Accept `place` query parameter
    - Return suggestion with confidence and breakdown
    - Handle empty/missing place parameter
    - _Requirements: 1.3, 1.4_
  - [x] 3.2 Write unit tests for controller


    - Test successful suggestion response
    - Test empty place parameter handling
    - Test place with no history

- [x] 4. Checkpoint - Ensure all backend tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Frontend: Create category suggestion API service






  - [x] 5.1 Create `frontend/src/services/categorySuggestionApi.js`

    - Implement `fetchCategorySuggestion(place)` function
    - Handle API errors gracefully
    - Return null on error (graceful degradation)
    - _Requirements: 1.3, 1.4_

- [x] 6. Frontend: Update ExpenseForm field order and focus



  - [x] 6.1 Reorder form fields in ExpenseForm.jsx


    - Change order to: Date, Place, Type, Amount, Method, Notes
    - Set initial focus to Place field
    - _Requirements: 1.1, 3.2_

  - [x] 6.2 Add auto-focus to Amount field after place entry

    - Move focus to Amount when place is entered/selected
    - _Requirements: 3.1_

- [x] 7. Frontend: Implement category suggestion integration





  - [x] 7.1 Add category suggestion fetch on place blur/selection


    - Call suggestion API when place field loses focus
    - Auto-select suggested category if returned
    - Show visual indicator for auto-suggested category
    - _Requirements: 1.3, 1.4, 2.1, 2.3_

  - [x] 7.2 Handle suggestion override

    - Allow user to change category without restriction
    - Clear suggestion indicator when user changes category
    - _Requirements: 2.4_
  - [x] 7.3 Write property test for form validation


    - **Property 4: Form Validation Enables Submit**
    - **Validates: Requirements 3.3**

- [x] 8. Frontend: Implement payment method memory






  - [x] 8.1 Add localStorage persistence for last payment method

    - Save payment method on form submission
    - Load and pre-select on form open
    - Default to "Credit Card" if no saved value
    - _Requirements: 5.1, 5.2, 5.3_
  - [x] 8.2 Write property test for payment method persistence


    - **Property 5: Payment Method Persistence**
    - **Validates: Requirements 5.1, 5.3**

- [x] 9. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Final integration and cleanup






  - [x] 10.1 Test end-to-end flow manually

    - Verify place-first entry works smoothly
    - Verify suggestions appear correctly
    - Verify payment method is remembered
    - _Requirements: All_

  - [x] 10.2 Update any affected documentation

    - Update README if needed
    - Update feature documentation
