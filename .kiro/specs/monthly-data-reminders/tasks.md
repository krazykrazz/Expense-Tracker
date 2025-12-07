# Implementation Plan: Monthly Data Reminders

- [x] 1. Create backend API endpoint for reminder status





  - Create `/api/reminders/status/:year/:month` endpoint
  - Query active investments and check for missing values
  - Query active loans and check for missing balances
  - Return counts and details in JSON response
  - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 2.4_

- [x] 1.1 Write property test for missing investment detection


  - **Property 1: Missing investment data triggers reminder**
  - **Validates: Requirements 1.1, 4.1**

- [x] 1.2 Write property test for complete investment data

  - **Property 2: Complete investment data suppresses reminder**
  - **Validates: Requirements 1.2**

- [x] 1.3 Write property test for missing loan detection

  - **Property 3: Missing loan data triggers reminder**
  - **Validates: Requirements 2.1, 4.2**

- [x] 1.4 Write property test for complete loan data

  - **Property 4: Complete loan data suppresses reminder**
  - **Validates: Requirements 2.2**

- [x] 1.5 Write property test for count accuracy

  - **Property 6: Count accuracy for investments**
  - **Property 7: Count accuracy for loans**
  - **Validates: Requirements 4.1, 4.2**

- [x] 2. Create DataReminderBanner component





  - Create `frontend/src/components/DataReminderBanner.jsx`
  - Create `frontend/src/components/DataReminderBanner.css`
  - Implement props interface (type, count, monthName, onDismiss, onClick)
  - Add icon display (💡 for investments, 💳 for loans)
  - Add dismiss button with X icon
  - Make entire banner clickable
  - Style with subtle warning colors
  - _Requirements: 3.1, 3.3, 4.1, 4.2, 4.3_

- [x] 2.1 Write unit tests for DataReminderBanner


  - Test rendering with different props
  - Test dismiss button functionality
  - Test click handler
  - Test icon display based on type
  - _Requirements: 3.1, 3.3_

- [x] 3. Enhance SummaryPanel with reminder functionality





  - Add state for reminderStatus and dismissedReminders
  - Create fetchReminderStatus function
  - Call API on component mount for current month
  - Add dismiss handlers for both reminder types
  - Add click handlers to open modals
  - Render DataReminderBanner components conditionally
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.2, 3.3, 3.4_

- [x] 3.1 Write property test for month name display


  - **Property 5: Month name accuracy**
  - **Validates: Requirements 4.3**

- [x] 3.2 Write integration tests for reminder flow


  - Test missing data shows reminders
  - Test complete data hides reminders
  - Test clicking banner opens modal
  - Test dismissal hides banner
  - Test multiple reminders display correctly
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.2, 3.3_

- [x] 4. Add API endpoint to config





  - Add REMINDER_STATUS endpoint to `frontend/src/config.js`
  - _Requirements: All_

- [x] 5. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.
