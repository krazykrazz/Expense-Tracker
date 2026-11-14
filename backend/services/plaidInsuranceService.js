const plaidRepository = require('../repositories/plaidRepository');
const plaidInsuranceRepository = require('../repositories/plaidInsuranceRepository');
const { INSURANCE_TYPE } = require('../repositories/plaidInsuranceRepository');
const activityLogService = require('./activityLogService');
const dbHelper = require('../utils/dbHelper');
const { toCents, round2 } = require('../utils/money');
const { shiftDate, transactionDate, isDeposit, descriptionKey } = require('../utils/plaidMatching');
const {
  OPEN_STATUSES, expectedPayout, paidWithoutBank, outsideBankForFirstDeposit, rankClaims, prefillSplit,
  outOfPocketAfter, claimBaseline, peopleAfter
} = require('../utils/insuranceReimbursement');
const { fail, defaultPlace, money, describeTxn, exclusive, requireNew, logReview } = require('./plaidInboxSupport');

/** Claims from this many days before the deposit (up to its date) are candidates. */
const CLAIM_WINDOW_DAYS = 180;
const CLAIM_STATUSES = [...OPEN_STATUSES, 'paid'];
const CHANGED = 'This bank transaction changed meanwhile. Refresh the Inbox and try again.';

const STATUS_LABELS = { not_claimed: 'Not claimed', in_progress: 'In progress', paid: 'Paid', denied: 'Denied' };
const statusLabel = (status) => STATUS_LABELS[status] || 'None';

