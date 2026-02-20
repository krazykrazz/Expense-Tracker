/**
 * Unit tests for settingsController
 * Validates: Requirements 3.4, 3.5
 */

jest.mock('../services/settingsService');
const settingsService = require('../services/settingsService');
const { getTimezone, updateTimezone } = require('./settingsController');

const mockReq = (body = {}) => ({ body });
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('settingsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getTimezone', () => {
    it('should return the current business timezone', async () => {
      settingsService.getBusinessTimezone.mockResolvedValue('America/Toronto');

      const req = mockReq();
      const res = mockRes();
      await getTimezone(req, res);

      expect(res.json).toHaveBeenCalledWith({ timezone: 'America/Toronto' });
    });

    it('should return default America/Toronto when not set', async () => {
      settingsService.getBusinessTimezone.mockResolvedValue('America/Toronto');

      const req = mockReq();
      const res = mockRes();
      await getTimezone(req, res);

      expect(res.json).toHaveBeenCalledWith({ timezone: 'America/Toronto' });
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 500 when service throws', async () => {
      settingsService.getBusinessTimezone.mockRejectedValue(new Error('DB error'));

      const req = mockReq();
      const res = mockRes();
      await getTimezone(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to get timezone setting' });
    });
  });

  describe('updateTimezone', () => {
    it('should return 200 with saved timezone for a valid timezone', async () => {
      settingsService.updateBusinessTimezone.mockResolvedValue('America/New_York');

      const req = mockReq({ timezone: 'America/New_York' });
      const res = mockRes();
      await updateTimezone(req, res);

      expect(settingsService.updateBusinessTimezone).toHaveBeenCalledWith('America/New_York');
      expect(res.json).toHaveBeenCalledWith({ timezone: 'America/New_York' });
    });

    it('should return 400 when timezone is missing from body', async () => {
      const req = mockReq({});
      const res = mockRes();
      await updateTimezone(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'timezone is required' });
      expect(settingsService.updateBusinessTimezone).not.toHaveBeenCalled();
    });

    it('should return 400 when service throws Invalid IANA timezone error', async () => {
      settingsService.updateBusinessTimezone.mockRejectedValue(
        new Error('Invalid IANA timezone identifier: bad-tz')
      );

      const req = mockReq({ timezone: 'bad-tz' });
      const res = mockRes();
      await updateTimezone(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid IANA timezone identifier: bad-tz',
      });
    });

    it('should return 500 when service throws a non-validation error', async () => {
      settingsService.updateBusinessTimezone.mockRejectedValue(new Error('DB failure'));

      const req = mockReq({ timezone: 'America/Toronto' });
      const res = mockRes();
      await updateTimezone(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to update timezone setting' });
    });

    it('should return 400 when timezone is an empty string', async () => {
      const req = mockReq({ timezone: '' });
      const res = mockRes();
      await updateTimezone(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'timezone is required' });
    });
  });
});
