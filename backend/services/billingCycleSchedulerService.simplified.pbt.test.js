/**
 * Property-Based Tests for Simplified BillingCycleSchedulerService
 * Feature: billing-cycle-api-optimization
 *
 * Tests universal correctness properties of the current-date-only scheduler model.
 *
 * @invariant The simplified scheduler processes only the current business date
 * as determined by TimeBoundaryService, never iterating over multiple dates.
 */

const fc = require('fast-check');
const { pbtOptions } = require('../test/pbtArbitraries');

// Support FAST_PBT=true for reduced iterations
const fastPbt = process.env.FAST_PBT === 'true';
const getPbtOptions = (overrides = {}) => pbtOptions({
  numRuns: fastPbt ? 10 : undefined,
  ...overrides
});

jest.mock('./activityLogService');
jest.mock('./timeBoundaryService');
jest.mock('./cycleGenerationService');
jest.mock('../repositories/billingCycleRepository');
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const billingCycleSchedulerService = require('./billingCycleSchedulerService');
const billingCycleRepository = require('../repositories/billingCycleRepository');
const cycleGenerationService = require('./cycleGenerationService');
const activityLogService = require('./activityLogService');
const timeBoundaryService = require('./timeBoundaryService');

describe('BillingCycleSchedulerService - Simplified PBT', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    billingCycleSchedulerService.isRunning = false;

    // Default mocks
    activityLogService.logEvent.mockResolvedValue(undefined);
    billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([]);
    billingCycleRepository.create.mockImplementation(async (data) => ({ id: 1, ...data }));
    cycleGenerationService.getMissingCyclePeriods.mockResolvedValue([]);
    cycleGenerationService.calculateCycleBalance.mockResolvedValue({
      calculatedBalance: 0,
      previousBalance: 0,
      totalExpenses: 0,
      totalPayments: 0
    });
  });

  afterEach(() => {
    billingCycleSchedulerService.isRunning = false;
  });

  // Feature: billing-cycle-api-optimization, Property 1: Scheduler processes only the current business date
  /**
   * Property 1: Scheduler processes only the current business date
   * **Validates: Requirements 1.1, 1.3**
   *
   * For any UTC timestamp, runAutoGeneration SHALL call
   * getCreditCardsNeedingBillingCycleEntry exactly once with a reference date
   * corresponding to the current business date (as determined by
   * TimeBoundaryService.getBusinessDate), and SHALL never iterate over multiple dates.
   */
  test('Property 1: Scheduler processes only the current business date', async () => {
    // Generator: random UTC timestamps across a wide range
    const arbUtcTimestamp = fc.date({
      min: new Date('2020-01-01T00:00:00Z'),
      max: new Date('2030-12-31T23:59:59Z')
    }).filter(d => {
      try { d.toISOString(); return true; } catch { return false; }
    });

    await fc.assert(
      fc.asyncProperty(arbUtcTimestamp, async (utcNow) => {
        jest.clearAllMocks();
        billingCycleSchedulerService.isRunning = false;

        // Derive a deterministic business date from the UTC timestamp.
        // We use Intl.DateTimeFormat to compute what TimeBoundaryService would return.
        const expectedBusinessDate = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Toronto'
        }).format(utcNow);

        const expectedUTCDate = new Date(expectedBusinessDate + 'T05:00:00Z');

        // Mock TimeBoundaryService to return deterministic values
        timeBoundaryService.getBusinessTimezone.mockResolvedValue('America/Toronto');
        timeBoundaryService.getBusinessDate.mockReturnValue(expectedBusinessDate);
        timeBoundaryService.localDateToUTC.mockReturnValue(expectedUTCDate);

        billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([]);
        activityLogService.logEvent.mockResolvedValue(undefined);

        await billingCycleSchedulerService.runAutoGeneration(utcNow);

        // 1. TimeBoundaryService.getBusinessDate called with the exact UTC timestamp
        expect(timeBoundaryService.getBusinessDate).toHaveBeenCalledTimes(1);
        expect(timeBoundaryService.getBusinessDate).toHaveBeenCalledWith(utcNow, 'America/Toronto');

        // 2. getCreditCardsNeedingBillingCycleEntry called exactly once (single date, no iteration)
        expect(billingCycleRepository.getCreditCardsNeedingBillingCycleEntry).toHaveBeenCalledTimes(1);

        // 3. Called with the correct date derived from TimeBoundaryService
        expect(billingCycleRepository.getCreditCardsNeedingBillingCycleEntry).toHaveBeenCalledWith(expectedUTCDate);

        // 4. localDateToUTC called exactly once (single date conversion, no multi-date iteration)
        expect(timeBoundaryService.localDateToUTC).toHaveBeenCalledTimes(1);
        expect(timeBoundaryService.localDateToUTC).toHaveBeenCalledWith(expectedBusinessDate, 'America/Toronto');
      }),
      getPbtOptions()
    );
  });

  // Feature: billing-cycle-api-optimization, Property 2: Scheduler gap recovery produces all missing cycles
  /**
   * Property 2: Scheduler gap recovery produces all missing cycles
   * **Validates: Requirements 1.8**
   *
   * For any credit card with a configured billing_cycle_day and any number of
   * missed billing cycles (1 to N), when the simplified scheduler runs,
   * CycleGenerationService.getMissingCyclePeriods SHALL detect all N missing
   * periods, and the scheduler SHALL attempt to create a cycle record for each one.
   */
  test('Property 2: Scheduler gap recovery produces all missing cycles', async () => {
    // Generator: random gap count between 1 and 12
    const arbGapCount = fc.integer({ min: 1, max: 12 });

    // Generator: a credit card record with a valid billing_cycle_day
    const arbCard = fc.record({
      id: fc.integer({ min: 1, max: 1000 }),
      display_name: fc.string({ minLength: 1, maxLength: 30 }),
      billing_cycle_day: fc.integer({ min: 1, max: 28 })
    });

    await fc.assert(
      fc.asyncProperty(arbGapCount, arbCard, async (gapCount, card) => {
        jest.clearAllMocks();
        billingCycleSchedulerService.isRunning = false;

        // Build N missing periods with valid date ranges
        const missingPeriods = [];
        const baseYear = 2024;
        for (let i = 0; i < gapCount; i++) {
          const month = (i % 12) + 1;
          const startDate = `${baseYear}-${String(month).padStart(2, '0')}-${String(card.billing_cycle_day).padStart(2, '0')}`;
          const endMonth = (month % 12) + 1;
          const endYear = endMonth === 1 ? baseYear + 1 : baseYear;
          const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-${String(card.billing_cycle_day).padStart(2, '0')}`;
          missingPeriods.push({ startDate, endDate });
        }

        const referenceDate = new Date('2025-01-15T05:00:00Z');
        const businessDate = '2025-01-15';

        // Mock TimeBoundaryService
        timeBoundaryService.getBusinessTimezone.mockResolvedValue('America/Toronto');
        timeBoundaryService.getBusinessDate.mockReturnValue(businessDate);
        timeBoundaryService.localDateToUTC.mockReturnValue(referenceDate);

        // Return the single card from the repository query
        billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue([card]);

        // Mock getMissingCyclePeriods to return exactly N periods
        cycleGenerationService.getMissingCyclePeriods.mockResolvedValue(missingPeriods);

        // Mock calculateCycleBalance for each period
        cycleGenerationService.calculateCycleBalance.mockResolvedValue({
          calculatedBalance: 100,
          previousBalance: 0,
          totalExpenses: 100,
          totalPayments: 0
        });

        // Mock create to return a cycle record
        let createCallId = 0;
        billingCycleRepository.create.mockImplementation(async (data) => ({
          id: ++createCallId,
          ...data
        }));

        activityLogService.logEvent.mockResolvedValue(undefined);

        const result = await billingCycleSchedulerService.runAutoGeneration(new Date('2025-01-15T12:00:00Z'));

        // The scheduler SHALL attempt to create a cycle record for each missing period
        expect(billingCycleRepository.create).toHaveBeenCalledTimes(gapCount);

        // Verify getMissingCyclePeriods was called for the card
        expect(cycleGenerationService.getMissingCyclePeriods).toHaveBeenCalledTimes(1);
        expect(cycleGenerationService.getMissingCyclePeriods).toHaveBeenCalledWith(
          card.id,
          card.billing_cycle_day,
          referenceDate,
          24
        );

        // All N cycles should have been generated
        expect(result.generatedCount).toBe(gapCount);
        expect(result.errors).toHaveLength(0);
      }),
      getPbtOptions()
    );
  });

  // Feature: billing-cycle-api-optimization, Property 3: Simplified scheduler output equivalence
  /**
   * Property 3: Simplified scheduler output equivalence
   * **Validates: Requirements 1.10**
   *
   * For all credit cards with configured billing cycle days and for any single
   * business date, the simplified scheduler SHALL produce the same set of billing
   * cycle records (same cycle_start_date, cycle_end_date, and
   * calculated_statement_balance for each) as the current date-driven cursor model
   * would produce when processing that same business date.
   *
   * Model-based approach: We build a reference model that predicts what records
   * the old date-cursor scheduler would create for a single date (it would call
   * getMissingCyclePeriods per card, calculateCycleBalance per period, then create
   * each record). We run the actual simplified scheduler with the same mocked data
   * and verify the created records match the model's prediction exactly.
   */
  test('Property 3: Simplified scheduler output equivalence', async () => {
    // Generator: 1-4 credit cards, each with a valid billing_cycle_day
    const arbCard = fc.record({
      id: fc.integer({ min: 1, max: 1000 }),
      display_name: fc.string({ minLength: 1, maxLength: 20 }),
      billing_cycle_day: fc.integer({ min: 1, max: 28 })
    });
    const arbCards = fc.array(arbCard, { minLength: 1, maxLength: 4 })
      .map(cards => {
        // Ensure unique IDs
        const seen = new Set();
        return cards.filter(c => {
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        });
      })
      .filter(cards => cards.length > 0);

    // Generator: number of missing periods per card (0-6)
    const arbGapCount = fc.integer({ min: 0, max: 6 });

    // Generator: random balance values for each period
    const arbBalance = fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true })
      .map(v => Math.round(v * 100) / 100);

    // Generator: a business date
    const arbBusinessDate = fc.date({
      min: new Date('2023-01-01'),
      max: new Date('2025-12-31')
    }).filter(d => {
      try { d.toISOString(); return true; } catch { return false; }
    });

    await fc.assert(
      fc.asyncProperty(
        arbCards,
        fc.array(arbGapCount, { minLength: 4, maxLength: 4 }),
        fc.array(arbBalance, { minLength: 24, maxLength: 24 }),
        arbBusinessDate,
        async (cards, gapCounts, balances, businessDateObj) => {
          jest.clearAllMocks();
          billingCycleSchedulerService.isRunning = false;

          const businessDateStr = businessDateObj.toISOString().split('T')[0];
          const referenceDate = new Date(businessDateStr + 'T05:00:00Z');

          // Mock TimeBoundaryService
          timeBoundaryService.getBusinessTimezone.mockResolvedValue('America/Toronto');
          timeBoundaryService.getBusinessDate.mockReturnValue(businessDateStr);
          timeBoundaryService.localDateToUTC.mockReturnValue(referenceDate);

          // Build missing periods and balance map per card
          // This is what the old date-cursor model would also receive from
          // getMissingCyclePeriods for the same single date
          const periodsByCard = {};
          const balancesByCard = {};
          let balanceIdx = 0;

          for (let ci = 0; ci < cards.length; ci++) {
            const card = cards[ci];
            const gapCount = gapCounts[ci % gapCounts.length];
            const periods = [];
            const cardBalances = [];

            for (let i = 0; i < gapCount; i++) {
              const month = (i % 12) + 1;
              const startDay = String(card.billing_cycle_day).padStart(2, '0');
              const startDate = `2024-${String(month).padStart(2, '0')}-${startDay}`;
              const endMonth = (month % 12) + 1;
              const endYear = endMonth === 1 ? 2025 : 2024;
              const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-${startDay}`;
              periods.push({ startDate, endDate });
              cardBalances.push(balances[balanceIdx % balances.length]);
              balanceIdx++;
            }

            periodsByCard[card.id] = periods;
            balancesByCard[card.id] = cardBalances;
          }

          // --- Reference Model (what old date-cursor scheduler would produce) ---
          // For a single business date, the old model would:
          // 1. Get cards needing entries for that date
          // 2. For each card, call getMissingCyclePeriods
          // 3. For each missing period, call calculateCycleBalance
          // 4. Create a record with the period dates and calculated balance
          const expectedRecords = [];
          for (const card of cards) {
            const periods = periodsByCard[card.id] || [];
            const cardBals = balancesByCard[card.id] || [];
            for (let i = 0; i < periods.length; i++) {
              expectedRecords.push({
                payment_method_id: card.id,
                cycle_start_date: periods[i].startDate,
                cycle_end_date: periods[i].endDate,
                calculated_statement_balance: cardBals[i],
                actual_statement_balance: 0,
                minimum_payment: null,
                notes: null,
                statement_pdf_path: null
              });
            }
          }

          // --- Set up mocks for the actual scheduler run ---
          billingCycleRepository.getCreditCardsNeedingBillingCycleEntry.mockResolvedValue(cards);

          cycleGenerationService.getMissingCyclePeriods.mockImplementation(
            async (pmId) => periodsByCard[pmId] || []
          );

          // Track which balance to return per card per call
          const balanceCallCounters = {};
          cycleGenerationService.calculateCycleBalance.mockImplementation(
            async (pmId) => {
              if (!balanceCallCounters[pmId]) balanceCallCounters[pmId] = 0;
              const idx = balanceCallCounters[pmId]++;
              const cardBals = balancesByCard[pmId] || [];
              const bal = idx < cardBals.length ? cardBals[idx] : 0;
              return {
                calculatedBalance: bal,
                previousBalance: 0,
                totalExpenses: bal,
                totalPayments: 0
              };
            }
          );

          // Capture all created records
          const createdRecords = [];
          let createId = 0;
          billingCycleRepository.create.mockImplementation(async (data) => {
            createdRecords.push({ ...data });
            return { id: ++createId, ...data };
          });

          activityLogService.logEvent.mockResolvedValue(undefined);

          // --- Run the actual simplified scheduler ---
          const result = await billingCycleSchedulerService.runAutoGeneration(businessDateObj);

          // --- Verify output equivalence ---
          // The simplified scheduler should produce the exact same records
          // as the reference model predicts
          expect(createdRecords.length).toBe(expectedRecords.length);
          expect(result.generatedCount).toBe(expectedRecords.length);
          expect(result.errors).toHaveLength(0);

          // Compare each record field-by-field
          for (let i = 0; i < expectedRecords.length; i++) {
            expect(createdRecords[i].payment_method_id).toBe(expectedRecords[i].payment_method_id);
            expect(createdRecords[i].cycle_start_date).toBe(expectedRecords[i].cycle_start_date);
            expect(createdRecords[i].cycle_end_date).toBe(expectedRecords[i].cycle_end_date);
            expect(createdRecords[i].calculated_statement_balance).toBe(expectedRecords[i].calculated_statement_balance);
            expect(createdRecords[i].actual_statement_balance).toBe(expectedRecords[i].actual_statement_balance);
            expect(createdRecords[i].minimum_payment).toBe(expectedRecords[i].minimum_payment);
            expect(createdRecords[i].notes).toBe(expectedRecords[i].notes);
            expect(createdRecords[i].statement_pdf_path).toBe(expectedRecords[i].statement_pdf_path);
          }
        }
      ),
      getPbtOptions()
    );
  });
});

