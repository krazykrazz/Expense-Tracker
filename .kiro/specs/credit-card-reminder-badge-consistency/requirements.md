# Requirements Document

## Introduction

This specification addresses UX inconsistencies in the credit card payment reminder banner. Currently, when displaying a single credit card payment, the banner shows the "Statement" badge (indicating whether a statement balance has been uploaded), the urgency indicator (paid, overdue, etc.), and the payment due date. However, when displaying multiple credit card payments, only the urgency indicator is shown, missing both the "Statement" badge and the due date information. This creates an inconsistent user experience and makes it harder for users to track which cards have statement balances uploaded and when payments are due when viewing multiple payments.

## Glossary

- **CreditCardReminderBanner**: React component that displays credit card payment due date reminders
- **Statement_Badge**: Visual indicator showing "✓ Statement" when a statement balance has been uploaded (has_actual_balance is true)
- **Urgency_Indicator**: Visual indicator showing payment status (✓ PAID, 🚨 Overdue, ⏰ Due Soon, etc.)
- **Single_Payment_View**: Banner display when only one credit card payment is due
- **Multiple_Payment_View**: Banner display when two or more credit card payments are due
- **has_actual_balance**: Boolean field indicating whether a statement balance has been manually entered by the user
- **payment_due_day**: Integer field indicating the day of the month when payment is due

## Requirements

### Requirement 1: Display Statement Badge in Multiple Payment View

**User Story:** As a user viewing multiple credit card payment reminders, I want to see which cards have statement balances uploaded, so that I can track my billing cycle management at a glance.

#### Acceptance Criteria

1. WHEN the banner displays multiple credit card payments, THE CreditCardReminderBanner SHALL display the Statement_Badge for each card where has_actual_balance is true
2. WHEN a card has has_actual_balance set to true, THE Statement_Badge SHALL display "✓ Statement" with the same styling as the single payment view
3. WHEN a card has has_actual_balance set to false, THE CreditCardReminderBanner SHALL NOT display a Statement_Badge for that card
4. WHEN displaying both Statement_Badge and Urgency_Indicator for a card, THE CreditCardReminderBanner SHALL display them in the order: Statement_Badge first, then Urgency_Indicator

### Requirement 2: Display Due Date in Multiple Payment View

**User Story:** As a user viewing multiple credit card payment reminders, I want to see when each payment is due, so that I can prioritize my payments effectively.

#### Acceptance Criteria

1. WHEN the banner displays multiple credit card payments, THE CreditCardReminderBanner SHALL display the payment_due_day for each card where payment_due_day is defined
2. WHEN a card has payment_due_day defined, THE CreditCardReminderBanner SHALL display "Due: day X" where X is the payment_due_day value
3. WHEN a card does not have payment_due_day defined, THE CreditCardReminderBanner SHALL NOT display due date information for that card
4. WHEN displaying the due date, THE CreditCardReminderBanner SHALL position it on a separate line below the card name and amount for readability

### Requirement 3: Maintain Visual Consistency

**User Story:** As a user, I want the badge and due date display to be consistent between single and multiple payment views, so that I can quickly understand the information regardless of how many payments are shown.

#### Acceptance Criteria

1. WHEN the Statement_Badge is displayed in the multiple payment view, THE CreditCardReminderBanner SHALL use the same CSS class "reminder-balance-source actual" as the single payment view
2. WHEN the Statement_Badge is displayed in the multiple payment view, THE CreditCardReminderBanner SHALL use the same tooltip text "From your entered statement balance" as the single payment view
3. WHEN the Statement_Badge is displayed in the multiple payment view, THE CreditCardReminderBanner SHALL maintain the same visual styling (color, size, spacing) as the single payment view
4. WHEN both badges are displayed, THE CreditCardReminderBanner SHALL ensure adequate spacing between the Statement_Badge and Urgency_Indicator for readability
5. WHEN the due date is displayed in the multiple payment view, THE CreditCardReminderBanner SHALL use styling consistent with the single payment view

### Requirement 4: Preserve Existing Functionality

**User Story:** As a user, I want the existing urgency indicators and payment information to continue working as expected, so that the fix doesn't break current functionality.

#### Acceptance Criteria

1. WHEN the banner displays multiple payments, THE CreditCardReminderBanner SHALL continue to display the Urgency_Indicator for each card
2. WHEN the banner displays multiple payments, THE CreditCardReminderBanner SHALL continue to display the card name and required payment amount for each card
3. WHEN the banner displays a single payment, THE CreditCardReminderBanner SHALL continue to display both badges in the existing location
4. WHEN a user clicks on the banner, THE CreditCardReminderBanner SHALL continue to trigger the onClick handler as before
5. WHEN a user clicks the dismiss button, THE CreditCardReminderBanner SHALL continue to trigger the onDismiss handler as before