const parseSnapshotPeople = (json) => {
  try {
    const parsed = JSON.parse(json || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** A claim row (plaidInsuranceRepository CLAIM_SELECT) with its before-the-bank baseline. */
function withBaseline(row) {
  const baseline = claimBaseline(row);
  const snapshotPeople = row.linkCount > 0 ? parseSnapshotPeople(row.firstPreviousPeople) : null;
  return { ...row, baseline, snapshotPeople };
}

/** The deposit's amount (positive dollars), date and description. */
const depositOf = (txn) => ({
  id: txn.id, amount: round2(Math.abs(txn.amount)), date: transactionDate(txn), name: defaultPlace(txn)
});

/** A settled deposit into a mapped (chequing or savings) account. */
function requireDeposit(txn) {
  if (!isDeposit(txn) || !txn.paymentMethodId) {
    throw fail('Only a settled deposit into a mapped bank account can be applied to insurance claims', 400);
  }
}

const hasTwoDecimalsAtMost = (amount) => Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;

/**
 * Insurer deposits applied to medical insurance claims (spec 3.7): one deposit can reimburse several claims and a
 * claim can be reimbursed by several deposits. Each claim's out-of-pocket becomes its original cost minus
 * everything reimbursed so far, the claim is Paid and each person's share is recomputed; the earliest link of a
 * claim keeps the claim as it was before the bank, so undoing the last deposit restores it exactly.
 */
class PlaidInsuranceService {
  /**
   * Claims a deposit can reimburse, best first, with the amounts to pre-fill.
   * @param {number} id bank transaction id
   * @param {{includePaid?: boolean}} options Paid claims with a co-pay left are only listed on request
   */
  async candidates(id, { includePaid = false } = {}) {
    const txn = await requireNew(id, { settled: true });
    requireDeposit(txn);
    const deposit = depositOf(txn);

    const rows = (await plaidInsuranceRepository.findCandidateClaims(shiftDate(deposit.date, -CLAIM_WINDOW_DAYS), deposit.date))
      .map(withBaseline);
    // Paid claims are listed on request, except one marked Paid by hand that this deposit fits exactly (marked
    // ahead of the payout, or a second plan paying its co-pay)
    const cents = toCents(deposit.amount);
    const fitsPaidByHand = (row) => paidWithoutBank(row)
      && (toCents(expectedPayout({ ...row, originalCost: row.baseline.original })) === cents || toCents(row.outOfPocket) === cents);
    const shown = includePaid ? rows : rows.filter(row => row.claimStatus !== 'paid' || fitsPaidByHand(row));
    const people = await plaidInsuranceRepository.findPeopleForExpenses(shown.map(row => row.expenseId));

    const ranked = rankClaims(deposit.amount, shown.map(row => ({
      expenseId: row.expenseId,
      date: row.date,
      place: row.place,
      claimStatus: row.claimStatus,
      originalCost: row.baseline.original,
      outOfPocket: row.outOfPocket,
      reimbursed: row.reimbursed,
      unreimbursed: row.baseline.unreimbursed,
      linkCount: row.linkCount,
      paidWithoutBank: paidWithoutBank(row),
      people: (people.get(row.expenseId) || []).map(({ personId, name, originalAmount, amount }) => ({ personId, name, originalAmount, amount }))
    })));

    const exact = ranked.find(claim => claim.rank === 'exact');
    const combination = ranked.filter(claim => claim.rank === 'combination');
    let suggestion = null;
    if (exact) suggestion = prefillSplit(deposit.amount, [exact]);
    else if (combination.length > 0) suggestion = prefillSplit(deposit.amount, combination);

    return {
      deposit,
      candidates: ranked,
      suggestion,
      paidAvailable: includePaid ? 0 : rows.length - shown.length
    };
  }

  /**
   * `insurance: { suggested }` for each deposit in the Inbox listing: suggested when its bank description was
   * applied to insurance before, or an open claim's expected payout equals it exactly.
   * @param {Array} rows inbox rows (plaidRepository.findInbox)
   * @returns {Promise<Map<number, {suggested: boolean}>>} keyed by row id, deposits only
   */
  async describeDeposits(rows) {
    const result = new Map();
    const deposits = rows.filter(row => isDeposit(row) && row.paymentMethodId);
    if (deposits.length === 0) return result;

    const dates = deposits.map(transactionDate).sort();
    const [learned, claims] = await Promise.all([
      plaidInsuranceRepository.findLearnedInsuranceKeys(),
      plaidInsuranceRepository.findCandidateClaims(shiftDate(dates[0], -CLAIM_WINDOW_DAYS), dates[dates.length - 1])
    ]);
    const open = claims
      .filter(claim => OPEN_STATUSES.includes(claim.claimStatus) || paidWithoutBank(claim))
      .flatMap(claim => {
        const payout = toCents(expectedPayout({ ...claim, originalCost: claimBaseline(claim).original }));
        const coPay = paidWithoutBank(claim) ? toCents(claim.outOfPocket) : 0;
        return [payout, coPay].filter(cents => cents > 0).map(cents => ({ date: claim.date, payout: cents }));
      });

    for (const row of deposits) {
      const date = transactionDate(row);
      const from = shiftDate(date, -CLAIM_WINDOW_DAYS);
      const cents = Math.abs(toCents(row.amount));
      const suggested = learned.has(descriptionKey(row))
        || open.some(claim => claim.payout === cents && claim.date >= from && claim.date <= date);
      result.set(row.id, { suggested });
    }
    return result;
  }

  /**
   * Apply a deposit to claims: the amounts must add up to the deposit to the cent. All claims, links and the
   * deposit's status commit together.
   * @param {number} id bank transaction id
   * @param {Array<{expenseId: number, amount: number}>} claims
   */
  async apply(id, claims, tabId = null) {
    return exclusive(id, async () => {
      const txn = await requireNew(id, { settled: true });
      requireDeposit(txn);
      const deposit = depositOf(txn);
      const wanted = this._parseClaims(claims, deposit.amount);

      const applied = await dbHelper.runInTransaction(async (tx) => {
        const ids = wanted.map(claim => claim.expenseId);
        const rows = new Map((await plaidInsuranceRepository.findClaimsByIds(ids, tx)).map(row => [row.expenseId, withBaseline(row)]));
        // A claim's first deposit decides what it had been reimbursed outside the bank (see outsideBankForFirstDeposit)
        const outsideBank = new Map();
        for (const { expenseId, amount } of wanted) {
          const row = rows.get(expenseId);
          if (!row) throw fail(`Expense ${expenseId} not found`, 404);
          if (row.insuranceEligible !== 1 || row.type !== INSURANCE_TYPE || !CLAIM_STATUSES.includes(row.claimStatus)) {
            throw fail(`"${row.place || 'Expense'}" (${row.date}) is not an insurance claim that can be reimbursed`, 400);
          }
          const outside = paidWithoutBank(row)
            ? outsideBankForFirstDeposit({ originalCost: row.baseline.original, outOfPocket: row.outOfPocket }, amount)
            : row.baseline.outsideBank;
          outsideBank.set(expenseId, outside);
          const left = toCents(row.baseline.original) - toCents(outside) - toCents(row.reimbursed);
          if (toCents(amount) > left) {
            throw fail(`"${row.place || 'Expense'}" (${row.date}) has at most ${money(Math.max(0, left / 100))} left to reimburse`, 400);
          }
        }
        const people = await plaidInsuranceRepository.findPeopleForExpenses(ids, tx);

        if (!(await plaidInsuranceRepository.markDepositMatched(tx, id))) {
          throw fail(CHANGED, 409);
        }

        const results = [];
        for (const { expenseId, amount } of wanted) {
          const row = rows.get(expenseId);
          const claimPeople = people.get(expenseId) || [];
          await plaidInsuranceRepository.insertLink(tx, {
            transactionId: id,
            expenseId,
            amount,
            previousAmount: row.outOfPocket,
            previousStatus: row.claimStatus,
            previousPeople: claimPeople.map(({ personId, amount: personAmount }) => ({ personId, amount: personAmount })),
            outsideBank: outsideBank.get(expenseId)
          });
          const snapshotPeople = row.snapshotPeople ?? claimPeople.map(({ personId, amount: a }) => ({ personId, amount: a }));
          const after = await this._recompute(tx, row, toCents(row.reimbursed) + toCents(amount), claimPeople, snapshotPeople, outsideBank.get(expenseId));
          results.push({ ...this._summary(row, after), amount });
        }
        return results;
      });

      await logReview(txn, 'insurance',
        `Applied bank deposit ${describeTxn(txn)} to ${applied.length} insurance claim${applied.length === 1 ? '' : 's'}`,
        { claims: applied.map(({ expenseId, amount }) => ({ expenseId, amount })) });
      for (const claim of applied) {
        await this._logClaimUpdated(claim, `reimbursed ${money(claim.amount)} by bank deposit`, tabId);
      }
      return { transaction: await plaidRepository.findTransactionById(id), deposit, claims: applied };
    });
  }

  /**
   * Undo apply: remove the deposit's links and send it back to the Inbox. Each claim is recomputed from the
   * deposits still linked to it, or restored to its state before the bank when none is left.
   */
  async unlink(id, tabId = null) {
    return exclusive(id, async () => {
      const txn = await plaidRepository.findTransactionById(id);
      if (!txn) throw fail('Bank transaction not found', 404);
      const links = await plaidInsuranceRepository.findLinksForDeposit(id);
      if (links.length === 0) throw fail('This bank transaction is not applied to insurance claims', 404);
      if (txn.status !== 'matched') throw fail(`Bank transaction is ${txn.status}, not applied to insurance claims`, 409);

      const restored = await dbHelper.runInTransaction(async (tx) => {
        const current = await plaidInsuranceRepository.findLinksForDeposit(id, tx);
        if (current.length === 0) throw fail(CHANGED, 409);
        const ids = current.map(link => link.expenseId);
        const before = new Map((await plaidInsuranceRepository.findClaimsByIds(ids, tx)).map(row => [row.expenseId, withBaseline(row)]));

        // The claim's earliest link holds its before-the-bank snapshot: hand it on to the next one
        const snapshots = new Map();
        for (const link of current) {
          const claimLinks = await plaidInsuranceRepository.findLinksForClaim(link.expenseId, tx);
          const remaining = claimLinks.filter(other => other.plaidTransactionId !== id);
          snapshots.set(link.expenseId, claimLinks[0]);
          if (claimLinks[0].id === link.id && remaining.length > 0) {
            await plaidInsuranceRepository.updateLinkSnapshot(tx, remaining[0].id, claimLinks[0]);
          }
        }
        await plaidInsuranceRepository.deleteLinksForDeposit(tx, id);

        const rows = new Map((await plaidInsuranceRepository.findClaimsByIds(ids, tx)).map(row => [row.expenseId, withBaseline(row)]));
        const people = await plaidInsuranceRepository.findPeopleForExpenses(ids, tx);
        const results = [];
        for (const link of current) {
          const row = rows.get(link.expenseId);
          const claimPeople = people.get(link.expenseId) || [];
          const snapshot = snapshots.get(link.expenseId);
          const snapshotPeople = parseSnapshotPeople(snapshot.previousPeople);
          let after;
          if (row.linkCount > 0) {
            after = await this._recompute(tx, row, toCents(row.reimbursed), claimPeople, snapshotPeople);
          } else {
            await plaidInsuranceRepository.updateClaim(tx, row.expenseId, snapshot.previousAmount, snapshot.previousStatus);
            for (const person of snapshotPeople) {
              await plaidInsuranceRepository.updatePersonAmount(tx, row.expenseId, person.personId, person.amount);
            }
            after = { outOfPocket: snapshot.previousAmount, claimStatus: snapshot.previousStatus, people: snapshotPeople };
          }
          results.push({ ...this._summary(before.get(link.expenseId), after), amount: link.amount });
        }

        if (!(await plaidInsuranceRepository.markDepositNew(tx, id))) {
          throw fail(CHANGED, 409);
        }
        return results;
      });

      await logReview(txn, 'insurance_undone',
        `Undid bank deposit ${describeTxn(txn)} on ${restored.length} insurance claim${restored.length === 1 ? '' : 's'}`,
        { claims: restored.map(({ expenseId, amount }) => ({ expenseId, amount })) });
      for (const claim of restored) {
        await this._logClaimUpdated(claim, `bank reimbursement of ${money(claim.amount)} undone`, tabId);
      }
      return { transaction: await plaidRepository.findTransactionById(id), claims: restored };
    });
  }

  /**
   * Validate the requested split: at least one claim, each once, amounts above $0 in cents, adding up to the deposit.
   * @returns {Array<{expenseId: number, amount: number}>}
   */
  _parseClaims(claims, depositAmount) {
    if (!Array.isArray(claims) || claims.length === 0) {
      throw fail('Pick at least one insurance claim', 400);
    }
    const seen = new Set();
    const parsed = claims.map((claim) => {
      const expenseId = Number(claim && claim.expenseId);
      const amount = Number(claim && claim.amount);
      if (!Number.isInteger(expenseId) || expenseId <= 0) {
        throw fail('Each claim needs a valid expenseId', 400);
      }
      if (seen.has(expenseId)) {
        throw fail('Each claim can only be picked once', 400);
      }
      seen.add(expenseId);
      if (!Number.isFinite(amount) || amount <= 0 || !hasTwoDecimalsAtMost(amount)) {
        throw fail('Each reimbursed amount must be above $0.00, in dollars and cents', 400);
      }
      return { expenseId, amount: round2(amount) };
    });
    const total = parsed.reduce((sum, claim) => sum + toCents(claim.amount), 0);
    if (total !== toCents(depositAmount)) {
      throw fail(`The amounts add up to ${money(total / 100)} but the deposit is ${money(depositAmount)}`, 400);
    }
    return parsed;
  }

  /**
   * Write a claim's out-of-pocket, Paid status and people amounts for `bankCents` reimbursed by deposits.
   * People without an original amount are shared on their amount before the bank (the snapshot).
   */
  async _recompute(conn, row, bankCents, claimPeople, snapshotPeople, outsideBank = row.baseline.outsideBank) {
    const total = outsideBank + bankCents / 100;
    const outOfPocket = outOfPocketAfter(row.baseline.original, total);
    const before = new Map(snapshotPeople.map(person => [person.personId, person.amount]));
    const people = peopleAfter(claimPeople.map(person => ({
      personId: person.personId,
      amount: person.amount,
      originalAmount: person.originalAmount ?? before.get(person.personId) ?? person.amount
    })), row.baseline.original, total).map(({ personId, amount }) => ({ personId, amount }));

    await plaidInsuranceRepository.updateClaim(conn, row.expenseId, outOfPocket, 'paid');
    for (const person of people) {
      await plaidInsuranceRepository.updatePersonAmount(conn, row.expenseId, person.personId, person.amount);
    }
    return { outOfPocket, claimStatus: 'paid', people };
  }

  _summary(row, after) {
    return {
      expenseId: row.expenseId,
      place: row.place,
      date: row.date,
      type: row.type,
      method: row.method,
      previousOutOfPocket: row.outOfPocket,
      outOfPocket: after.outOfPocket,
      previousStatus: row.claimStatus,
      claimStatus: after.claimStatus,
      people: after.people
    };
  }

  /** expense_updated (and insurance_status_changed), as expenseService logs a hand edit, so other tabs refresh. */
  async _logClaimUpdated(claim, reason, tabId) {
    const changes = [reason];
    if (toCents(claim.previousOutOfPocket) !== toCents(claim.outOfPocket)) {
      changes.push(`amount: $${Number(claim.previousOutOfPocket).toFixed(2)} → $${Number(claim.outOfPocket).toFixed(2)}`);
    }
    if (claim.previousStatus !== claim.claimStatus) {
      changes.push(`claim status: ${statusLabel(claim.previousStatus)} → ${statusLabel(claim.claimStatus)}`);
    }
    await activityLogService.logEvent(
      'expense_updated',
      'expense',
      claim.expenseId,
      `Updated expense: ${claim.place || 'Unknown'} - ${Number(claim.outOfPocket).toFixed(2)} on ${claim.date} (${changes.join(', ')})`,
      {
        amount: claim.outOfPocket,
        category: claim.type,
        date: claim.date,
        place: claim.place,
        method: claim.method,
        changes,
        tabId
      }
    );
    if (claim.previousStatus !== claim.claimStatus) {
      await activityLogService.logEvent(
        'insurance_status_changed',
        'expense',
        claim.expenseId,
        `Insurance status changed: ${claim.previousStatus || 'None'} → ${claim.claimStatus || 'None'} (${claim.place || 'Unknown'} - $${Number(claim.outOfPocket).toFixed(2)})`,
        {
          previousStatus: claim.previousStatus || null,
          newStatus: claim.claimStatus || null,
          place: claim.place,
          amount: claim.outOfPocket,
          tabId
        }
      );
    }
  }
}

module.exports = new PlaidInsuranceService();
