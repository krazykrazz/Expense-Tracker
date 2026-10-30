const allocationRepository = require('../repositories/allocationRepository');
const investmentRepository = require('../repositories/investmentRepository');
const activityLogService = require('./activityLogService');
const { parseYearMonth } = require('../utils/validators');
const { loadWithCarryForward, copyRows } = require('../utils/monthlyRows');

const MAX_NAME_LENGTH = 100;

const round2 = (n) => Math.round(n * 100) / 100;
const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const formatAmount = (amount) => `$${amount.toFixed(2)}`;

/**
 * Planned monthly savings/investment amounts (RRSP, TFSA, emergency fund, ...).
 * Allocations are plan-only: they are not expenses and never count as spending.
 */
class AllocationService {
  /**
   * Validate and normalise user input.
   * A linked investment account supplies the name when none is given.
   * @returns {Promise<{name: string, amount: number, investmentId: (number|null)}>}
   */
  async _normalize({ name, amount, investmentId }) {
    const amountNum = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (typeof amountNum !== 'number' || !Number.isFinite(amountNum) || amountNum <= 0) {
      throw fail('Allocation amount must be a positive number greater than zero', 400);
    }

    let linkedId = null;
    let linkedName = null;
    if (investmentId !== undefined && investmentId !== null && investmentId !== '') {
      linkedId = parseInt(investmentId);
      const investment = Number.isNaN(linkedId) ? null : await investmentRepository.findById(linkedId);
      if (!investment) {
        throw fail('Linked investment account not found', 400);
      }
      linkedName = investment.name;
    }

    const trimmed = typeof name === 'string' ? name.trim() : '';
    const finalName = trimmed || linkedName;
    if (!finalName) {
      throw fail('Allocation name is required', 400);
    }
    if (finalName.length > MAX_NAME_LENGTH) {
      throw fail(`Allocation name must be at most ${MAX_NAME_LENGTH} characters`, 400);
    }

    return { name: finalName, amount: round2(amountNum), investmentId: linkedId };
  }

  _rethrowDuplicate(err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      throw fail('An allocation with this name already exists for this month', 409);
    }
    throw err;
  }

  /**
   * Allocations for a month. An empty month shows the previous month's allocations
   * as transient rows (`carriedForward: true`, no id) without persisting them.
   * @returns {Promise<Array>}
   */
  async getAllocations(year, month) {
    const parsed = parseYearMonth(year, month);
    return loadWithCarryForward(
      (y, m) => allocationRepository.findByYearMonth(y, m),
      parsed.year,
      parsed.month,
      ({ name, amount, investmentId }) => ({ name, amount, investmentId })
    );
  }

  /**
   * @returns {Promise<number>} total planned allocations for the month (carry-forward aware)
   */
  async getAllocationTotal(year, month) {
    const allocations = await this.getAllocations(year, month);
    return round2(allocations.reduce((sum, allocation) => sum + allocation.amount, 0));
  }

  async createAllocation(year, month, data, tabId = null) {
    const parsed = parseYearMonth(year, month);
    const normalized = await this._normalize(data);

    let created;
    try {
      created = await allocationRepository.create({ ...parsed, ...normalized });
    } catch (err) {
      this._rethrowDuplicate(err);
    }

    await activityLogService.logEvent(
      'budget_allocation_added',
      'budget',
      created.id,
      `Added allocation: ${created.name} - ${formatAmount(created.amount)}`,
      { name: created.name, amount: created.amount, year: parsed.year, month: parsed.month, tabId }
    );

    return created;
  }

  async updateAllocation(id, data, tabId = null) {
    const existing = await allocationRepository.findById(id);
    if (!existing) {
      throw fail('Allocation not found', 404);
    }

    const normalized = await this._normalize({
      name: data.name ?? existing.name,
      amount: data.amount ?? existing.amount,
      investmentId: data.investmentId === undefined ? existing.investmentId : data.investmentId
    });

    let updated;
    try {
      updated = await allocationRepository.update(id, normalized);
    } catch (err) {
      this._rethrowDuplicate(err);
    }

    const changes = [];
    if (existing.name !== updated.name) changes.push(`name: ${existing.name} → ${updated.name}`);
    if (existing.amount !== updated.amount) {
      changes.push(`amount: ${formatAmount(existing.amount)} → ${formatAmount(updated.amount)}`);
    }

    await activityLogService.logEvent(
      'budget_allocation_updated',
      'budget',
      updated.id,
      `Updated allocation: ${updated.name} - ${formatAmount(updated.amount)}${changes.length ? ` (${changes.join(', ')})` : ''}`,
      { name: updated.name, amount: updated.amount, changes, tabId }
    );

    return updated;
  }

  async deleteAllocation(id, tabId = null) {
    const existing = await allocationRepository.findById(id);
    if (!existing || !(await allocationRepository.delete(id))) {
      throw fail('Allocation not found', 404);
    }

    await activityLogService.logEvent(
      'budget_allocation_deleted',
      'budget',
      id,
      `Deleted allocation: ${existing.name} - ${formatAmount(existing.amount)}`,
      { name: existing.name, amount: existing.amount, tabId }
    );

    return true;
  }

  /**
   * Copy a month's allocations (as the user sees them, including carried-forward ones)
   * into another month. Existing allocations are kept unless overwrite is set.
   * @returns {Promise<{copied: number, skipped: number, overwritten: number}>}
   */
  async copyAllocations(sourceYear, sourceMonth, targetYear, targetMonth, overwrite = false) {
    const source = parseYearMonth(sourceYear, sourceMonth);
    const target = parseYearMonth(targetYear, targetMonth);

    const [sourceRows, existingRows] = await Promise.all([
      this.getAllocations(source.year, source.month),
      allocationRepository.findByYearMonth(target.year, target.month)
    ]);

    return copyRows({
      sourceRows,
      existingRows,
      keyOf: allocation => allocation.name,
      create: allocation => allocationRepository.create({
        ...target,
        name: allocation.name,
        amount: allocation.amount,
        investmentId: allocation.investmentId
      }),
      update: (existing, allocation) => allocationRepository.update(existing.id, {
        name: existing.name,
        amount: allocation.amount,
        investmentId: allocation.investmentId
      }),
      overwrite
    });
  }
}

module.exports = new AllocationService();
