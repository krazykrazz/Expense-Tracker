const fc = require('fast-check');
const activityLogController = require('./activityLogController');
const settingsService = require('../services/settingsService');
const logger = require('../config/logger');

// Mock dependencies
jest.mock('../services/settingsService');
jest.mock('../config/logger');

describe('Activity Log Controller - Property 5: Validation Error Messages', () => {
  /**
   * Property 5: Validation Error Messages
   * Validates: Requirements 2.6
   * 
   * For any invalid settings update request, the system should return a 400 
   * status code with a descriptive error message indicating which field failed 
   * validation and why.
   */

  // Arbitrary for invalid maxAgeDays (outside 7-365 range)
  const invalidMaxAgeDaysArbitrary = fc.oneof(
    fc.integer({ max: 6 }),           // Too low
    fc.integer({ min: 366 }),         // Too high
    fc.double(),                      // Non-integer
    fc.constant(null),                // Null
    fc.constant(undefined),           // Undefined
    fc.constant('not a number')       // String
  );

  // Arbitrary for invalid maxCount (outside 100-10000 range)
  const invalidMaxCountArbitrary = fc.oneof(
    fc.integer({ max: 99 }),          // Too low
    fc.integer({ min: 10001 }),       // Too high
    fc.double(),                      // Non-integer
    fc.constant(null),                // Null
    fc.constant(undefined),           // Undefined
    fc.constant('not a number')       // String
  );

  // Arbitrary for valid values (for pairing with invalid ones)
  const validMaxAgeDaysArbitrary = fc.integer({ min: 7, max: 365 });
  const validMaxCountArbitrary = fc.integer({ min: 100, max: 10000 });

  it('Property 5: Invalid maxAgeDays returns 400 with descriptive error', async () => {
    await fc.assert(
      fc.asyncProperty(
        invalidMaxAgeDaysArbitrary,
        validMaxCountArbitrary,
        async (invalidMaxAgeDays, validMaxCount) => {
          // Setup
          const req = {
            body: {
              maxAgeDays: invalidMaxAgeDays,
              maxCount: validMaxCount
            }
          };
          const res = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis()
          };

          // Mock service to throw validation error
          if (invalidMaxAgeDays === null || invalidMaxAgeDays === undefined) {
            // Controller handles null/undefined before calling service
            settingsService.updateRetentionSettings.mockImplementation(() => {
              throw new Error('Should not be called');
            });
          } else if (typeof invalidMaxAgeDays !== 'number') {
            settingsService.updateRetentionSettings.mockRejectedValue(
              new Error('maxAgeDays must be a number')
            );
          } else if (!Number.isInteger(invalidMaxAgeDays)) {
            settingsService.updateRetentionSettings.mockRejectedValue(
              new Error('maxAgeDays must be an integer')
            );
          } else {
            settingsService.updateRetentionSettings.mockRejectedValue(
              new Error('maxAgeDays must be between 7 and 365')
            );
          }

          // Execute
          await activityLogController.updateSettings(req, res);

          // Verify 400 status code
          expect(res.status).toHaveBeenCalledWith(400);
          expect(res.json).toHaveBeenCalledTimes(1);

          const response = res.json.mock.calls[0][0];
          
          // Assert error message exists
          expect(response).toHaveProperty('error');
          expect(typeof response.error).toBe('string');
          expect(response.error.length).toBeGreaterThan(0);

          // Assert error message mentions the field
          expect(response.error.toLowerCase()).toContain('maxagedays');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 5: Invalid maxCount returns 400 with descriptive error', async () => {
    await fc.assert(
      fc.asyncProperty(
        validMaxAgeDaysArbitrary,
        invalidMaxCountArbitrary,
        async (validMaxAgeDays, invalidMaxCount) => {
          // Setup
          const req = {
            body: {
              maxAgeDays: validMaxAgeDays,
              maxCount: invalidMaxCount
            }
          };
          const res = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis()
          };

          // Mock service to throw validation error
          if (invalidMaxCount === null || invalidMaxCount === undefined) {
            // Controller handles null/undefined before calling service
            settingsService.updateRetentionSettings.mockImplementation(() => {
              throw new Error('Should not be called');
            });
          } else if (typeof invalidMaxCount !== 'number') {
            settingsService.updateRetentionSettings.mockRejectedValue(
              new Error('maxCount must be a number')
            );
          } else if (!Number.isInteger(invalidMaxCount)) {
            settingsService.updateRetentionSettings.mockRejectedValue(
              new Error('maxCount must be an integer')
            );
          } else {
            settingsService.updateRetentionSettings.mockRejectedValue(
              new Error('maxCount must be between 100 and 10000')
            );
          }

          // Execute
          await activityLogController.updateSettings(req, res);

          // Verify 400 status code
          expect(res.status).toHaveBeenCalledWith(400);
          expect(res.json).toHaveBeenCalledTimes(1);

          const response = res.json.mock.calls[0][0];
          
          // Assert error message exists
          expect(response).toHaveProperty('error');
          expect(typeof response.error).toBe('string');
          expect(response.error.length).toBeGreaterThan(0);

          // Assert error message mentions the field
          expect(response.error.toLowerCase()).toContain('maxcount');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 5: Error messages describe why validation failed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.record({ 
            maxAgeDays: fc.integer({ max: 6 }), 
            maxCount: validMaxCountArbitrary,
            expectedPhrase: fc.constant('between')
          }),
          fc.record({ 
            maxAgeDays: fc.integer({ min: 366 }), 
            maxCount: validMaxCountArbitrary,
            expectedPhrase: fc.constant('between')
          }),
          fc.record({ 
            maxAgeDays: validMaxAgeDaysArbitrary, 
            maxCount: fc.integer({ max: 99 }),
            expectedPhrase: fc.constant('between')
          }),
          fc.record({ 
            maxAgeDays: validMaxAgeDaysArbitrary, 
            maxCount: fc.integer({ min: 10001 }),
            expectedPhrase: fc.constant('between')
          })
        ),
        async ({ maxAgeDays, maxCount, expectedPhrase }) => {
          // Setup
          const req = {
            body: { maxAgeDays, maxCount }
          };
          const res = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis()
          };

          // Mock service to throw appropriate validation error
          if (maxAgeDays < 7 || maxAgeDays > 365) {
            settingsService.updateRetentionSettings.mockRejectedValue(
              new Error('maxAgeDays must be between 7 and 365')
            );
          } else {
            settingsService.updateRetentionSettings.mockRejectedValue(
              new Error('maxCount must be between 100 and 10000')
            );
          }

          // Execute
          await activityLogController.updateSettings(req, res);

          // Verify error message describes the reason
          const response = res.json.mock.calls[0][0];
          expect(response.error.toLowerCase()).toContain(expectedPhrase);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 5: Missing fields return specific error messages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.record({ 
            body: fc.record({ maxCount: validMaxCountArbitrary }),
            missingField: fc.constant('maxAgeDays')
          }),
          fc.record({ 
            body: fc.record({ maxAgeDays: validMaxAgeDaysArbitrary }),
            missingField: fc.constant('maxCount')
          })
        ),
        async ({ body, missingField }) => {
          // Setup
          const req = { body };
          const res = {
            json: jest.fn(),
            status: jest.fn().mockReturnThis()
          };

          // Execute
          await activityLogController.updateSettings(req, res);

          // Verify 400 status and specific error message
          expect(res.status).toHaveBeenCalledWith(400);
          const response = res.json.mock.calls[0][0];
          
          expect(response.error).toContain('Missing required field');
          expect(response.error).toContain(missingField);
        }
      ),
      { numRuns: 100 }
    );
  });
});
