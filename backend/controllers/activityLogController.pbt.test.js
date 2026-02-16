const request = require('supertest');
const fc = require('fast-check');
const { getDatabase } = require('../database/db');
const activityLogRepository = require('../repositories/activityLogRepository');
const activityLogController = require('./activityLogController');
const settingsService = require('../services/settingsService');
const logger = require('../config/logger');

// Mock dependencies for unit tests
jest.mock('../services/settingsService');
jest.mock('../config/logger');

// Import app after database is ready
let app;

/**
 * @invariant Activity Log Controller API Correctness
 * 
 * This test suite validates critical properties of the activity log controller:
 * 1. Pagination limits are respected and metadata is accurate
 * 2. Settings responses always contain required integer fields
 * 3. Validation errors return descriptive messages
 * 
 * Randomization adds value by testing various pagination parameters, settings values,
 * and invalid inputs to ensure the API handles all cases correctly.
 */

describe('Activity Log Controller - Property-Based Tests', () => {
  let db;

  beforeAll(async () => {
    // Wait for database to be ready
    db = await getDatabase();
    // Import app after database is initialized
    app = require('../server');
  });

  describe('Pagination Properties', () => {
    beforeEach(async () => {
      // Clean up activity logs before each test - use repository method for consistency
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM activity_logs', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Verify cleanup worked
      const count = await activityLogRepository.count();
      if (count !== 0) {
        throw new Error(`Failed to clean up activity logs. Found ${count} events.`);
      }
    });

    afterEach(async () => {
      // Clean up after each test as well
      await new Promise((resolve, reject) => {
        db.run('DELETE FROM activity_logs', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });

    /**
     * Property 10: API Pagination Limit
     * 
     * For any API request with a limit parameter, the response should return at most
     * that many events, and the total count should reflect the actual number of events
     * in the database.
     * 
     * Validates: Requirements 8.3
     */
    it('should return at most the requested limit of events', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 50 }), // Total events to create
          fc.integer({ min: 1, max: 200 }), // Limit parameter
          fc.integer({ min: 0, max: 10 }), // Offset parameter
          async (totalEvents, limit, offset) => {
            // Clean up before this property test run
            await new Promise((resolve, reject) => {
              db.run('DELETE FROM activity_logs', (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
            
            // Insert test events
            const events = [];
            for (let i = 0; i < totalEvents; i++) {
              const event = {
                event_type: 'expense_added',
                entity_type: 'expense',
                entity_id: i + 1,
                user_action: `Added expense ${i + 1}`,
                metadata: JSON.stringify({ amount: 100 + i }),
                timestamp: new Date(Date.now() - i * 1000).toISOString()
              };
              await activityLogRepository.insert(event);
              events.push(event);
            }

            // Make API request
            const response = await request(app)
              .get('/api/activity-logs')
              .query({ limit, offset });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('events');
            expect(response.body).toHaveProperty('total');
            expect(response.body).toHaveProperty('limit');
            expect(response.body).toHaveProperty('offset');

            // Property: Response should return at most 'limit' events
            expect(response.body.events.length).toBeLessThanOrEqual(limit);

            // Property: Total count should match actual database count
            expect(response.body.total).toBe(totalEvents);

            // Property: Returned limit should match requested limit
            expect(response.body.limit).toBe(limit);

            // Property: Returned offset should match requested offset
            expect(response.body.offset).toBe(offset);

            // Property: If offset < total, we should get min(limit, total - offset) events
            const expectedCount = Math.max(0, Math.min(limit, totalEvents - offset));
            expect(response.body.events.length).toBe(expectedCount);

            // Property: Events should be in reverse chronological order (newest first)
            for (let i = 1; i < response.body.events.length; i++) {
              const prevTimestamp = new Date(response.body.events[i - 1].timestamp);
              const currTimestamp = new Date(response.body.events[i].timestamp);
              expect(prevTimestamp.getTime()).toBeGreaterThanOrEqual(currTimestamp.getTime());
            }
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should handle edge cases: limit exceeds total events', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }), // Small number of events
          fc.integer({ min: 50, max: 200 }), // Large limit
          async (totalEvents, limit) => {
            // Clean up before this property test run
            await new Promise((resolve, reject) => {
              db.run('DELETE FROM activity_logs', (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
            
            // Insert test events
            for (let i = 0; i < totalEvents; i++) {
              await activityLogRepository.insert({
                event_type: 'loan_added',
                entity_type: 'loan',
                entity_id: i + 1,
                user_action: `Added loan ${i + 1}`,
                metadata: null,
                timestamp: new Date(Date.now() - i * 1000).toISOString()
              });
            }

            // Make API request
            const response = await request(app)
              .get('/api/activity-logs')
              .query({ limit, offset: 0 });

            expect(response.status).toBe(200);

            // Property: Should return all events when limit > total
            expect(response.body.events.length).toBe(totalEvents);
            expect(response.body.total).toBe(totalEvents);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should handle edge cases: offset exceeds total events', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }), // Small number of events
          fc.integer({ min: 20, max: 100 }), // Large offset
          async (totalEvents, offset) => {
            // Clean up before this property test run
            await new Promise((resolve, reject) => {
              db.run('DELETE FROM activity_logs', (err) => {
                if (err) reject(err);
                else resolve();
              });
            });
            
            // Insert test events
            for (let i = 0; i < totalEvents; i++) {
              await activityLogRepository.insert({
                event_type: 'investment_updated',
                entity_type: 'investment',
                entity_id: i + 1,
                user_action: `Updated investment ${i + 1}`,
                metadata: null,
                timestamp: new Date(Date.now() - i * 1000).toISOString()
              });
            }

            // Make API request
            const response = await request(app)
              .get('/api/activity-logs')
              .query({ limit: 50, offset });

            expect(response.status).toBe(200);

            // Property: Should return empty array when offset >= total
            expect(response.body.events.length).toBe(0);
            expect(response.body.total).toBe(totalEvents);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should reject invalid limit values', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.integer({ max: 0 }), // Zero or negative
            fc.integer({ min: 201, max: 1000 }) // Above maximum
          ),
          async (invalidLimit) => {
            const response = await request(app)
              .get('/api/activity-logs')
              .query({ limit: invalidLimit });

            // Property: Invalid limits should return 400 Bad Request
            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should reject invalid offset values', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ max: -1 }), // Negative offset
          async (invalidOffset) => {
            const response = await request(app)
              .get('/api/activity-logs')
              .query({ limit: 50, offset: invalidOffset });

            // Property: Negative offsets should return 400 Bad Request
            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Settings Response Structure', () => {
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

    it('GET settings response always contains maxAgeDays and maxCount as integers', async () => {
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

    it('PUT settings response contains maxAgeDays and maxCount as integers', async () => {
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

    it('Response structure is consistent across different valid settings', async () => {
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

  describe('Validation Error Messages', () => {
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

    it('Invalid maxAgeDays returns 400 with descriptive error', async () => {
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

    it('Invalid maxCount returns 400 with descriptive error', async () => {
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

    it('Error messages describe why validation failed', async () => {
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

    it('Missing fields return specific error messages', async () => {
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
});
