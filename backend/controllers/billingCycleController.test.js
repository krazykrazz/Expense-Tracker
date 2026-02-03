const billingCycleController = require('./billingCycleController');
const billingCycleHistoryService = require('../services/billingCycleHistoryService');

// Mock the billing cycle history service
jest.mock('../services/billingCycleHistoryService');

/**
 * BillingCycleController Unit Tests
 * 
 * Tests all API endpoints with valid and invalid inputs
 * Tests error responses for constraint violations
 * 
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**
 */
describe('BillingCycleController - Unit Tests', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      query: {},
      params: {},
      body: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('POST /api/payment-methods/:id/billing-cycles - createBillingCycle', () => {
    test('should create billing cycle with valid data', async () => {
      const mockBillingCycle = {
        id: 1,
        payment_method_id: 4,
        cycle_start_date: '2025-01-16',
        cycle_end_date: '2025-02-15',
        actual_statement_balance: 1234.56,
        calculated_statement_balance: 1189.23,
        minimum_payment: 25.00,
        due_date: '2025-03-01',
        notes: 'Test note',
        discrepancy: { amount: 45.33, type: 'higher', description: 'Actual balance is 45.33 higher than tracked' }
      };

      req.params = { id: '4' };
      req.body = {
        actual_statement_balance: 1234.56,
        minimum_payment: 25.00,
        due_date: '2025-03-01',
        notes: 'Test note'
      };
      billingCycleHistoryService.createBillingCycle.mockResolvedValue(mockBillingCycle);

      await billingCycleController.createBillingCycle(req, res);

      expect(billingCycleHistoryService.createBillingCycle).toHaveBeenCalledWith(
        4,
        { actual_statement_balance: 1234.56, minimum_payment: 25.00, due_date: '2025-03-01', notes: 'Test note' }
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, billingCycle: mockBillingCycle });
    });

    test('should create billing cycle with only required field', async () => {
      const mockBillingCycle = {
        id: 1,
        payment_method_id: 4,
        actual_statement_balance: 500.00,
        calculated_statement_balance: 500.00,
        discrepancy: { amount: 0, type: 'match', description: 'Tracking is accurate' }
      };

      req.params = { id: '4' };
      req.body = { actual_statement_balance: 500.00 };
      billingCycleHistoryService.createBillingCycle.mockResolvedValue(mockBillingCycle);

      await billingCycleController.createBillingCycle(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
    });

    test('should return 400 for invalid payment method ID', async () => {
      req.params = { id: 'invalid' };
      req.body = { actual_statement_balance: 100 };

      await billingCycleController.createBillingCycle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid payment method ID'
      });
    });

    test('should return 400 when actual_statement_balance is missing', async () => {
      req.params = { id: '4' };
      req.body = { minimum_payment: 25.00 };

      await billingCycleController.createBillingCycle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Missing required field: actual_statement_balance'
      });
    });

    test('should return 400 when actual_statement_balance is negative', async () => {
      req.params = { id: '4' };
      req.body = { actual_statement_balance: -100 };

      await billingCycleController.createBillingCycle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Actual statement balance must be a non-negative number'
      });
    });

    test('should return 400 when actual_statement_balance is not a number', async () => {
      req.params = { id: '4' };
      req.body = { actual_statement_balance: 'not a number' };

      await billingCycleController.createBillingCycle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Actual statement balance must be a non-negative number'
      });
    });

    test('should return 400 when minimum_payment is negative', async () => {
      req.params = { id: '4' };
      req.body = { actual_statement_balance: 100, minimum_payment: -10 };

      await billingCycleController.createBillingCycle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Minimum payment must be a non-negative number'
      });
    });

    test('should return 400 for invalid due_date format', async () => {
      req.params = { id: '4' };
      req.body = { actual_statement_balance: 100, due_date: '2025/03/01' };

      await billingCycleController.createBillingCycle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD'
      });
    });

    test('should return 404 when payment method not found', async () => {
      req.params = { id: '999' };
      req.body = { actual_statement_balance: 100 };

      const error = new Error('Payment method not found');
      error.code = 'NOT_FOUND';
      billingCycleHistoryService.createBillingCycle.mockRejectedValue(error);

      await billingCycleController.createBillingCycle(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Payment method not found'
      });
    });

    test('should return 400 when payment method is not a credit card', async () => {
      req.params = { id: '1' };
      req.body = { actual_statement_balance: 100 };

      const error = new Error('Billing cycle history only available for credit cards');
      error.code = 'VALIDATION_ERROR';
      billingCycleHistoryService.createBillingCycle.mockRejectedValue(error);

      await billingCycleController.createBillingCycle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Billing cycle history only available for credit cards'
      });
    });

    test('should return 409 for duplicate billing cycle entry', async () => {
      req.params = { id: '4' };
      req.body = { actual_statement_balance: 100 };

      const error = new Error('Billing cycle record already exists for this period');
      error.code = 'DUPLICATE_ENTRY';
      billingCycleHistoryService.createBillingCycle.mockRejectedValue(error);

      await billingCycleController.createBillingCycle(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Billing cycle record already exists for this period',
        code: 'DUPLICATE_ENTRY'
      });
    });
  });

  describe('GET /api/payment-methods/:id/billing-cycles/history - getBillingCycleHistory', () => {
    test('should return billing cycle history', async () => {
      const mockCycles = [
        {
          id: 2,
          payment_method_id: 4,
          cycle_end_date: '2025-02-15',
          actual_statement_balance: 1200,
          calculated_statement_balance: 1150,
          discrepancy: { amount: 50, type: 'higher', description: 'Higher' }
        },
        {
          id: 1,
          payment_method_id: 4,
          cycle_end_date: '2025-01-15',
          actual_statement_balance: 800,
          calculated_statement_balance: 800,
          discrepancy: { amount: 0, type: 'match', description: 'Match' }
        }
      ];

      req.params = { id: '4' };
      billingCycleHistoryService.getBillingCycleHistory.mockResolvedValue(mockCycles);

      await billingCycleController.getBillingCycleHistory(req, res);

      expect(billingCycleHistoryService.getBillingCycleHistory).toHaveBeenCalledWith(4, {});
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        cycles: mockCycles,
        count: 2
      });
    });

    test('should return billing cycle history with limit', async () => {
      req.params = { id: '4' };
      req.query = { limit: '5' };
      billingCycleHistoryService.getBillingCycleHistory.mockResolvedValue([]);

      await billingCycleController.getBillingCycleHistory(req, res);

      expect(billingCycleHistoryService.getBillingCycleHistory).toHaveBeenCalledWith(4, { limit: 5 });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should return billing cycle history with date range', async () => {
      req.params = { id: '4' };
      req.query = { startDate: '2025-01-01', endDate: '2025-06-30' };
      billingCycleHistoryService.getBillingCycleHistory.mockResolvedValue([]);

      await billingCycleController.getBillingCycleHistory(req, res);

      expect(billingCycleHistoryService.getBillingCycleHistory).toHaveBeenCalledWith(4, {
        startDate: '2025-01-01',
        endDate: '2025-06-30'
      });
    });

    test('should return 400 for invalid payment method ID', async () => {
      req.params = { id: 'invalid' };

      await billingCycleController.getBillingCycleHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid payment method ID'
      });
    });

    test('should return 400 for invalid limit', async () => {
      req.params = { id: '4' };
      req.query = { limit: '-1' };

      await billingCycleController.getBillingCycleHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Limit must be a positive integer'
      });
    });

    test('should return 400 for invalid startDate format', async () => {
      req.params = { id: '4' };
      req.query = { startDate: '01-01-2025' };

      await billingCycleController.getBillingCycleHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid startDate format. Use YYYY-MM-DD'
      });
    });

    test('should return 400 for invalid endDate format', async () => {
      req.params = { id: '4' };
      req.query = { endDate: '2025/06/30' };

      await billingCycleController.getBillingCycleHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid endDate format. Use YYYY-MM-DD'
      });
    });

    test('should return 404 when payment method not found', async () => {
      req.params = { id: '999' };

      const error = new Error('Payment method not found');
      error.code = 'NOT_FOUND';
      billingCycleHistoryService.getBillingCycleHistory.mockRejectedValue(error);

      await billingCycleController.getBillingCycleHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('PUT /api/payment-methods/:id/billing-cycles/:cycleId - updateBillingCycle', () => {
    test('should update billing cycle with valid data', async () => {
      const mockUpdated = {
        id: 1,
        payment_method_id: 4,
        actual_statement_balance: 1300,
        calculated_statement_balance: 1189.23,
        minimum_payment: 30.00,
        due_date: '2025-03-05',
        notes: 'Updated note',
        discrepancy: { amount: 110.77, type: 'higher', description: 'Higher' }
      };

      req.params = { id: '4', cycleId: '1' };
      req.body = {
        actual_statement_balance: 1300,
        minimum_payment: 30.00,
        due_date: '2025-03-05',
        notes: 'Updated note'
      };
      billingCycleHistoryService.updateBillingCycle.mockResolvedValue(mockUpdated);

      await billingCycleController.updateBillingCycle(req, res);

      expect(billingCycleHistoryService.updateBillingCycle).toHaveBeenCalledWith(
        4,
        1,
        { actual_statement_balance: 1300, minimum_payment: 30.00, due_date: '2025-03-05', notes: 'Updated note' }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, billingCycle: mockUpdated });
    });

    test('should return 400 for invalid payment method ID', async () => {
      req.params = { id: 'invalid', cycleId: '1' };
      req.body = { actual_statement_balance: 100 };

      await billingCycleController.updateBillingCycle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid payment method ID'
      });
    });

    test('should return 400 for invalid billing cycle ID', async () => {
      req.params = { id: '4', cycleId: 'invalid' };
      req.body = { actual_statement_balance: 100 };

      await billingCycleController.updateBillingCycle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid billing cycle ID'
      });
    });

    test('should return 400 when actual_statement_balance is negative', async () => {
      req.params = { id: '4', cycleId: '1' };
      req.body = { actual_statement_balance: -100 };

      await billingCycleController.updateBillingCycle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Actual statement balance must be a non-negative number'
      });
    });

    test('should return 400 when minimum_payment is negative', async () => {
      req.params = { id: '4', cycleId: '1' };
      req.body = { minimum_payment: -10 };

      await billingCycleController.updateBillingCycle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Minimum payment must be a non-negative number'
      });
    });

    test('should return 400 for invalid due_date format', async () => {
      req.params = { id: '4', cycleId: '1' };
      req.body = { due_date: 'March 5, 2025' };

      await billingCycleController.updateBillingCycle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD'
      });
    });

    test('should return 404 when billing cycle not found', async () => {
      req.params = { id: '4', cycleId: '999' };
      req.body = { actual_statement_balance: 100 };

      const error = new Error('Billing cycle record not found');
      error.code = 'NOT_FOUND';
      billingCycleHistoryService.updateBillingCycle.mockRejectedValue(error);

      await billingCycleController.updateBillingCycle(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Billing cycle record not found'
      });
    });

    test('should return 400 when billing cycle does not belong to payment method', async () => {
      req.params = { id: '4', cycleId: '1' };
      req.body = { actual_statement_balance: 100 };

      const error = new Error('Billing cycle record does not belong to this payment method');
      error.code = 'VALIDATION_ERROR';
      billingCycleHistoryService.updateBillingCycle.mockRejectedValue(error);

      await billingCycleController.updateBillingCycle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Billing cycle record does not belong to this payment method'
      });
    });
  });

  describe('DELETE /api/payment-methods/:id/billing-cycles/:cycleId - deleteBillingCycle', () => {
    test('should delete billing cycle successfully', async () => {
      req.params = { id: '4', cycleId: '1' };
      billingCycleHistoryService.deleteBillingCycle.mockResolvedValue(true);

      await billingCycleController.deleteBillingCycle(req, res);

      expect(billingCycleHistoryService.deleteBillingCycle).toHaveBeenCalledWith(4, 1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Billing cycle record deleted successfully'
      });
    });

    test('should return 400 for invalid payment method ID', async () => {
      req.params = { id: 'invalid', cycleId: '1' };

      await billingCycleController.deleteBillingCycle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid payment method ID'
      });
    });

    test('should return 400 for invalid billing cycle ID', async () => {
      req.params = { id: '4', cycleId: 'invalid' };

      await billingCycleController.deleteBillingCycle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid billing cycle ID'
      });
    });

    test('should return 404 when billing cycle not found', async () => {
      req.params = { id: '4', cycleId: '999' };

      const error = new Error('Billing cycle record not found');
      error.code = 'NOT_FOUND';
      billingCycleHistoryService.deleteBillingCycle.mockRejectedValue(error);

      await billingCycleController.deleteBillingCycle(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Billing cycle record not found'
      });
    });

    test('should return 400 when billing cycle does not belong to payment method', async () => {
      req.params = { id: '4', cycleId: '1' };

      const error = new Error('Billing cycle record does not belong to this payment method');
      error.code = 'VALIDATION_ERROR';
      billingCycleHistoryService.deleteBillingCycle.mockRejectedValue(error);

      await billingCycleController.deleteBillingCycle(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Billing cycle record does not belong to this payment method'
      });
    });
  });

  describe('GET /api/payment-methods/:id/billing-cycles/current - getCurrentCycleStatus', () => {
    test('should return current cycle status when no entry exists', async () => {
      const mockStatus = {
        hasActualBalance: false,
        cycleStartDate: '2025-01-16',
        cycleEndDate: '2025-02-15',
        actualBalance: null,
        calculatedBalance: 1189.23,
        daysUntilCycleEnd: 5,
        needsEntry: true
      };

      req.params = { id: '4' };
      billingCycleHistoryService.getCurrentCycleStatus.mockResolvedValue(mockStatus);

      await billingCycleController.getCurrentCycleStatus(req, res);

      expect(billingCycleHistoryService.getCurrentCycleStatus).toHaveBeenCalledWith(4);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        ...mockStatus
      });
    });

    test('should return current cycle status when entry exists', async () => {
      const mockStatus = {
        hasActualBalance: true,
        cycleStartDate: '2025-01-16',
        cycleEndDate: '2025-02-15',
        actualBalance: 1234.56,
        calculatedBalance: 1189.23,
        daysUntilCycleEnd: 5,
        needsEntry: false
      };

      req.params = { id: '4' };
      billingCycleHistoryService.getCurrentCycleStatus.mockResolvedValue(mockStatus);

      await billingCycleController.getCurrentCycleStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        ...mockStatus
      });
    });

    test('should return 400 for invalid payment method ID', async () => {
      req.params = { id: 'invalid' };

      await billingCycleController.getCurrentCycleStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid payment method ID'
      });
    });

    test('should return 404 when payment method not found', async () => {
      req.params = { id: '999' };

      const error = new Error('Payment method not found');
      error.code = 'NOT_FOUND';
      billingCycleHistoryService.getCurrentCycleStatus.mockRejectedValue(error);

      await billingCycleController.getCurrentCycleStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Payment method not found'
      });
    });

    test('should return 400 when billing cycle day not configured', async () => {
      req.params = { id: '4' };

      const error = new Error('Billing cycle day not configured for this credit card');
      error.code = 'VALIDATION_ERROR';
      billingCycleHistoryService.getCurrentCycleStatus.mockRejectedValue(error);

      await billingCycleController.getCurrentCycleStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Billing cycle day not configured for this credit card'
      });
    });
  });
});
