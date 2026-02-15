// Mock dependencies - these are hoisted before any require() calls
jest.mock('../services/billingCycleHistoryService');
jest.mock('../services/statementBalanceService', () => ({}));
jest.mock('../database/db', () => ({
  getDatabase: jest.fn()
}));
jest.mock('../repositories/billingCycleRepository', () => ({
  findById: jest.fn(),
  findByPaymentMethod: jest.fn(),
  findByPaymentMethodAndCycleEnd: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn()
}));
jest.mock('../repositories/paymentMethodRepository', () => ({
  findById: jest.fn()
}));
jest.mock('../services/activityLogService', () => ({
  logEvent: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../config/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));
jest.mock('../config/paths', () => ({
  getStatementsPath: jest.fn().mockReturnValue('/mock/statements')
}));
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  createReadStream: jest.fn()
}));

const fs = require('fs');
const billingCycleController = require('./billingCycleController');
const billingCycleHistoryService = require('../services/billingCycleHistoryService');
const billingCycleRepository = require('../repositories/billingCycleRepository');

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
        notes: 'Test note',
        discrepancy: { amount: 45.33, type: 'higher', description: 'Actual balance is 45.33 higher than tracked' }
      };

      req.params = { id: '4' };
      req.body = {
        actual_statement_balance: 1234.56,
        minimum_payment: 25.00,
        notes: 'Test note'
      };
      billingCycleHistoryService.createBillingCycle.mockResolvedValue(mockBillingCycle);

      await billingCycleController.createBillingCycle(req, res);

      expect(billingCycleHistoryService.createBillingCycle).toHaveBeenCalledWith(
        4,
        { actual_statement_balance: 1234.56, minimum_payment: 25.00, notes: 'Test note', statement_pdf_path: null }
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
        billingCycles: mockCycles,
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
        notes: 'Updated note',
        cycle_start_date: '2025-01-16',
        cycle_end_date: '2025-02-15',
        discrepancy: { amount: 110.77, type: 'higher', description: 'Higher' }
      };

      req.params = { id: '4', cycleId: '1' };
      req.body = {
        actual_statement_balance: 1300,
        minimum_payment: 30.00,
        notes: 'Updated note'
      };
      billingCycleRepository.findById.mockResolvedValue({
        id: 1,
        payment_method_id: 4,
        actual_statement_balance: 1200
      });
      billingCycleHistoryService.updateBillingCycle.mockResolvedValue(mockUpdated);

      await billingCycleController.updateBillingCycle(req, res);

      expect(billingCycleHistoryService.updateBillingCycle).toHaveBeenCalledWith(
        4,
        1,
        { actual_statement_balance: 1300, minimum_payment: 30.00, notes: 'Updated note' }
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

    test('should save PDF and pass statement_pdf_path when file is uploaded', async () => {
      const mockUpdated = {
        id: 1,
        payment_method_id: 4,
        actual_statement_balance: 1300,
        calculated_statement_balance: 1189.23,
        cycle_start_date: '2025-01-16',
        cycle_end_date: '2025-02-15',
        discrepancy: { amount: 110.77, type: 'higher', description: 'Higher' }
      };

      req.params = { id: '4', cycleId: '1' };
      req.body = { actual_statement_balance: '1300' };
      req.file = {
        originalname: 'statement.pdf',
        buffer: Buffer.from('fake-pdf-content')
      };

      billingCycleRepository.findById.mockResolvedValue({
        id: 1,
        payment_method_id: 4,
        cycle_end_date: '2025-02-15',
        actual_statement_balance: 1000,
        statement_pdf_path: null
      });
      billingCycleHistoryService.updateBillingCycle.mockResolvedValue(mockUpdated);

      await billingCycleController.updateBillingCycle(req, res);

      // Verify file was written
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('billing-cycle-4-20250215'),
        req.file.buffer
      );

      // Verify service was called with statement_pdf_path
      expect(billingCycleHistoryService.updateBillingCycle).toHaveBeenCalledWith(
        4,
        1,
        expect.objectContaining({
          statement_pdf_path: expect.stringContaining('billing-cycle-4-20250215')
        })
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, billingCycle: mockUpdated });
    });

    test('should clean up old PDF when replacing with new upload', async () => {
      const mockUpdated = {
        id: 1,
        payment_method_id: 4,
        actual_statement_balance: 1300,
        calculated_statement_balance: 1189.23,
        cycle_start_date: '2025-01-16',
        cycle_end_date: '2025-02-15',
        discrepancy: { amount: 110.77, type: 'higher', description: 'Higher' }
      };

      req.params = { id: '4', cycleId: '1' };
      req.body = { actual_statement_balance: '1300' };
      req.file = {
        originalname: 'new-statement.pdf',
        buffer: Buffer.from('new-pdf-content')
      };

      billingCycleRepository.findById.mockResolvedValue({
        id: 1,
        payment_method_id: 4,
        cycle_end_date: '2025-02-15',
        actual_statement_balance: 1000,
        statement_pdf_path: 'old-statement.pdf'
      });
      fs.existsSync.mockReturnValue(true);
      billingCycleHistoryService.updateBillingCycle.mockResolvedValue(mockUpdated);

      await billingCycleController.updateBillingCycle(req, res);

      // Verify old PDF was deleted
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('old-statement.pdf')
      );

      // Verify new file was written
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('should parse string values from form-data when uploading PDF', async () => {
      const mockUpdated = {
        id: 1,
        payment_method_id: 4,
        actual_statement_balance: 500.50,
        calculated_statement_balance: 400,
        cycle_start_date: '2025-01-16',
        cycle_end_date: '2025-02-15',
        discrepancy: { amount: 100.50, type: 'higher', description: 'Higher' }
      };

      req.params = { id: '4', cycleId: '1' };
      // Form-data sends values as strings
      req.body = {
        actual_statement_balance: '500.50',
        minimum_payment: '25.00',
        notes: 'From form-data'
      };
      req.file = {
        originalname: 'stmt.pdf',
        buffer: Buffer.from('pdf')
      };

      billingCycleRepository.findById.mockResolvedValue({
        id: 1,
        payment_method_id: 4,
        cycle_end_date: '2025-02-15',
        actual_statement_balance: 0,
        statement_pdf_path: null
      });
      billingCycleHistoryService.updateBillingCycle.mockResolvedValue(mockUpdated);

      await billingCycleController.updateBillingCycle(req, res);

      // Verify numeric values were parsed from strings
      expect(billingCycleHistoryService.updateBillingCycle).toHaveBeenCalledWith(
        4,
        1,
        expect.objectContaining({
          actual_statement_balance: 500.50,
          minimum_payment: 25.00,
          notes: 'From form-data'
        })
      );

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('DELETE /api/payment-methods/:id/billing-cycles/:cycleId - deleteBillingCycle', () => {
    test('should delete billing cycle successfully', async () => {
      req.params = { id: '4', cycleId: '1' };
      // Mock getBillingCycleHistory to return the cycle (for PDF check)
      billingCycleHistoryService.getBillingCycleHistory.mockResolvedValue([
        { id: 1, payment_method_id: 4, statement_pdf_path: null }
      ]);
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

      // Mock getBillingCycleHistory to return empty (cycle not found)
      billingCycleHistoryService.getBillingCycleHistory.mockResolvedValue([]);
      
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

      // Mock getBillingCycleHistory to return empty (cycle belongs to different payment method)
      billingCycleHistoryService.getBillingCycleHistory.mockResolvedValue([]);
      
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
