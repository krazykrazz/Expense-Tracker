const request = require('supertest');
const express = require('express');
const path = require('path');
const fs = require('fs');
const { getDatabase } = require('../database/db');
const invoiceRoutes = require('../routes/invoiceRoutes');
const fileStorage = require('../utils/fileStorage');

// Create test app
const app = express();
app.use(express.json());
app.use('/api/invoices', invoiceRoutes);

describe('Invoice API Integration Tests', () => {
  let db;
  let testExpenseId;
  let testInvoiceId;
  const testDir = path.join(__dirname, '../config/invoices/test');
  const testFile = path.join(__dirname, 'test-files/test-invoice.pdf');

  beforeAll(async () => {
    // Initialize database
    db = await getDatabase();
    
    // Initialize file storage directories
    await fileStorage.initializeDirectories();
    
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    
    // Create a test PDF file
    const testFileDir = path.dirname(testFile);
    if (!fs.existsSync(testFileDir)) {
      fs.mkdirSync(testFileDir, { recursive: true });
    }
    
    // Create a minimal PDF file for testing
    const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
    const pdfContent = Buffer.concat([
      pdfHeader,
      Buffer.from('-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n'),
      Buffer.from('2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n'),
      Buffer.from('3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\n'),
      Buffer.from('xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000074 00000 n \n0000000120 00000 n \n'),
      Buffer.from('trailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n202\n%%EOF')
    ]);
    
    fs.writeFileSync(testFile, pdfContent);
  });

  beforeEach(async () => {
    // Clean up database
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expense_invoices', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      db.run('DELETE FROM expenses', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create a test medical expense
    testExpenseId = await new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO expenses (date, place, amount, type, method, week)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      const params = ['2025-01-01', 'Test Medical Clinic', 150.00, 'Tax - Medical', 'CIBC MC', 1];
      
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });
  });

  afterEach(async () => {
    // Clean up test files
    const invoicesDir = path.join(__dirname, '../config/invoices');
    if (fs.existsSync(invoicesDir)) {
      const files = fs.readdirSync(invoicesDir, { recursive: true });
      files.forEach(file => {
        const filePath = path.join(invoicesDir, file);
        if (fs.statSync(filePath).isFile() && filePath.includes('test')) {
          fs.unlinkSync(filePath);
        }
      });
    }
  });

  afterAll(async () => {
    // Clean up test files
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }
    
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('POST /api/invoices/upload', () => {
    it('should upload invoice successfully', async () => {
      const response = await request(app)
        .post('/api/invoices/upload')
        .field('expenseId', testExpenseId.toString())
        .attach('invoice', testFile)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.invoice).toBeDefined();
      expect(response.body.invoice.expenseId).toBe(testExpenseId);
      expect(response.body.invoice.originalFilename).toBe('test-invoice.pdf');
      expect(response.body.invoice.fileSize).toBeGreaterThan(0);

      testInvoiceId = response.body.invoice.id;
    });

    it('should reject upload without expense ID', async () => {
      const response = await request(app)
        .post('/api/invoices/upload')
        .attach('invoice', testFile)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Expense ID is required');
    });

    it('should reject upload without file', async () => {
      const response = await request(app)
        .post('/api/invoices/upload')
        .field('expenseId', testExpenseId.toString())
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invoice file is required');
    });

    it('should reject upload for non-existent expense', async () => {
      const response = await request(app)
        .post('/api/invoices/upload')
        .field('expenseId', '99999')
        .attach('invoice', testFile)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Expense not found');
    });

    it('should reject upload for non-medical expense', async () => {
      // Create a non-medical expense
      const nonMedicalExpenseId = await new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO expenses (date, place, amount, type, method, week)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        const params = ['2025-01-01', 'Test Grocery Store', 50.00, 'Groceries', 'CIBC MC', 1];
        
        db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });

      const response = await request(app)
        .post('/api/invoices/upload')
        .field('expenseId', nonMedicalExpenseId.toString())
        .attach('invoice', testFile)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('medical expenses');
    });

    it('should reject duplicate invoice upload', async () => {
      // Upload first invoice
      await request(app)
        .post('/api/invoices/upload')
        .field('expenseId', testExpenseId.toString())
        .attach('invoice', testFile)
        .expect(200);

      // Try to upload second invoice for same expense
      const response = await request(app)
        .post('/api/invoices/upload')
        .field('expenseId', testExpenseId.toString())
        .attach('invoice', testFile)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('already has an invoice');
    });

    it('should reject non-PDF files', async () => {
      // Create a text file
      const textFile = path.join(__dirname, 'test-files/test.txt');
      const textFileDir = path.dirname(textFile);
      if (!fs.existsSync(textFileDir)) {
        fs.mkdirSync(textFileDir, { recursive: true });
      }
      fs.writeFileSync(textFile, 'This is not a PDF file');

      const response = await request(app)
        .post('/api/invoices/upload')
        .field('expenseId', testExpenseId.toString())
        .attach('invoice', textFile)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('validation failed');

      // Clean up
      fs.unlinkSync(textFile);
    });

    it('should reject files that are too large', async () => {
      // Create a large file (simulate > 10MB)
      const largeFile = path.join(__dirname, 'test-files/large.pdf');
      const largeFileDir = path.dirname(largeFile);
      if (!fs.existsSync(largeFileDir)) {
        fs.mkdirSync(largeFileDir, { recursive: true });
      }
      
      // Create a file with PDF header but large size
      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
      const largeContent = Buffer.alloc(11 * 1024 * 1024); // 11MB
      const largeBuffer = Buffer.concat([pdfHeader, largeContent]);
      fs.writeFileSync(largeFile, largeBuffer);

      const response = await request(app)
        .post('/api/invoices/upload')
        .field('expenseId', testExpenseId.toString())
        .attach('invoice', largeFile)
        .expect(413);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('File too large');

      // Clean up
      fs.unlinkSync(largeFile);
    });
  });

  describe('GET /api/invoices/:expenseId', () => {
    beforeEach(async () => {
      // Upload an invoice for testing
      const uploadResponse = await request(app)
        .post('/api/invoices/upload')
        .field('expenseId', testExpenseId.toString())
        .attach('invoice', testFile);
      
      testInvoiceId = uploadResponse.body.invoice.id;
    });

    it('should get invoice file successfully', async () => {
      const response = await request(app)
        .get(`/api/invoices/${testExpenseId}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('inline');
      expect(response.headers['content-disposition']).toContain('test-invoice.pdf');
      expect(response.body).toBeDefined();
    });

    it('should return 404 for non-existent expense', async () => {
      const response = await request(app)
        .get('/api/invoices/99999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Expense not found');
    });

    it('should return 404 for expense without invoice', async () => {
      // Create another expense without invoice
      const anotherExpenseId = await new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO expenses (date, place, amount, type, method, week)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        const params = ['2025-01-02', 'Another Medical Clinic', 200.00, 'Tax - Medical', 'CIBC MC', 1];
        
        db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });

      const response = await request(app)
        .get(`/api/invoices/${anotherExpenseId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('No invoice found');
    });
  });

  describe('GET /api/invoices/:expenseId/metadata', () => {
    beforeEach(async () => {
      // Upload an invoice for testing
      const uploadResponse = await request(app)
        .post('/api/invoices/upload')
        .field('expenseId', testExpenseId.toString())
        .attach('invoice', testFile);
      
      testInvoiceId = uploadResponse.body.invoice.id;
    });

    it('should get invoice metadata successfully', async () => {
      const response = await request(app)
        .get(`/api/invoices/${testExpenseId}/metadata`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.invoice).toBeDefined();
      expect(response.body.invoice.expenseId).toBe(testExpenseId);
      expect(response.body.invoice.originalFilename).toBe('test-invoice.pdf');
      expect(response.body.invoice.fileSize).toBeGreaterThan(0);
      expect(response.body.invoice.uploadDate).toBeDefined();
    });

    it('should return 404 for non-existent expense', async () => {
      const response = await request(app)
        .get('/api/invoices/99999/metadata')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Expense not found');
    });

    it('should return 404 for expense without invoice', async () => {
      // Create another expense without invoice
      const anotherExpenseId = await new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO expenses (date, place, amount, type, method, week)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        const params = ['2025-01-02', 'Another Medical Clinic', 200.00, 'Tax - Medical', 'CIBC MC', 1];
        
        db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });

      const response = await request(app)
        .get(`/api/invoices/${anotherExpenseId}/metadata`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('No invoice found');
    });
  });

  describe('DELETE /api/invoices/:expenseId', () => {
    beforeEach(async () => {
      // Upload an invoice for testing
      const uploadResponse = await request(app)
        .post('/api/invoices/upload')
        .field('expenseId', testExpenseId.toString())
        .attach('invoice', testFile);
      
      testInvoiceId = uploadResponse.body.invoice.id;
    });

    it('should delete invoice successfully', async () => {
      const response = await request(app)
        .delete(`/api/invoices/${testExpenseId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('deleted successfully');

      // Verify invoice is deleted
      const getResponse = await request(app)
        .get(`/api/invoices/${testExpenseId}`)
        .expect(404);

      expect(getResponse.body.error).toContain('No invoice found');
    });

    it('should return 404 for non-existent expense', async () => {
      const response = await request(app)
        .delete('/api/invoices/99999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Expense not found');
    });

    it('should return 404 for expense without invoice', async () => {
      // Create another expense without invoice
      const anotherExpenseId = await new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO expenses (date, place, amount, type, method, week)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        const params = ['2025-01-02', 'Another Medical Clinic', 200.00, 'Tax - Medical', 'CIBC MC', 1];
        
        db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });

      const response = await request(app)
        .delete(`/api/invoices/${anotherExpenseId}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('No invoice found');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed expense ID', async () => {
      const response = await request(app)
        .get('/api/invoices/invalid-id')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid expense ID');
    });

    it('should handle database errors gracefully', async () => {
      // Close database to simulate error
      await new Promise((resolve) => {
        db.close(resolve);
      });

      const response = await request(app)
        .get(`/api/invoices/${testExpenseId}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Internal server error');

      // Reconnect database for cleanup
      db = await getDatabase();
    });
  });

  describe('Authentication and Authorization', () => {
    // Note: These tests assume future authentication implementation
    // For now, they test the current behavior without authentication

    it('should allow access without authentication (current behavior)', async () => {
      // Upload an invoice
      const uploadResponse = await request(app)
        .post('/api/invoices/upload')
        .field('expenseId', testExpenseId.toString())
        .attach('invoice', testFile)
        .expect(200);

      expect(uploadResponse.body.success).toBe(true);

      // Access the invoice
      const getResponse = await request(app)
        .get(`/api/invoices/${testExpenseId}`)
        .expect(200);

      expect(getResponse.headers['content-type']).toBe('application/pdf');
    });

    // Future authentication tests would go here
    // it('should require authentication for upload', async () => { ... });
    // it('should require authorization for access', async () => { ... });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent uploads to different expenses', async () => {
      // Create another medical expense
      const anotherExpenseId = await new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO expenses (date, place, amount, type, method, week)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        const params = ['2025-01-02', 'Another Medical Clinic', 200.00, 'Tax - Medical', 'CIBC MC', 1];
        
        db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        });
      });

      // Upload to both expenses concurrently
      const [response1, response2] = await Promise.all([
        request(app)
          .post('/api/invoices/upload')
          .field('expenseId', testExpenseId.toString())
          .attach('invoice', testFile),
        request(app)
          .post('/api/invoices/upload')
          .field('expenseId', anotherExpenseId.toString())
          .attach('invoice', testFile)
      ]);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response1.body.success).toBe(true);
      expect(response2.body.success).toBe(true);
      expect(response1.body.invoice.expenseId).toBe(testExpenseId);
      expect(response2.body.invoice.expenseId).toBe(anotherExpenseId);
    });

    it('should handle concurrent operations on same expense', async () => {
      // Upload an invoice first
      await request(app)
        .post('/api/invoices/upload')
        .field('expenseId', testExpenseId.toString())
        .attach('invoice', testFile)
        .expect(200);

      // Try concurrent get and delete operations
      const [getResponse, deleteResponse] = await Promise.all([
        request(app).get(`/api/invoices/${testExpenseId}`),
        request(app).delete(`/api/invoices/${testExpenseId}`)
      ]);

      // One should succeed, the other should handle the race condition gracefully
      expect(getResponse.status === 200 || getResponse.status === 404).toBe(true);
      expect(deleteResponse.status === 200 || deleteResponse.status === 404).toBe(true);
    });
  });
});
