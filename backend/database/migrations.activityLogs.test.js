const { getTestDatabase, resetTestDatabase } = require('./db');
const { migrateAddActivityLogsTable } = require('./migrations');

describe('Activity Logs Migration', () => {
  let db;

  beforeAll(async () => {
    db = await getTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  it('should create activity_logs table with correct schema', async () => {
    // Run the migration
    await migrateAddActivityLogsTable(db);

    // Verify table exists
    const tableInfo = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(activity_logs)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    expect(tableInfo).toBeDefined();
    expect(tableInfo.length).toBeGreaterThan(0);

    // Verify required columns exist
    const columnNames = tableInfo.map(col => col.name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('event_type');
    expect(columnNames).toContain('entity_type');
    expect(columnNames).toContain('entity_id');
    expect(columnNames).toContain('user_action');
    expect(columnNames).toContain('metadata');
    expect(columnNames).toContain('timestamp');
    expect(columnNames).toContain('created_at');
  });

  it('should create indexes for activity_logs table', async () => {
    // Run the migration
    await migrateAddActivityLogsTable(db);

    // Verify indexes exist
    const indexes = await new Promise((resolve, reject) => {
      db.all(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='activity_logs'",
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    const indexNames = indexes.map(idx => idx.name);
    expect(indexNames).toContain('idx_activity_logs_timestamp');
    expect(indexNames).toContain('idx_activity_logs_entity');
  });

  it('should allow inserting activity log events', async () => {
    // Run the migration
    await migrateAddActivityLogsTable(db);

    // Insert a test event
    const insertResult = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO activity_logs (event_type, entity_type, entity_id, user_action, metadata)
         VALUES (?, ?, ?, ?, ?)`,
        ['expense_added', 'expense', 123, 'Added expense: Groceries - $45.67', '{"amount":45.67,"category":"Groceries"}'],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    expect(insertResult).toBeGreaterThan(0);

    // Verify the event was inserted
    const event = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM activity_logs WHERE id = ?', [insertResult], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    expect(event).toBeDefined();
    expect(event.event_type).toBe('expense_added');
    expect(event.entity_type).toBe('expense');
    expect(event.entity_id).toBe(123);
    expect(event.user_action).toBe('Added expense: Groceries - $45.67');
    expect(event.metadata).toBe('{"amount":45.67,"category":"Groceries"}');
    expect(event.timestamp).toBeDefined();
  });

  it('should allow NULL entity_id for system events', async () => {
    // Run the migration
    await migrateAddActivityLogsTable(db);

    // Insert a system event with NULL entity_id
    const insertResult = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO activity_logs (event_type, entity_type, entity_id, user_action, metadata)
         VALUES (?, ?, ?, ?, ?)`,
        ['backup_created', 'system', null, 'Created backup: backup_20250127.db', '{"filename":"backup_20250127.db","size":2048576}'],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    expect(insertResult).toBeGreaterThan(0);

    // Verify the event was inserted with NULL entity_id
    const event = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM activity_logs WHERE id = ?', [insertResult], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    expect(event).toBeDefined();
    expect(event.entity_id).toBeNull();
  });

  it('should not run migration twice', async () => {
    // Run the migration first time
    await migrateAddActivityLogsTable(db);

    // Run the migration second time (should skip)
    await expect(migrateAddActivityLogsTable(db)).resolves.not.toThrow();

    // Verify table still exists and works
    const tableInfo = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(activity_logs)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    expect(tableInfo.length).toBeGreaterThan(0);
  });
});
