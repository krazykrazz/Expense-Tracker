/**
 * Route + controller wiring for the budget plan and allocation endpoints.
 */

const request = require('supertest');
const express = require('express');

jest.mock('../services/budgetPlanService');
jest.mock('../services/allocationService');
jest.mock('../services/budgetService');

const budgetPlanService = require('../services/budgetPlanService');
const allocationService = require('../services/allocationService');
const budgetRoutes = require('./budgetRoutes');
const { errorHandler } = require('../middleware/errorHandler');

const app = express();
app.use(express.json());
app.use('/api/budgets', budgetRoutes);
app.use(errorHandler);

describe('budget plan routes', () => {
  beforeEach(() => jest.clearAllMocks());

  test('GET /plan returns the plan for the requested month', async () => {
    budgetPlanService.getBudgetPlan.mockResolvedValue({ unassigned: 100 });

    const res = await request(app).get('/api/budgets/plan?year=2025&month=11');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ unassigned: 100 });
    expect(budgetPlanService.getBudgetPlan).toHaveBeenCalledWith('2025', '11');
  });

  test('GET /plan honours the service statusCode', async () => {
    budgetPlanService.getBudgetPlan.mockRejectedValue(Object.assign(new Error('Invalid year or month specified'), { statusCode: 400 }));

    const res = await request(app).get('/api/budgets/plan?year=x&month=1');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid year or month specified');
  });

  test('GET /allocations wraps the list', async () => {
    allocationService.getAllocations.mockResolvedValue([{ name: 'TFSA' }]);

    const res = await request(app).get('/api/budgets/allocations?year=2025&month=11');

    expect(res.body).toEqual({ allocations: [{ name: 'TFSA' }] });
  });

  test('POST /allocations creates with year/month split from the body and forwards the tab id', async () => {
    allocationService.createAllocation.mockResolvedValue({ id: 1 });

    const res = await request(app)
      .post('/api/budgets/allocations')
      .set('X-Tab-ID', 'tab-9')
      .send({ year: 2025, month: 11, name: 'TFSA', amount: 100, investmentId: 3 });

    expect(res.status).toBe(201);
    expect(allocationService.createAllocation).toHaveBeenCalledWith(2025, 11, { name: 'TFSA', amount: 100, investmentId: 3 }, 'tab-9');
  });

  test('PUT /allocations/:id updates and DELETE returns 204', async () => {
    allocationService.updateAllocation.mockResolvedValue({ id: 4, amount: 5 });
    allocationService.deleteAllocation.mockResolvedValue(true);

    const put = await request(app).put('/api/budgets/allocations/4').send({ amount: 5 });
    const del = await request(app).delete('/api/budgets/allocations/4');

    expect(put.body).toEqual({ id: 4, amount: 5 });
    expect(allocationService.updateAllocation).toHaveBeenCalledWith(4, { amount: 5 }, null);
    expect(del.status).toBe(204);
  });

  test('POST /allocations/copy is not captured by the :id routes', async () => {
    allocationService.copyAllocations.mockResolvedValue({ copied: 1, skipped: 0, overwritten: 0 });

    const res = await request(app)
      .post('/api/budgets/allocations/copy')
      .send({ sourceYear: 2025, sourceMonth: 10, targetYear: 2025, targetMonth: 11, overwrite: true });

    expect(res.body).toEqual({ copied: 1, skipped: 0, overwritten: 0 });
    expect(allocationService.copyAllocations).toHaveBeenCalledWith(2025, 10, 2025, 11, true, null);
  });
});
