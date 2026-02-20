'use strict';

/**
 * Unit tests: getBillingCycleReminders edge cases
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4
 */

jest.mock('../repositories/billingCycleRepository');
jest.mock('../repositories/reminderRepository');
jest.mock('../repositories/fixedExpenseRepository');
jest.mock('../repositories/loanPaymentRepository');
jest.mock('./statementBalanceService');
jest.mock('./activityLogService');

const billingCycleRepository = require('../repositories/billingCycleRepository');
const statementBalanceService = require('./statementBalanceService');
const reminderService = require('./reminderService');

const REF_DATE = new Date('2024-02-15T12:00:00Z');

function makeCard(id, billingCycleDay = 15) {
  return { id, billing_cycle_day: billingCycleDay, display_name: `Card ${id}`, full_name: `Full ${id}` };
}

function makeCycleRecord(isUserEntered) {
  return {
    id: 99,
    payment_method_id: 1,
    cycle_start_date: '2024-01-15',
    cycle_end_date: '2024-02-14',
    actual_statement_balance: isUserEntered ? 300 : 0,
    calculated_statement_balance: 280,
    is_user_entered: isUserEntered ? 1 : 0
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  statementBalanceService.calculatePreviousCycleDates.mockReturnValue({
    startDate: '2024-01-15',
    endDate: '2024-02-14'
  });
});

describe('getBillingCycleReminders', () => {
  describe('Req 1.2 — no DB record: card excluded from reminders', () => {
    it('returns needsEntry=false and cycleNotYetGenerated=true when no record exists', async () => {
      billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([makeCard(1)]);
      billingCycleRepository.findByPaymentMethodAndCycleEnd.mockResolvedValue(null);

      const result = await reminderService.getBillingCycleReminders(REF_DATE);

      expect(result.needsEntryCount).toBe(0);
      expect(result.cardsNeedingEntry).toHaveLength(0);
      expect(result.allCards[0]).toMatchObject({
        needsEntry: false,
        hasEntry: false,
        cycleNotYetGenerated: true
      });
    });

    it('hasCardsWithBillingCycle is true even when no record exists', async () => {
      billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([makeCard(1)]);
      billingCycleRepository.findByPaymentMethodAndCycleEnd.mockResolvedValue(null);

      const result = await reminderService.getBillingCycleReminders(REF_DATE);

      expect(result.hasCardsWithBillingCycle).toBe(true);
    });
  });

  describe('Req 1.3 — auto-generated record: card needs entry', () => {
    it('returns needsEntry=true when record exists with is_user_entered=0', async () => {
      billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([makeCard(1)]);
      billingCycleRepository.findByPaymentMethodAndCycleEnd.mockResolvedValue(makeCycleRecord(false));

      const result = await reminderService.getBillingCycleReminders(REF_DATE);

      expect(result.needsEntryCount).toBe(1);
      expect(result.cardsNeedingEntry[0]).toMatchObject({
        needsEntry: true,
        hasEntry: false,
        cycleNotYetGenerated: false
      });
    });
  });

  describe('Req 1.3 — user-entered record: no reminder', () => {
    it('returns needsEntry=false and hasEntry=true when record is user-entered', async () => {
      billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([makeCard(1)]);
      billingCycleRepository.findByPaymentMethodAndCycleEnd.mockResolvedValue(makeCycleRecord(true));

      const result = await reminderService.getBillingCycleReminders(REF_DATE);

      expect(result.needsEntryCount).toBe(0);
      expect(result.cardsNeedingEntry).toHaveLength(0);
      expect(result.allCards[0]).toMatchObject({
        needsEntry: false,
        hasEntry: true,
        cycleNotYetGenerated: false
      });
    });
  });

  describe('Req 1.4 — DB failure: card skipped gracefully', () => {
    it('skips a card when findByPaymentMethodAndCycleEnd throws', async () => {
      billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([makeCard(1)]);
      billingCycleRepository.findByPaymentMethodAndCycleEnd.mockRejectedValue(
        new Error('SQLITE_BUSY')
      );

      const result = await reminderService.getBillingCycleReminders(REF_DATE);

      // Card is skipped (null filtered out), no throw
      expect(result.needsEntryCount).toBe(0);
      expect(result.allCards).toHaveLength(0);
    });

    it('processes remaining cards when one card DB query fails', async () => {
      billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([
        makeCard(1),
        makeCard(2),
        makeCard(3)
      ]);

      billingCycleRepository.findByPaymentMethodAndCycleEnd.mockImplementation((cardId) => {
        if (cardId === 2) return Promise.reject(new Error('DB error'));
        if (cardId === 1) return Promise.resolve(null);           // cycleNotYetGenerated
        return Promise.resolve(makeCycleRecord(false));           // needsEntry
      });

      const result = await reminderService.getBillingCycleReminders(REF_DATE);

      // Card 2 skipped, card 1 not in needsEntry, card 3 in needsEntry
      expect(result.allCards).toHaveLength(2);
      expect(result.needsEntryCount).toBe(1);
      expect(result.cardsNeedingEntry[0].paymentMethodId).toBe(3);
    });
  });

  describe('empty state', () => {
    it('returns zero counts when no credit cards have billing cycle configured', async () => {
      billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([]);

      const result = await reminderService.getBillingCycleReminders(REF_DATE);

      expect(result.needsEntryCount).toBe(0);
      expect(result.hasCardsWithBillingCycle).toBe(false);
      expect(result.cardsNeedingEntry).toHaveLength(0);
      expect(result.allCards).toHaveLength(0);
    });
  });

  describe('cycle date fields', () => {
    it('includes cycleStartDate and cycleEndDate from calculatePreviousCycleDates', async () => {
      billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([makeCard(1)]);
      billingCycleRepository.findByPaymentMethodAndCycleEnd.mockResolvedValue(makeCycleRecord(false));

      const result = await reminderService.getBillingCycleReminders(REF_DATE);

      expect(result.cardsNeedingEntry[0]).toMatchObject({
        cycleStartDate: '2024-01-15',
        cycleEndDate: '2024-02-14'
      });
    });
  });
});
