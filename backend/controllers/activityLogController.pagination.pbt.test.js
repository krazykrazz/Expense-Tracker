const request = require('supertest');
const fc = require('fast-check');
const { getDatabase } = require('../database/db');
const activityLogRepository = require('../repositories/activityLogRepository');

// Import app after database is ready
let app;

/**
 * Property 10: API Pagination Limit
 * 
 * For any API request with a limit parameter, the response should return at most
 * that many events, and the total count should reflect the actual number of events
 * in the database.
 * 
 * Validates: Requirements 8.3
 */

describe('Property 10: API Pagination Limit', () => {
  let db;

  beforeAll(async () => {
    // Wait for database to be ready
    db = await getDatabase();
    // Import app after database is initialized
    app = require('../server');
  });

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
