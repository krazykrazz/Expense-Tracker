const loanController = require('./loanController');
const loanService = require('../services/loanService');
const mortgageService = require('../services/mortgageService');
const mortgageInsightsService = require('../services/mortgageInsightsService');
const mortgagePaymentService = require('../services/mortgagePaymentService');
const loanBalanceService = require('../services/loanBalanceService');
const loanRepository = require('../repositories/loanRepository');
const loanBalanceRepository = require('../repositories/loanBalanceRepository');

// Mock all dependencies
jest.mock('../services/loanService');
jest.mock('../services/mortgageService');
jest.mock('../services/mortgageInsightsService');
jest.mock('../services/mortgagePaymentService');
jest.mock('../services/loanBalanceService');
jest.mock('../repositories/loanRepository');
jest.mock('../repositories/loanBalanceRepository');

describe('loanController', () => {
  let req, res;

  beforeEach(() => {
    req = {
      params: {},
      body: {},
      headers: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    jest.clearAllMocks();
  });

  describe('getAllLoans', () => {
    it('should return all loans with 200 status', async () => {
      const mockLoans = [
        { id: 1, name: 'Car Loan', loan_type: 'loan' },
        { id: 2, name: 'Mortgage', loan_type: 'mortgage' }
      ];
      loanService.getAllLoans.mockResolvedValue(mockLoans);

      await loanController.getAllLoans(req, res);

      expect(loanService.getAllLoans).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockLoans);
    });

    it('should handle errors with 500 status', async () => {
      const error = new Error('Database error');
      loanService.getAllLoans.mockRejectedValue(error);

      await loanController.getAllLoans(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Database error' });
    });
  });

  describe('createLoan', () => {
    it('should create a regular loan with 201 status', async () => {
      req.body = {
        name: 'Car Loan',
        initial_balance: 20000,
        start_date: '2024-01-01',
        loan_type: 'loan'
      };
      const mockLoan = { id: 1, ...req.body };
      loanService.createLoan.mockResolvedValue(mockLoan);

      await loanController.createLoan(req, res);

      expect(loanService.createLoan).toHaveBeenCalledWith(req.body, null);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockLoan);
    });

    it('should create a mortgage with 201 status', async () => {
      req.body = {
        name: 'Home Mortgage',
        initial_balance: 300000,
        start_date: '2024-01-01',
        loan_type: 'mortgage',
        amortization_period: 25,
        payment_frequency: 'monthly'
      };
      const mockMortgage = { id: 2, ...req.body };
      loanService.createMortgage.mockResolvedValue(mockMortgage);

      await loanController.createLoan(req, res);

      expect(loanService.createMortgage).toHaveBeenCalledWith(req.body, null);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockMortgage);
    });

    it('should return 400 if name is missing', async () => {
      req.body = {
        initial_balance: 20000,
        start_date: '2024-01-01'
      };

      await loanController.createLoan(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Name, initial_balance, and start_date are required'
      });
    });

    it('should return 400 if initial_balance is missing', async () => {
      req.body = {
        name: 'Car Loan',
        start_date: '2024-01-01'
      };

      await loanController.createLoan(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Name, initial_balance, and start_date are required'
      });
    });

    it('should return 400 if start_date is missing', async () => {
      req.body = {
        name: 'Car Loan',
        initial_balance: 20000
      };

      await loanController.createLoan(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Name, initial_balance, and start_date are required'
      });
    });

    it('should handle service errors with 400 status', async () => {
      req.body = {
        name: 'Car Loan',
        initial_balance: 20000,
        start_date: '2024-01-01'
      };
      loanService.createLoan.mockRejectedValue(new Error('Invalid data'));

      await loanController.createLoan(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid data' });
    });
  });

  describe('updateLoan', () => {
    it('should update a regular loan with 200 status', async () => {
      req.params.id = '1';
      req.body = { name: 'Updated Car Loan', notes: 'New notes' };
      const mockLoan = { id: 1, loan_type: 'loan' };
      const mockUpdated = { id: 1, ...req.body };
      
      loanRepository.findById.mockResolvedValue(mockLoan);
      loanService.updateLoan.mockResolvedValue(mockUpdated);

      await loanController.updateLoan(req, res);

      expect(loanRepository.findById).toHaveBeenCalledWith(1);
      expect(loanService.updateLoan).toHaveBeenCalledWith(1, req.body, null);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockUpdated);
    });

    it('should update a mortgage with 200 status', async () => {
      req.params.id = '2';
      req.body = { name: 'Updated Mortgage' };
      const mockMortgage = { id: 2, loan_type: 'mortgage' };
      const mockUpdated = { id: 2, ...req.body };
      
      loanRepository.findById.mockResolvedValue(mockMortgage);
      loanService.updateMortgage.mockResolvedValue(mockUpdated);

      await loanController.updateLoan(req, res);

      expect(loanService.updateMortgage).toHaveBeenCalledWith(2, req.body, null);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockUpdated);
    });

    it('should return 400 for invalid loan ID', async () => {
      req.params.id = 'invalid';
      req.body = { name: 'Updated Loan' };

      await loanController.updateLoan(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid loan ID' });
    });

    it('should return 400 if name is missing', async () => {
      req.params.id = '1';
      req.body = { notes: 'New notes' };

      await loanController.updateLoan(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Name is required' });
    });

    it('should return 404 if loan not found', async () => {
      req.params.id = '999';
      req.body = { name: 'Updated Loan' };
      
      loanRepository.findById.mockResolvedValue(null);

      await loanController.updateLoan(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Loan not found' });
    });

    it('should return 404 if update returns null', async () => {
      req.params.id = '1';
      req.body = { name: 'Updated Loan' };
      const mockLoan = { id: 1, loan_type: 'loan' };
      
      loanRepository.findById.mockResolvedValue(mockLoan);
      loanService.updateLoan.mockResolvedValue(null);

      await loanController.updateLoan(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Loan not found' });
    });

    it('should handle service errors with 400 status', async () => {
      req.params.id = '1';
      req.body = { name: 'Updated Loan' };
      const mockLoan = { id: 1, loan_type: 'loan' };
      
      loanRepository.findById.mockResolvedValue(mockLoan);
      loanService.updateLoan.mockRejectedValue(new Error('Update failed'));

      await loanController.updateLoan(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Update failed' });
    });
  });

  describe('deleteLoan', () => {
    it('should delete a loan with 200 status', async () => {
      req.params.id = '1';
      loanService.deleteLoan.mockResolvedValue(true);

      await loanController.deleteLoan(req, res);

      expect(loanService.deleteLoan).toHaveBeenCalledWith(1, null);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Loan deleted successfully' });
    });

    it('should return 400 for invalid loan ID', async () => {
      req.params.id = 'invalid';

      await loanController.deleteLoan(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid loan ID' });
    });

    it('should return 404 if loan not found', async () => {
      req.params.id = '999';
      loanService.deleteLoan.mockResolvedValue(false);

      await loanController.deleteLoan(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Loan not found' });
    });

    it('should handle service errors with 500 status', async () => {
      req.params.id = '1';
      loanService.deleteLoan.mockRejectedValue(new Error('Delete failed'));

      await loanController.deleteLoan(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Delete failed' });
    });
  });

  describe('markPaidOff', () => {
    it('should mark loan as paid off with 200 status', async () => {
      req.params.id = '1';
      req.body = { isPaidOff: true };
      const mockLoan = { id: 1, is_paid_off: true };
      loanService.markPaidOff.mockResolvedValue(mockLoan);

      await loanController.markPaidOff(req, res);

      expect(loanService.markPaidOff).toHaveBeenCalledWith(1, true, null);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockLoan);
    });

    it('should reactivate a paid off loan with 200 status', async () => {
      req.params.id = '1';
      req.body = { isPaidOff: false };
      const mockLoan = { id: 1, is_paid_off: false };
      loanService.markPaidOff.mockResolvedValue(mockLoan);

      await loanController.markPaidOff(req, res);

      expect(loanService.markPaidOff).toHaveBeenCalledWith(1, false, null);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockLoan);
    });

    it('should return 400 for invalid loan ID', async () => {
      req.params.id = 'invalid';
      req.body = { isPaidOff: true };

      await loanController.markPaidOff(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid loan ID' });
    });

    it('should return 400 if isPaidOff is missing', async () => {
      req.params.id = '1';
      req.body = {};

      await loanController.markPaidOff(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'isPaidOff is required' });
    });

    it('should return 404 if loan not found', async () => {
      req.params.id = '999';
      req.body = { isPaidOff: true };
      loanService.markPaidOff.mockResolvedValue(null);

      await loanController.markPaidOff(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Loan not found' });
    });

    it('should handle service errors with 400 status', async () => {
      req.params.id = '1';
      req.body = { isPaidOff: true };
      loanService.markPaidOff.mockRejectedValue(new Error('Update failed'));

      await loanController.markPaidOff(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Update failed' });
    });
  });

  describe('updateCurrentRate', () => {
    it('should update mortgage rate with 200 status', async () => {
      req.params.id = '1';
      req.body = { rate: 3.5 };
      const mockLoan = { id: 1, loan_type: 'mortgage' };
      const mockBalanceEntry = { id: 1, loan_id: 1, rate: 3.5 };
      const mockInsights = {
        currentStatus: { balance: 250000, rate: 3.5, currentPayment: 1500 }
      };
      
      loanRepository.findById.mockResolvedValue(mockLoan);
      loanBalanceService.updateCurrentRate.mockResolvedValue(mockBalanceEntry);
      mortgageInsightsService.getMortgageInsights.mockResolvedValue(mockInsights);

      await loanController.updateCurrentRate(req, res);

      expect(loanRepository.findById).toHaveBeenCalledWith(1);
      expect(loanBalanceService.updateCurrentRate).toHaveBeenCalledWith(1, 3.5);
      expect(mortgageInsightsService.getMortgageInsights).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Rate updated successfully',
        balanceEntry: mockBalanceEntry,
        currentStatus: mockInsights.currentStatus
      });
    });

    it('should return 400 for invalid loan ID', async () => {
      req.params.id = 'invalid';
      req.body = { rate: 3.5 };

      await loanController.updateCurrentRate(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid loan ID' });
    });

    it('should return 400 if rate is missing', async () => {
      req.params.id = '1';
      req.body = {};

      await loanController.updateCurrentRate(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Rate is required' });
    });

    it('should return 400 if rate is not a number', async () => {
      req.params.id = '1';
      req.body = { rate: 'invalid' };

      await loanController.updateCurrentRate(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Rate must be a number' });
    });

    it('should return 400 if rate is negative', async () => {
      req.params.id = '1';
      req.body = { rate: -1 };

      await loanController.updateCurrentRate(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Rate must be between 0 and 100' });
    });

    it('should return 400 if rate is over 100', async () => {
      req.params.id = '1';
      req.body = { rate: 101 };

      await loanController.updateCurrentRate(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Rate must be between 0 and 100' });
    });

    it('should return 404 if mortgage not found', async () => {
      req.params.id = '999';
      req.body = { rate: 3.5 };
      
      loanRepository.findById.mockResolvedValue(null);

      await loanController.updateCurrentRate(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Mortgage not found' });
    });

    it('should return 400 if loan is not a mortgage', async () => {
      req.params.id = '1';
      req.body = { rate: 3.5 };
      const mockLoan = { id: 1, loan_type: 'loan' };
      
      loanRepository.findById.mockResolvedValue(mockLoan);

      await loanController.updateCurrentRate(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Rate updates are only available for mortgages'
      });
    });

    it('should handle service errors with 500 status', async () => {
      req.params.id = '1';
      req.body = { rate: 3.5 };
      const mockLoan = { id: 1, loan_type: 'mortgage' };
      
      loanRepository.findById.mockResolvedValue(mockLoan);
      loanBalanceService.updateCurrentRate.mockRejectedValue(new Error('Update failed'));

      await loanController.updateCurrentRate(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Update failed' });
    });
  });
});
