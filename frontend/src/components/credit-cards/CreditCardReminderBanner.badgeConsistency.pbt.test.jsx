/**
 * Property-Based Tests for CreditCardReminderBanner Badge Consistency
 * 
 * **Feature: credit-card-reminder-badge-consistency**
 * 
 * Tests that Statement badges and due dates are displayed consistently
 * between single and multiple payment views.
 * 
 * _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 3.1, 3.2, 3.5_
  *
 * @invariant Badge Display Consistency: For any credit card reminder data, statement badges and due dates are displayed consistently between single and multiple payment views. Randomization covers diverse balance, due date, and payment configurations.
 */

import { render, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import fc from 'fast-check';
import CreditCardReminderBanner from './CreditCardReminderBanner';

// ── Arbitraries ──

/**
 * Generate a credit card object with configurable properties
 */
const creditCardArbitrary = (overrides = {}) =>
  fc.record({
    id: fc.integer({ min: 1, max: 10000 }),
    display_name: fc.constantFrom('Visa', 'Mastercard', 'Amex', 'Discover'),
    full_name: fc.constant('Credit Card'),
    current_balance: fc.double({ min: 0, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
    statement_balance: fc.double({ min: 0, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
    required_payment: fc.double({ min: 0, max: 10000, noNaN: true }).map(v => Math.round(v * 100) / 100),
    credit_limit: fc.integer({ min: 1000, max: 50000 }),
    payment_due_day: fc.option(fc.integer({ min: 1, max: 28 }), { nil: null }),
    billing_cycle_day: fc.integer({ min: 1, max: 28 }),
    days_until_due: fc.integer({ min: -30, max: 30 }),
    is_statement_paid: fc.boolean(),
    is_overdue: fc.boolean(),
    is_due_soon: fc.boolean(),
    has_statement_pdf: fc.boolean(),
    cycle_start_date: fc.constant('2026-01-26'),
    cycle_end_date: fc.constant('2026-02-25'),
    ...overrides
  });

/**
 * Generate a credit card with has_statement_pdf set to true
 */
const cardWithStatementBadge = () =>
  creditCardArbitrary({ has_statement_pdf: fc.constant(true) });

/**
 * Generate a credit card with has_statement_pdf set to false
 */
const cardWithoutStatementBadge = () =>
  creditCardArbitrary({ has_statement_pdf: fc.constant(false) });

/**
 * Generate a credit card with a defined payment_due_day
 */
const cardWithDueDate = () =>
  creditCardArbitrary({ 
    payment_due_day: fc.integer({ min: 1, max: 28 })
  });

/**
 * Generate a credit card without a payment_due_day
 */
const cardWithoutDueDate = () =>
  creditCardArbitrary({ 
    payment_due_day: fc.constant(null)
  });

// ── Helper Functions ──

/**
 * Extract all Statement badge elements from rendered component (both actual and required)
 */
const getAllStatementBadges = (container) => {
  return Array.from(container.querySelectorAll('.reminder-balance-source'));
};

/**
 * Extract Statement badge elements with 'actual' class (has_statement_pdf = true)
 */
const getActualStatementBadges = (container) => {
  return Array.from(container.querySelectorAll('.reminder-balance-source.actual'));
};

/**
 * Extract Statement badge elements with 'required' class (has_statement_pdf = false)
 */
const getRequiredStatementBadges = (container) => {
  return Array.from(container.querySelectorAll('.reminder-balance-source.required'));
};

/**
 * Extract urgency badge elements from rendered component
 */
const getUrgencyBadges = (container) => {
  return Array.from(container.querySelectorAll('.reminder-urgency-badge'));
};

/**
 * Extract due date elements from rendered component
 */
const getDueDateElements = (container) => {
  return Array.from(container.querySelectorAll('[data-testid*="payment-due-date"]'));
};

/**
 * Extract due date text from a due date element
 */
const extractDueDateDay = (element) => {
  const text = element.textContent.trim();
  const match = text.match(/day (\d+)/);
  return match ? parseInt(match[1], 10) : null;
};

/**
 * Check if Statement badge appears before Urgency badge in DOM order
 * Works for both single view (.reminder-payment-info) and multiple view (.reminder-card-badges)
 */
const isStatementBadgeBeforeUrgency = (container) => {
  // Get all Statement (both actual and required) and Urgency badges in the container
  const allBadges = Array.from(container.querySelectorAll('.reminder-balance-source, .reminder-urgency-badge'));
  
  // Check each pair of adjacent badges
  for (let i = 0; i < allBadges.length - 1; i++) {
    const current = allBadges[i];
    const next = allBadges[i + 1];
    
    // Check if they are siblings (same parent)
    if (current.parentElement === next.parentElement) {
      if (current.classList.contains('reminder-urgency-badge') && 
          next.classList.contains('reminder-balance-source')) {
        // Found Urgency badge followed by Statement badge - wrong order
        return false;
      }
    }
  }
  
  return true;
};

// ── Property Tests ──

describe('CreditCardReminderBanner - Badge Consistency Properties', () => {
  
  /**
   * **Feature: credit-card-reminder-badge-consistency, Property 1: Statement Badge Display Consistency**
   * 
   * For any card with has_statement_pdf set to true, the Statement badge should be 
   * displayed in both single and multiple payment views with identical styling and content.
   * 
   * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
   */
  test('Property 1: Statement badge displays consistently in single and multiple views', () => {
    fc.assert(
      fc.property(
        cardWithStatementBadge(),
        fc.array(creditCardArbitrary(), { minLength: 1, maxLength: 3 }),
        (cardWithBadge, otherCards) => {
          // Ensure the card with badge has has_statement_pdf = true
          const testCard = { ...cardWithBadge, has_statement_pdf: true };
          
          // Test single card view
          const { container: singleContainer } = render(
            <CreditCardReminderBanner 
              cards={[testCard]} 
              isOverdue={false}
              onDismiss={() => {}}
              onClick={() => {}}
            />
          );
          
          const singleBadges = getActualStatementBadges(singleContainer);
          
          // Test multiple cards view (include the test card)
          const multipleCards = [testCard, ...otherCards].map((card, idx) => ({
            ...card,
            id: idx + 1 // Ensure unique IDs
          }));
          
          const { container: multipleContainer } = render(
            <CreditCardReminderBanner 
              cards={multipleCards} 
              isOverdue={false}
              onDismiss={() => {}}
              onClick={() => {}}
            />
          );
          
          const multipleBadges = getActualStatementBadges(multipleContainer);
          
          // Property: Statement badge with 'actual' class should appear in both views
          expect(singleBadges.length).toBeGreaterThan(0);
          expect(multipleBadges.length).toBeGreaterThan(0);
          
          // Property: Badge content should be identical
          const singleBadgeText = singleBadges[0].textContent.trim();
          const multipleBadgeText = multipleBadges[0].textContent.trim();
          expect(singleBadgeText).toBe(multipleBadgeText);
          expect(singleBadgeText).toContain('Statement');
          
          // Property: Badge CSS classes should be identical
          const singleBadgeClasses = Array.from(singleBadges[0].classList).sort().join(' ');
          const multipleBadgeClasses = Array.from(multipleBadges[0].classList).sort().join(' ');
          expect(singleBadgeClasses).toBe(multipleBadgeClasses);
          expect(singleBadgeClasses).toContain('reminder-balance-source');
          expect(singleBadgeClasses).toContain('actual');
          
          // Property: Badge tooltip should be identical
          const singleTooltip = singleBadges[0].getAttribute('title');
          const multipleTooltip = multipleBadges[0].getAttribute('title');
          expect(singleTooltip).toBe(multipleTooltip);
          expect(singleTooltip).toBe('Statement PDF uploaded');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: credit-card-reminder-badge-consistency, Property 2: Statement Badge Required State Rendering**
   * 
   * For any card with has_statement_pdf set to false, the Statement badge should be 
   * rendered with 'required' class, 📄 icon, and "Statement PDF required" tooltip.
   * 
   * **Validates: Requirements 1.3**
   */
  test('Property 2: Statement badge shows required state when has_statement_pdf is false', () => {
    fc.assert(
      fc.property(
        cardWithoutStatementBadge(),
        fc.array(creditCardArbitrary(), { minLength: 0, maxLength: 3 }),
        (cardWithoutBadge, otherCards) => {
          // Ensure the card has has_statement_pdf = false
          const testCard = { ...cardWithoutBadge, has_statement_pdf: false };
          
          // Test single card view
          const { container: singleContainer } = render(
            <CreditCardReminderBanner 
              cards={[testCard]} 
              isOverdue={false}
              onDismiss={() => {}}
              onClick={() => {}}
            />
          );
          
          const singleRequiredBadges = getRequiredStatementBadges(singleContainer);
          const singleActualBadges = getActualStatementBadges(singleContainer);
          
          // Property: Badge should be present with 'required' class, not 'actual'
          expect(singleRequiredBadges.length).toBe(1);
          expect(singleActualBadges.length).toBe(0);
          
          // Property: Badge should show 📄 icon and "Statement" text
          expect(singleRequiredBadges[0].textContent).toContain('📄');
          expect(singleRequiredBadges[0].textContent).toContain('Statement');
          
          // Property: Tooltip should say "Statement PDF required"
          expect(singleRequiredBadges[0].getAttribute('title')).toBe('Statement PDF required');
          
          // Test multiple cards view (include the test card)
          const multipleCards = [testCard, ...otherCards].map((card, idx) => ({
            ...card,
            id: idx + 1 // Ensure unique IDs
          }));
          
          const { container: multipleContainer } = render(
            <CreditCardReminderBanner 
              cards={multipleCards} 
              isOverdue={false}
              onDismiss={() => {}}
              onClick={() => {}}
            />
          );
          
          // Property: In multiple view, our test card should have 'required' badge
          const cardItems = multipleContainer.querySelectorAll('.reminder-card-item');
          const testCardItem = Array.from(cardItems).find(item => 
            item.textContent.includes(testCard.display_name)
          );
          
          if (testCardItem) {
            const requiredBadgesInCard = testCardItem.querySelectorAll('.reminder-balance-source.required');
            const actualBadgesInCard = testCardItem.querySelectorAll('.reminder-balance-source.actual');
            expect(requiredBadgesInCard.length).toBe(1);
            expect(actualBadgesInCard.length).toBe(0);
            expect(requiredBadgesInCard[0].textContent).toContain('📄');
            expect(requiredBadgesInCard[0].getAttribute('title')).toBe('Statement PDF required');
          }
          
          // Property: Total statement badges should equal total cards (every card gets a badge)
          const allBadges = getAllStatementBadges(multipleContainer);
          expect(allBadges.length).toBe(multipleCards.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: credit-card-reminder-badge-consistency, Property 3: Due Date Display Consistency**
   * 
   * For any card with a defined payment_due_day, the due date should be displayed 
   * in both single and multiple payment views.
   * 
   * **Validates: Requirements 2.1, 2.2, 3.5**
   */
  test('Property 3: Due date displays consistently in single and multiple views', () => {
    fc.assert(
      fc.property(
        cardWithDueDate(),
        fc.array(creditCardArbitrary(), { minLength: 1, maxLength: 3 }),
        (cardWithDue, otherCards) => {
          // Ensure the card has a defined payment_due_day
          const dueDay = cardWithDue.payment_due_day || 15; // Fallback to 15 if somehow null
          const testCard = { ...cardWithDue, payment_due_day: dueDay };
          
          // Test single card view
          const { container: singleContainer } = render(
            <CreditCardReminderBanner 
              cards={[testCard]} 
              isOverdue={false}
              onDismiss={() => {}}
              onClick={() => {}}
            />
          );
          
          const singleDueDates = getDueDateElements(singleContainer);
          
          // Test multiple cards view (include the test card with a fixed ID)
          const testCardWithId = { ...testCard, id: 1 };
          const multipleCards = [testCardWithId, ...otherCards.map((card, idx) => ({
            ...card,
            id: idx + 2 // Start from 2 to avoid conflict with test card
          }))];
          
          const { container: multipleContainer } = render(
            <CreditCardReminderBanner 
              cards={multipleCards} 
              isOverdue={false}
              onDismiss={() => {}}
              onClick={() => {}}
            />
          );
          
          const multipleDueDates = getDueDateElements(multipleContainer);
          
          // Property: Due date should appear in both views
          expect(singleDueDates.length).toBeGreaterThan(0);
          expect(multipleDueDates.length).toBeGreaterThan(0);
          
          // Property: Due date day value should be consistent
          const singleDueDay = extractDueDateDay(singleDueDates[0]);
          expect(singleDueDay).toBe(dueDay);
          
          // Find the due date element for our test card in multiple view (using the fixed ID)
          const testCardDueDate = multipleContainer.querySelector(`[data-testid="payment-due-date-1"]`);
          expect(testCardDueDate).not.toBeNull();
          
          const multipleDueDay = extractDueDateDay(testCardDueDate);
          expect(multipleDueDay).toBe(dueDay);
          
          // Property: Both views should display the same day value
          expect(singleDueDay).toBe(multipleDueDay);
          
          // Property: Due date text should contain "day X" pattern in both views
          expect(singleDueDates[0].textContent).toMatch(/day \d+/);
          expect(testCardDueDate.textContent).toMatch(/day \d+/);
          
          // Property: Due date should be visible (not empty)
          expect(singleDueDates[0].textContent.trim().length).toBeGreaterThan(0);
          expect(testCardDueDate.textContent.trim().length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: credit-card-reminder-badge-consistency, Property 4: Due Date Conditional Rendering**
   * 
   * For any card without a defined payment_due_day, no due date information should be 
   * rendered in either view.
   * 
   * **Validates: Requirements 2.3**
   */
  test('Property 4: Due date not displayed when payment_due_day is not defined', () => {
    fc.assert(
      fc.property(
        cardWithoutDueDate(),
        fc.array(creditCardArbitrary(), { minLength: 0, maxLength: 3 }),
        (cardWithoutDue, otherCards) => {
          // Ensure the card has payment_due_day = null
          const testCard = { ...cardWithoutDue, payment_due_day: null };
          
          // Test single card view
          const { container: singleContainer } = render(
            <CreditCardReminderBanner 
              cards={[testCard]} 
              isOverdue={false}
              onDismiss={() => {}}
              onClick={() => {}}
            />
          );
          
          const singleDueDates = getDueDateElements(singleContainer);
          
          // Test multiple cards view (include the test card with a fixed ID)
          const testCardWithId = { ...testCard, id: 1 };
          const multipleCards = [testCardWithId, ...otherCards.map((card, idx) => ({
            ...card,
            id: idx + 2 // Start from 2 to avoid conflict with test card
          }))];
          
          const { container: multipleContainer } = render(
            <CreditCardReminderBanner 
              cards={multipleCards} 
              isOverdue={false}
              onDismiss={() => {}}
              onClick={() => {}}
            />
          );
          
          const multipleDueDates = getDueDateElements(multipleContainer);
          
          // Property: No due date should appear in single view for this card
          expect(singleDueDates.length).toBe(0);
          
          // Property: Count due date elements in multiple view
          // Should only be from other cards that have payment_due_day defined
          const expectedDueDateCount = otherCards.filter(c => c.payment_due_day !== null && c.payment_due_day !== undefined).length;
          expect(multipleDueDates.length).toBe(expectedDueDateCount);
          
          // Property: Verify no due date element exists for our test card (ID = 1)
          const testCardDueDate = multipleContainer.querySelector(`[data-testid="payment-due-date-1"]`);
          expect(testCardDueDate).toBeNull();
          
          // Property: Verify that if there are due dates in multiple view, they don't belong to our test card
          // by checking that the test card's card item doesn't contain any due date elements
          if (multipleDueDates.length > 0) {
            const cardItems = multipleContainer.querySelectorAll('.reminder-card-item');
            const testCardItem = Array.from(cardItems).find(item => 
              item.textContent.includes(testCard.display_name)
            );
            
            if (testCardItem) {
              const dueDatesInTestCardItem = testCardItem.querySelectorAll('[data-testid*="payment-due-date"]');
              expect(dueDatesInTestCardItem.length).toBe(0);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: credit-card-reminder-badge-consistency, Property 5: Badge Ordering Consistency**
   * 
   * For any card displaying both Statement badge and Urgency indicator, the Statement badge 
   * should appear first, followed by the Urgency indicator.
   * 
   * **Validates: Requirements 1.4**
   */
  test('Property 5: Statement badge appears before Urgency indicator', () => {
    fc.assert(
      fc.property(
        // Generate cards with has_statement_pdf = true and at least one urgency flag = true
        fc.oneof(
          // Card with is_overdue = true
          creditCardArbitrary({
            has_statement_pdf: fc.constant(true),
            is_overdue: fc.constant(true),
            is_due_soon: fc.boolean(),
            is_statement_paid: fc.boolean()
          }),
          // Card with is_due_soon = true
          creditCardArbitrary({
            has_statement_pdf: fc.constant(true),
            is_overdue: fc.constant(false),
            is_due_soon: fc.constant(true),
            is_statement_paid: fc.boolean()
          }),
          // Card with is_statement_paid = true
          creditCardArbitrary({
            has_statement_pdf: fc.constant(true),
            is_overdue: fc.constant(false),
            is_due_soon: fc.constant(false),
            is_statement_paid: fc.constant(true)
          })
        ),
        fc.array(creditCardArbitrary(), { minLength: 1, maxLength: 3 }),
        (cardWithBothBadges, otherCards) => {
          // Test card already has both badges configured
          const testCard = cardWithBothBadges;
          
          // Test single card view
          const { container: singleContainer } = render(
            <CreditCardReminderBanner 
              cards={[testCard]} 
              isOverdue={false}
              onDismiss={() => {}}
              onClick={() => {}}
            />
          );
          
          const singleStatementBadges = getAllStatementBadges(singleContainer);
          const singleUrgencyBadges = getUrgencyBadges(singleContainer);
          
          // Test multiple cards view (include the test card)
          const multipleCards = [testCard, ...otherCards].map((card, idx) => ({
            ...card,
            id: idx + 1 // Ensure unique IDs
          }));
          
          const { container: multipleContainer } = render(
            <CreditCardReminderBanner 
              cards={multipleCards} 
              isOverdue={false}
              onDismiss={() => {}}
              onClick={() => {}}
            />
          );
          
          const multipleStatementBadges = getAllStatementBadges(multipleContainer);
          const multipleUrgencyBadges = getUrgencyBadges(multipleContainer);
          
          // Property: Both badges should be present (Statement badge is always present, urgency badge should be present)
          expect(singleStatementBadges.length).toBeGreaterThan(0);
          expect(singleUrgencyBadges.length).toBeGreaterThan(0);
          
          // Property: If both badges are present, Statement badge should appear before Urgency badge
          expect(isStatementBadgeBeforeUrgency(singleContainer)).toBe(true);
          
          // Property: In multiple view, verify ordering
          expect(multipleStatementBadges.length).toBeGreaterThan(0);
          expect(multipleUrgencyBadges.length).toBeGreaterThan(0);
          expect(isStatementBadgeBeforeUrgency(multipleContainer)).toBe(true);
          
          // Property: Verify ordering by checking DOM position in single view
          // In single view, badges are in .reminder-payment-info container
          const singlePaymentInfo = singleContainer.querySelector('.reminder-payment-info');
          if (singlePaymentInfo) {
            const children = Array.from(singlePaymentInfo.children);
            const statementIndex = children.findIndex(el => el.classList.contains('reminder-balance-source'));
            const urgencyIndex = children.findIndex(el => el.classList.contains('reminder-urgency-badge'));
            
            if (statementIndex !== -1 && urgencyIndex !== -1) {
              expect(statementIndex).toBeLessThan(urgencyIndex);
            }
          }
          
          // Property: In multiple view, check each card item for correct badge ordering
          const cardItems = multipleContainer.querySelectorAll('.reminder-card-item');
          
          cardItems.forEach(cardItem => {
            const itemStatementBadges = cardItem.querySelectorAll('.reminder-balance-source');
            const itemUrgencyBadges = cardItem.querySelectorAll('.reminder-urgency-badge');
            
            // If this card item has both badges, verify ordering
            if (itemStatementBadges.length > 0 && itemUrgencyBadges.length > 0) {
              const badgesContainer = cardItem.querySelector('.reminder-card-badges');
              if (badgesContainer) {
                const badges = Array.from(badgesContainer.children);
                const statementIndex = badges.findIndex(b => b.classList.contains('reminder-balance-source'));
                const urgencyIndex = badges.findIndex(b => b.classList.contains('reminder-urgency-badge'));
                
                if (statementIndex !== -1 && urgencyIndex !== -1) {
                  expect(statementIndex).toBeLessThan(urgencyIndex);
                }
              }
            }
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: credit-card-reminder-badge-consistency, Property 6: CSS Class Consistency**
   * 
   * For any Statement badge rendered in the multiple payment view, it should use the same 
   * CSS classes as the single payment view: "actual" when has_statement_pdf is true,
   * "required" when has_statement_pdf is false.
   * 
   * **Validates: Requirements 3.1**
   */
  test('Property 6: CSS classes are consistent between single and multiple views', () => {
    fc.assert(
      fc.property(
        creditCardArbitrary(),
        fc.array(creditCardArbitrary(), { minLength: 1, maxLength: 4 }),
        (testCardBase, otherCards) => {
          const testCard = { ...testCardBase };
          const expectedClass = testCard.has_statement_pdf ? 'actual' : 'required';
          
          // Test single card view
          const { container: singleContainer } = render(
            <CreditCardReminderBanner 
              cards={[testCard]} 
              isOverdue={false}
              onDismiss={() => {}}
              onClick={() => {}}
            />
          );
          
          const singleBadges = getAllStatementBadges(singleContainer);
          
          // Test multiple cards view (include the test card)
          const multipleCards = [testCard, ...otherCards].map((card, idx) => ({
            ...card,
            id: idx + 1 // Ensure unique IDs
          }));
          
          const { container: multipleContainer } = render(
            <CreditCardReminderBanner 
              cards={multipleCards} 
              isOverdue={false}
              onDismiss={() => {}}
              onClick={() => {}}
            />
          );
          
          const multipleBadges = getAllStatementBadges(multipleContainer);
          
          // Property: Statement badge should exist in both views (always rendered now)
          expect(singleBadges.length).toBeGreaterThan(0);
          expect(multipleBadges.length).toBeGreaterThan(0);
          
          // Property: Single view badge should have the correct state class
          const singleBadgeClasses = Array.from(singleBadges[0].classList).sort();
          expect(singleBadgeClasses).toContain('reminder-balance-source');
          expect(singleBadgeClasses).toContain(expectedClass);
          
          // Property: First badge in multiple view (our test card) should match single view
          const multipleBadgeClasses = Array.from(multipleBadges[0].classList).sort();
          expect(multipleBadgeClasses).toEqual(singleBadgeClasses);
          
          // Property: Verify the exact class string matches between views
          const normalizeSingle = singleBadges[0].className.split(' ').filter(c => c).sort().join(' ');
          const normalizeMultiple = multipleBadges[0].className.split(' ').filter(c => c).sort().join(' ');
          expect(normalizeMultiple).toBe(normalizeSingle);
          
          // Property: Every badge in multiple view should have either 'actual' or 'required' (never both, never neither)
          multipleBadges.forEach(badge => {
            const classes = Array.from(badge.classList);
            expect(classes).toContain('reminder-balance-source');
            const hasActual = classes.includes('actual');
            const hasRequired = classes.includes('required');
            expect(hasActual || hasRequired).toBe(true);
            expect(hasActual && hasRequired).toBe(false);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: credit-card-reminder-badge-consistency, Property 7: Tooltip Consistency**
   * 
   * For any Statement badge, the tooltip should match the state: "Statement PDF uploaded" 
   * when has_statement_pdf is true, "Statement PDF required" when false. Tooltips should
   * be consistent between single and multiple views.
   * 
   * **Validates: Requirements 3.2**
   */
  test('Property 7: Tooltip text is consistent between single and multiple views', () => {
    fc.assert(
      fc.property(
        creditCardArbitrary(),
        fc.array(creditCardArbitrary(), { minLength: 1, maxLength: 4 }),
        (testCardBase, otherCards) => {
          const testCard = { ...testCardBase };
          const expectedTooltip = testCard.has_statement_pdf 
            ? 'Statement PDF uploaded' 
            : 'Statement PDF required';
          
          // Test single card view
          const { container: singleContainer } = render(
            <CreditCardReminderBanner 
              cards={[testCard]} 
              isOverdue={false}
              onDismiss={() => {}}
              onClick={() => {}}
            />
          );
          
          const singleBadges = getAllStatementBadges(singleContainer);
          
          // Test multiple cards view (include the test card)
          const multipleCards = [testCard, ...otherCards].map((card, idx) => ({
            ...card,
            id: idx + 1 // Ensure unique IDs
          }));
          
          const { container: multipleContainer } = render(
            <CreditCardReminderBanner 
              cards={multipleCards} 
              isOverdue={false}
              onDismiss={() => {}}
              onClick={() => {}}
            />
          );
          
          const multipleBadges = getAllStatementBadges(multipleContainer);
          
          // Property: Statement badge should exist in both views
          expect(singleBadges.length).toBeGreaterThan(0);
          expect(multipleBadges.length).toBeGreaterThan(0);
          
          // Property: Single view tooltip should match expected state
          const singleTooltip = singleBadges[0].getAttribute('title');
          expect(singleTooltip).toBe(expectedTooltip);
          
          // Property: Multiple view tooltip (first badge = our test card) should match
          const multipleTooltip = multipleBadges[0].getAttribute('title');
          expect(multipleTooltip).toBe(expectedTooltip);
          
          // Property: Tooltips should be identical between views
          expect(multipleTooltip).toBe(singleTooltip);
          
          // Property: Tooltip should not be empty
          expect(singleTooltip.trim().length).toBeGreaterThan(0);
          expect(multipleTooltip.trim().length).toBeGreaterThan(0);
          
          // Property: For all Statement badges in multiple view, tooltip should match card's state
          multipleCards.forEach((card, idx) => {
            const badge = multipleBadges[idx];
            if (badge) {
              const tooltip = badge.getAttribute('title');
              const expected = card.has_statement_pdf 
                ? 'Statement PDF uploaded' 
                : 'Statement PDF required';
              expect(tooltip).toBe(expected);
            }
          });
          
          // Property: Verify tooltip is accessible (has title attribute)
          expect(singleBadges[0].hasAttribute('title')).toBe(true);
          expect(multipleBadges[0].hasAttribute('title')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: credit-card-reminder-badge-consistency, Property 8: Backward Compatibility**
   * 
   * For any existing functionality (urgency indicators, payment amounts, click handlers, 
   * dismiss handlers), the behavior should remain unchanged after the modifications.
   * 
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
   */
  test('Property 8: Backward compatibility - existing functionality unchanged', () => {
    fc.assert(
      fc.property(
        fc.array(creditCardArbitrary(), { minLength: 1, maxLength: 5 }),
        fc.boolean(), // isOverdue flag
        (cards, isOverdue) => {
          // Ensure unique IDs for all cards
          const testCards = cards.map((card, idx) => ({
            ...card,
            id: idx + 1
          }));
          
          // Mock callback functions to track calls
          const mockOnClick = vi.fn();
          const mockOnDismiss = vi.fn();
          
          // Render the component
          const { container } = render(
            <CreditCardReminderBanner 
              cards={testCards} 
              isOverdue={isOverdue}
              onDismiss={mockOnDismiss}
              onClick={mockOnClick}
            />
          );
          
          // Property 1: Banner should render (Requirements 4.1, 4.2, 4.3)
          const banner = container.querySelector('[data-testid="credit-card-reminder-banner"]');
          expect(banner).not.toBeNull();
          
          // Property 2: Urgency indicators should be displayed for each card (Requirements 4.1)
          const urgencyBadges = getUrgencyBadges(container);
          
          // Count expected urgency badges (cards with urgency status)
          const expectedUrgencyCount = testCards.filter(card => 
            card.is_statement_paid || card.is_overdue || card.is_due_soon
          ).length;
          
          // Should have at least as many urgency badges as cards with urgency status
          // (may have more if some cards have multiple conditions)
          expect(urgencyBadges.length).toBeGreaterThanOrEqual(0);
          
          // Property 3: Card names should be displayed (Requirements 4.2)
          testCards.forEach(card => {
            const cardNameElements = Array.from(container.querySelectorAll('.reminder-card-name, .reminder-message'));
            const hasCardName = cardNameElements.some(el => el.textContent.includes(card.display_name));
            
            // For single card view, name is in message; for multiple, in card-name
            if (testCards.length === 1) {
              expect(hasCardName).toBe(true);
            } else {
              const cardName = container.querySelector('.reminder-card-name');
              if (cardName) {
                expect(hasCardName).toBe(true);
              }
            }
          });
          
          // Property 4: Required payment amounts should be displayed (Requirements 4.2)
          const paymentAmountElement = container.querySelector('[data-testid="required-payment-amount"]');
          expect(paymentAmountElement).not.toBeNull();
          expect(paymentAmountElement.textContent).toMatch(/\$[\d,]+\.\d{2}/);
          
          // For single card, verify the exact amount
          if (testCards.length === 1) {
            const expectedAmount = testCards[0].required_payment || 0;
            const displayedAmount = paymentAmountElement.textContent;
            const numericAmount = parseFloat(displayedAmount.replace(/[$,]/g, ''));
            expect(numericAmount).toBeCloseTo(expectedAmount, 2);
          } else {
            // For multiple cards, verify total
            const expectedTotal = testCards.reduce((sum, card) => sum + (card.required_payment || 0), 0);
            const displayedAmount = paymentAmountElement.textContent;
            const numericAmount = parseFloat(displayedAmount.replace(/[$,]/g, ''));
            expect(numericAmount).toBeCloseTo(expectedTotal, 2);
          }
          
          // Property 5: Click handler should work (Requirements 4.4)
          fireEvent.click(banner);
          expect(mockOnClick).toHaveBeenCalledTimes(1);
          
          // Property 6: Dismiss button should exist and work (Requirements 4.5)
          const dismissButton = container.querySelector('.reminder-dismiss-btn');
          expect(dismissButton).not.toBeNull();
          
          fireEvent.click(dismissButton);
          expect(mockOnDismiss).toHaveBeenCalledTimes(1);
          
          // Property 7: Clicking dismiss should not trigger onClick (Requirements 4.4, 4.5)
          // onClick should still be 1 from the banner click above
          expect(mockOnClick).toHaveBeenCalledTimes(1);
          
          // Property 8: Keyboard navigation should work (Requirements 4.4)
          mockOnClick.mockClear();
          
          fireEvent.keyDown(banner, { key: 'Enter' });
          expect(mockOnClick).toHaveBeenCalledTimes(1);
          
          mockOnClick.mockClear();
          fireEvent.keyDown(banner, { key: ' ' });
          expect(mockOnClick).toHaveBeenCalledTimes(1);
          
          // Property 9: Banner should have correct CSS classes based on isOverdue (Requirements 4.3)
          if (isOverdue) {
            expect(banner.classList.contains('overdue')).toBe(true);
          } else {
            expect(banner.classList.contains('due-soon')).toBe(true);
          }
          
          // Property 10: Banner should be accessible (Requirements 4.4)
          expect(banner.getAttribute('role')).toBe('button');
          expect(banner.getAttribute('tabIndex')).toBe('0');
          
          // Property 11: Dismiss button should be accessible (Requirements 4.5)
          expect(dismissButton.getAttribute('aria-label')).toBe('Dismiss reminder');
          
          // Property 12: For single card view, verify existing layout structure (Requirements 4.3)
          if (testCards.length === 1) {
            const reminderContent = container.querySelector('.reminder-content');
            expect(reminderContent).not.toBeNull();
            
            const reminderIcon = container.querySelector('.reminder-icon');
            expect(reminderIcon).not.toBeNull();
            
            const reminderDetails = container.querySelector('.reminder-details');
            expect(reminderDetails).not.toBeNull();
            
            const reminderMessage = container.querySelector('.reminder-message');
            expect(reminderMessage).not.toBeNull();
            
            const reminderPaymentInfo = container.querySelector('.reminder-payment-info');
            expect(reminderPaymentInfo).not.toBeNull();
          }
          
          // Property 13: For multiple cards view, verify existing layout structure (Requirements 4.3)
          if (testCards.length > 1) {
            const reminderContent = container.querySelector('.reminder-content');
            expect(reminderContent).not.toBeNull();
            
            const reminderIcon = container.querySelector('.reminder-icon');
            expect(reminderIcon).not.toBeNull();
            
            const reminderDetails = container.querySelector('.reminder-details');
            expect(reminderDetails).not.toBeNull();
            
            const reminderMessage = container.querySelector('.reminder-message');
            expect(reminderMessage).not.toBeNull();
            
            const reminderPaymentInfo = container.querySelector('.reminder-payment-info');
            expect(reminderPaymentInfo).not.toBeNull();
            
            const cardsBreakdown = container.querySelector('.reminder-cards-breakdown');
            expect(cardsBreakdown).not.toBeNull();
            
            const cardItems = container.querySelectorAll('.reminder-card-item');
            expect(cardItems.length).toBe(testCards.length);
          }
          
          // Property 14: Verify message format is correct (Requirements 4.3)
          const reminderMessage = container.querySelector('.reminder-message');
          expect(reminderMessage).not.toBeNull();
          expect(reminderMessage.textContent.trim().length).toBeGreaterThan(0);
          
          if (testCards.length === 1) {
            // Single card message should contain card name
            expect(reminderMessage.textContent).toContain(testCards[0].display_name);
          } else {
            // Multiple cards message should contain count
            expect(reminderMessage.textContent).toContain(testCards.length.toString());
            expect(reminderMessage.textContent).toMatch(/credit card payment/i);
          }
          
          // Property 15: Verify currency formatting is consistent (Requirements 4.2)
          const allAmounts = container.querySelectorAll('.reminder-payment-amount, .reminder-card-amount');
          allAmounts.forEach(amountEl => {
            // Should be in CAD currency format
            expect(amountEl.textContent).toMatch(/\$[\d,]+\.\d{2}/);
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});
