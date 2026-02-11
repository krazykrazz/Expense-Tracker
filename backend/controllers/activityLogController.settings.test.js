const activityLogController = require('./activityLogController');
const settingsService = require('../services/settingsService');
const logger = require('../config/logger');

// Mock dependencies
jest.mock('../services/settingsService');
jest.mock('../config/logger');

describe('Activity Log Controller - Settings Endpoints', () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {}
    };
    res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('getSettings', () => {
    it('should return 200 with current settings', async () => {
      const mockSettings = { maxAgeDays: 90, maxCount: 1000 };
      settingsService.getRetentionSettings.mockResolvedValue(mockSettings);

      await activityLogController.getSettings(req, res);

      expect(settingsService.getRetentionSettings).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(mockSettings);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 500 on service error', async () => {
      const error = new Error('Database error');
      settingsService.getRetentionSettings.mockRejectedValue(error);

      await activityLogController.getSettings(req, res);

      expect(logger.error).toHaveBeenCalledWith('Error fetching retention settings:', error);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to fetch retention settings' });
    });
  });

  describe('updateSettings', () => {
    it('should validate request body for missing maxAgeDays', async () => {
      req.body = { maxCount: 500 };

      await activityLogController.updateSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'Missing required field: maxAgeDays' 
      });
      expect(settingsService.updateRetentionSettings).not.toHaveBeenCalled();
    });

    it('should validate request body for missing maxCount', async () => {
      req.body = { maxAgeDays: 60 };

      await activityLogController.updateSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'Missing required field: maxCount' 
      });
      expect(settingsService.updateRetentionSettings).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid ranges', async () => {
      req.body = { maxAgeDays: 5, maxCount: 500 };
      const error = new Error('maxAgeDays must be between 7 and 365');
      settingsService.updateRetentionSettings.mockRejectedValue(error);

      await activityLogController.updateSettings(req, res);

      expect(settingsService.updateRetentionSettings).toHaveBeenCalledWith(5, 500);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'maxAgeDays must be between 7 and 365' 
      });
    });

    it('should return 200 with updated settings on success', async () => {
      req.body = { maxAgeDays: 60, maxCount: 500 };
      const updatedSettings = { maxAgeDays: 60, maxCount: 500 };
      settingsService.updateRetentionSettings.mockResolvedValue(updatedSettings);

      await activityLogController.updateSettings(req, res);

      expect(settingsService.updateRetentionSettings).toHaveBeenCalledWith(60, 500);
      expect(logger.info).toHaveBeenCalledWith('Retention settings updated via API:', updatedSettings);
      expect(res.json).toHaveBeenCalledWith({
        maxAgeDays: 60,
        maxCount: 500,
        message: 'Retention settings updated successfully'
      });
      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(res.status).not.toHaveBeenCalledWith(500);
    });

    it('should return 400 for validation errors with descriptive messages', async () => {
      req.body = { maxAgeDays: 400, maxCount: 500 };
      const error = new Error('maxAgeDays must be between 7 and 365');
      settingsService.updateRetentionSettings.mockRejectedValue(error);

      await activityLogController.updateSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'maxAgeDays must be between 7 and 365' 
      });
    });

    it('should return 400 for non-integer values', async () => {
      req.body = { maxAgeDays: 60.5, maxCount: 500 };
      const error = new Error('maxAgeDays must be an integer');
      settingsService.updateRetentionSettings.mockRejectedValue(error);

      await activityLogController.updateSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'maxAgeDays must be an integer' 
      });
    });

    it('should return 500 for server errors', async () => {
      req.body = { maxAgeDays: 60, maxCount: 500 };
      const error = new Error('Database connection failed');
      settingsService.updateRetentionSettings.mockRejectedValue(error);

      await activityLogController.updateSettings(req, res);

      expect(logger.error).toHaveBeenCalledWith('Error updating retention settings:', error);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'Failed to update retention settings' 
      });
    });

    it('should handle null values as missing fields', async () => {
      req.body = { maxAgeDays: null, maxCount: 500 };

      await activityLogController.updateSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'Missing required field: maxAgeDays' 
      });
    });

    it('should handle undefined values as missing fields', async () => {
      req.body = { maxAgeDays: 60, maxCount: undefined };

      await activityLogController.updateSettings(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ 
        error: 'Missing required field: maxCount' 
      });
    });
  });
});
