const fc = require('fast-check');
const activityLogController = require('./activityLogController');
const settingsService = require('../services/settingsService');
const logger = require('../config/logger');

// Mock dependencies
jest.mock('../services/settingsService');
jest.mock('../config/logger');

describe('Activity Log Controller - Property 4: Settings Response Structure', () => {
  /**
   * Property 4: Settings Response Structure
   * Validates: Requirements 2.3, 8.3
   * 
   * For any GET request to /api/activity-logs/settings, the response should 
   * always contain both maxAgeDays and maxCount fields with integer values.
   */

  // Arbitrary for valid retention settings
  const validSettingsArbitrary = fc.record({
    maxAgeDays: fc.integer({ min: 7, max: 365 }),
    maxCount: fc.integer({ min: 100, max: 10000 })
  });

  it('Property 4: GET settings response always contains maxAgeDays and maxCount as integers', async () => {
    await fc.assert(
      fc.asyncProperty(validSettingsArbitrary, async (settings) => {
        // Setup
        const req = {};
        const res = {
          json: jest.fn(),
          status: jest.fn().mockReturnThis()
        };
        
        settingsService.getRetentionSettings.mockResolvedValue(settings);

        // Execute
        await activityLogController.getSettings(req, res);

        // Verify response structure
        expect(res.json).toHaveBeenCalledTimes(1);
        const response = res.json.mock.calls[0][0];

        // Assert response contains both fields
        expect(response).toHaveProperty('maxAgeDays');
        expect(response).toHaveProperty('maxCount');

        // Assert both fields are integers
        expect(Number.isInteger(response.maxAgeDays)).toBe(true);
        expect(Number.isInteger(response.maxCount)).toBe(true);

        // Assert values match what service returned
        expect(response.maxAgeDays).toBe(settings.maxAgeDays);
        expect(response.maxCount).toBe(settings.maxCount);

        // Assert no error status was set
        expect(res.status).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });

  it('Property 4: PUT settings response contains maxAgeDays and maxCount as integers', async () => {
    await fc.assert(
      fc.asyncProperty(validSettingsArbitrary, async (settings) => {
        // Setup
        const req = {
          body: {
            maxAgeDays: settings.maxAgeDays,
            maxCount: settings.maxCount
          }
        };
        const res = {
          json: jest.fn(),
          status: jest.fn().mockReturnThis()
        };
        
        settingsService.updateRetentionSettings.mockResolvedValue(settings);

        // Execute
        await activityLogController.updateSettings(req, res);

        // Verify response structure
        expect(res.json).toHaveBeenCalledTimes(1);
        const response = res.json.mock.calls[0][0];

        // Assert response contains both fields
        expect(response).toHaveProperty('maxAgeDays');
        expect(response).toHaveProperty('maxCount');

        // Assert both fields are integers
        expect(Number.isInteger(response.maxAgeDays)).toBe(true);
        expect(Number.isInteger(response.maxCount)).toBe(true);

        // Assert values match what was updated
        expect(response.maxAgeDays).toBe(settings.maxAgeDays);
        expect(response.maxCount).toBe(settings.maxCount);

        // Assert response includes success message
        expect(response).toHaveProperty('message');
        expect(typeof response.message).toBe('string');

        // Assert no error status was set
        expect(res.status).not.toHaveBeenCalledWith(400);
        expect(res.status).not.toHaveBeenCalledWith(500);
      }),
      { numRuns: 100 }
    );
  });

  it('Property 4: Response structure is consistent across different valid settings', async () => {
    await fc.assert(
      fc.asyncProperty(
        validSettingsArbitrary,
        validSettingsArbitrary,
        async (settings1, settings2) => {
          // Test GET endpoint with first settings
          const req1 = {};
          const res1 = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis()
          };
          settingsService.getRetentionSettings.mockResolvedValue(settings1);
          await activityLogController.getSettings(req1, res1);
          const response1 = res1.json.mock.calls[0][0];

          // Test GET endpoint with second settings
          const req2 = {};
          const res2 = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis()
          };
          settingsService.getRetentionSettings.mockResolvedValue(settings2);
          await activityLogController.getSettings(req2, res2);
          const response2 = res2.json.mock.calls[0][0];

          // Assert both responses have the same structure
          expect(Object.keys(response1).sort()).toEqual(Object.keys(response2).sort());
          
          // Assert both have the required fields
          expect(response1).toHaveProperty('maxAgeDays');
          expect(response1).toHaveProperty('maxCount');
          expect(response2).toHaveProperty('maxAgeDays');
          expect(response2).toHaveProperty('maxCount');

          // Assert all values are integers
          expect(Number.isInteger(response1.maxAgeDays)).toBe(true);
          expect(Number.isInteger(response1.maxCount)).toBe(true);
          expect(Number.isInteger(response2.maxAgeDays)).toBe(true);
          expect(Number.isInteger(response2.maxCount)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
