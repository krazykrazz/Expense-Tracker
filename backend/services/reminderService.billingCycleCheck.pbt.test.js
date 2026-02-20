/**
 * Property-Based Tests: Billing Cycle Reminder Correctness
 *
 * @invariant
 * Property 1: Billing cycle reminder correctness
 * For any credit card with a billing cycle day:
 * - If no DB record exists for the most recently completed cycle → needsEntry=false, cycleNotYetGenerated=true
 * - If a DB record exists with is_user_entered=0 → needsEntry=true
 * - If a DB record exists with is_user_entered=1 → needsEntry=false, hasEntry=true
 * - DB failures are swallowed per card (card is skipped, not thrown)
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */

'use strict';

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../repositories/billingCycleRepository');
jest.mock('../repositories/reminderRepository');
jest.mock('../repositories/fixedExpenseRepository');
jest.mock('../repositories/loanPaymentRepository');
jest.mock('./statementBalanceService');
jest.mock('./activityLogService');

const billingCycleRepository = require('../repositories/billingCycleRepository');
const statementBalanceService = require('./statementBalanceService');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal credit card object for getCreditCardsNeedingBillingCycleEntry
 */
function makeCard(id, billingCycleDay) {
  return {
    id,
    billing_cycle_day: billingCycleDay,
    display_name: `Card ${id}`,
    full_name: `Full Card ${id}`
  };
}

/**
 * Build a billing cycle record stub
 */
