const { asyncHandler } = require('../middleware/errorHandler');
const budgetPlanService = require('../services/budgetPlanService');
const allocationService = require('../services/allocationService');

const tabIdOf = (req) => req.headers['x-tab-id'] ?? null;

/**
 * GET /api/budgets/plan?year=2025&month=11
 */
const getBudgetPlan = asyncHandler(async (req, res) => {
  const { year, month } = req.query;
  res.json(await budgetPlanService.getBudgetPlan(year, month));
});

/**
 * GET /api/budgets/allocations?year=2025&month=11
 */
const getAllocations = asyncHandler(async (req, res) => {
  const { year, month } = req.query;
  res.json({ allocations: await allocationService.getAllocations(year, month) });
});

/**
 * POST /api/budgets/allocations
 * Body: { year, month, name, amount, investmentId? }
 */
const createAllocation = asyncHandler(async (req, res) => {
  const { year, month, ...data } = req.body;
  const created = await allocationService.createAllocation(year, month, data, tabIdOf(req));
  res.status(201).json(created);
});

/**
 * PUT /api/budgets/allocations/:id
 * Body: { name?, amount?, investmentId? }
 */
const updateAllocation = asyncHandler(async (req, res) => {
  const updated = await allocationService.updateAllocation(parseInt(req.params.id), req.body, tabIdOf(req));
  res.json(updated);
});

/**
 * DELETE /api/budgets/allocations/:id
 */
const deleteAllocation = asyncHandler(async (req, res) => {
  await allocationService.deleteAllocation(parseInt(req.params.id), tabIdOf(req));
  res.status(204).send();
});

/**
 * POST /api/budgets/allocations/copy
 * Body: { sourceYear, sourceMonth, targetYear, targetMonth, overwrite }
 */
const copyAllocations = asyncHandler(async (req, res) => {
  const { sourceYear, sourceMonth, targetYear, targetMonth, overwrite } = req.body;
  res.json(await allocationService.copyAllocations(sourceYear, sourceMonth, targetYear, targetMonth, overwrite === true, tabIdOf(req)));
});

module.exports = {
  getBudgetPlan,
  getAllocations,
  createAllocation,
  updateAllocation,
  deleteAllocation,
  copyAllocations
};