function makeCycleRecord(isUserEntered) {
  return {
    id: 1,
    payment_method_id: 1,
    cycle_start_date: '2024-01-01',
    cycle_end_date: '2024-01-31',
    actual_statement_balance: isUserEntered ? 500 : null,
    calculated_statement_balance: 480,
    is_user_entered: isUserEntered ? 1 : 0
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ReminderService.getBillingCycleReminders — Property 1: billing cycle reminder correctness', () => {
  const reminderService = require('./reminderService');

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: calculatePreviousCycleDates returns a fixed cycle window
    statementBalanceService.calculatePreviousCycleDates.mockReturnValue({
      startDate: '2024-01-01',
      endDate: '2024-01-31'
    });
  });

  // ── Property 1a: No DB record → cycleNotYetGenerated, excluded from reminders ──

  it('Property 1a: when no DB record exists, card is excluded from cardsNeedingEntry', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 28 }), // billing cycle day
        fc.integer({ min: 1, max: 1000 }), // card id
        async (billingCycleDay, cardId) => {
          billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([
            makeCard(cardId, billingCycleDay)
          ]);
          billingCycleRepository.findByPaymentMethodAndCycleEnd.mockResolvedValue(null);

          const result = await reminderService.getBillingCycleReminders(new Date('2024-02-15'));

          // Card must NOT appear in cardsNeedingEntry
          expect(result.cardsNeedingEntry).toHaveLength(0);
          expect(result.needsEntryCount).toBe(0);

          // Card should appear in allCards with correct flags
          expect(result.allCards).toHaveLength(1);
          const card = result.allCards[0];
          expect(card.needsEntry).toBe(false);
          expect(card.hasEntry).toBe(false);
          expect(card.cycleNotYetGenerated).toBe(true);
        }
      ),
      pbtOptions()
    );
  });

  // ── Property 1b: Record exists, is_user_entered=0 → needsEntry=true ──────────

  it('Property 1b: when record exists with is_user_entered=0, card appears in cardsNeedingEntry', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 1, max: 1000 }),
        async (billingCycleDay, cardId) => {
          billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([
            makeCard(cardId, billingCycleDay)
          ]);
          billingCycleRepository.findByPaymentMethodAndCycleEnd.mockResolvedValue(
            makeCycleRecord(false)
          );

          const result = await reminderService.getBillingCycleReminders(new Date('2024-02-15'));

          expect(result.cardsNeedingEntry).toHaveLength(1);
          expect(result.needsEntryCount).toBe(1);

          const card = result.cardsNeedingEntry[0];
          expect(card.needsEntry).toBe(true);
          expect(card.hasEntry).toBe(false);
          expect(card.cycleNotYetGenerated).toBe(false);
        }
      ),
      pbtOptions()
    );
  });

  // ── Property 1c: Record exists, is_user_entered=1 → hasEntry=true, excluded ──

  it('Property 1c: when record exists with is_user_entered=1, card is excluded from cardsNeedingEntry', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 1, max: 1000 }),
        async (billingCycleDay, cardId) => {
          billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([
            makeCard(cardId, billingCycleDay)
          ]);
          billingCycleRepository.findByPaymentMethodAndCycleEnd.mockResolvedValue(
            makeCycleRecord(true)
          );

          const result = await reminderService.getBillingCycleReminders(new Date('2024-02-15'));

          expect(result.cardsNeedingEntry).toHaveLength(0);
          expect(result.needsEntryCount).toBe(0);

          const card = result.allCards[0];
          expect(card.needsEntry).toBe(false);
          expect(card.hasEntry).toBe(true);
          expect(card.cycleNotYetGenerated).toBe(false);
        }
      ),
      pbtOptions()
    );
  });

  // ── Property 1d: needsEntryCount always equals cardsNeedingEntry.length ──────

  it('Property 1d: needsEntryCount always equals cardsNeedingEntry.length', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            billingCycleDay: fc.integer({ min: 1, max: 28 }),
            cardId: fc.integer({ min: 1, max: 1000 }),
            // 0 = no record, 1 = auto-generated, 2 = user-entered
            recordState: fc.integer({ min: 0, max: 2 })
          }),
          { minLength: 0, maxLength: 5 }
        ),
        async (cards) => {
          // Deduplicate card IDs
          const uniqueCards = cards.filter(
            (c, i, arr) => arr.findIndex(x => x.cardId === c.cardId) === i
          );

          billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue(
            uniqueCards.map(c => makeCard(c.cardId, c.billingCycleDay))
          );

          billingCycleRepository.findByPaymentMethodAndCycleEnd.mockImplementation(
            (cardId) => {
              const card = uniqueCards.find(c => c.cardId === cardId);
              if (!card || card.recordState === 0) return Promise.resolve(null);
              return Promise.resolve(makeCycleRecord(card.recordState === 2));
            }
          );

          const result = await reminderService.getBillingCycleReminders(new Date('2024-02-15'));

          // Invariant: count always matches array length
          expect(result.needsEntryCount).toBe(result.cardsNeedingEntry.length);
          // Invariant: allCards contains all non-null results
          expect(result.allCards.length).toBeLessThanOrEqual(uniqueCards.length);
        }
      ),
      pbtOptions()
    );
  });

  // ── Property 1e: DB failure per card → card skipped, others unaffected ───────

  it('Property 1e: DB failure for one card does not affect other cards', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 28 }),
        async (billingCycleDay) => {
          const cards = [
            makeCard(1, billingCycleDay),
            makeCard(2, billingCycleDay),
            makeCard(3, billingCycleDay)
          ];

          billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue(cards);

          // Card 1: DB failure
          // Card 2: no record (cycleNotYetGenerated)
          // Card 3: auto-generated record (needsEntry)
          billingCycleRepository.findByPaymentMethodAndCycleEnd.mockImplementation((cardId) => {
            if (cardId === 1) return Promise.reject(new Error('DB connection lost'));
            if (cardId === 2) return Promise.resolve(null);
            return Promise.resolve(makeCycleRecord(false));
          });

          const result = await reminderService.getBillingCycleReminders(new Date('2024-02-15'));

          // Card 1 skipped (null filtered out)
          // Card 2 not in cardsNeedingEntry (cycleNotYetGenerated)
          // Card 3 in cardsNeedingEntry
          expect(result.needsEntryCount).toBe(1);
          expect(result.cardsNeedingEntry[0].paymentMethodId).toBe(3);

          // allCards has 2 entries (card 1 was skipped)
          expect(result.allCards).toHaveLength(2);
        }
      ),
      pbtOptions()
    );
  });
});
