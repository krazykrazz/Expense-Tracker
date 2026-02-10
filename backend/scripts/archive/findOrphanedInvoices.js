/**
 * Find Orphaned Invoice Files
 * 
 * This script identifies invoice files that exist in the file system
 * but have no corresponding record in the database.
 * 
 * Usage:
 *   node backend/scripts/findOrphanedInvoices.js [--verbose] [--delete]
 * 
 * Options:
 *   --verbose  Show detailed information
 *   --delete   Delete orphaned files (use with caution!)
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Parse command line arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const deleteFiles = args.includes('--delete');

// Configuration
const INVOICE_DIR = path.join(__dirname, '../config/invoices');
const DB_PATH = path.join(__dirname, '../config/database/expenses.db');

// Connect to database
const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
});

/**
 * Get all invoice filenames from database
 */
function getDatabaseInvoices() {
  return new Promise((resolve, reject) => {
    db.all('SELECT filename FROM expense_invoices', [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows.map(row => row.filename));
      }
    });
  });
}

/**
 * Recursively find all PDF files in directory
 */
function findAllPDFs(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip temp directory
      if (file !== 'temp') {
        findAllPDFs(filePath, fileList);
      }
    } else if (file.endsWith('.pdf')) {
      fileList.push(file);
    }
  });
  
  return fileList;
}

/**
 * Get file size in human-readable format
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/**
 * Find full path of a file
 */
function findFilePath(filename, dir = INVOICE_DIR) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && file !== 'temp') {
      const found = findFilePath(filename, filePath);
      if (found) return found;
    } else if (file === filename) {
      return filePath;
    }
  }
  
  return null;
}

/**
 * Delete a file
 */
function deleteFile(filePath) {
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (err) {
    console.error(`Error deleting ${filePath}:`, err.message);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('Finding orphaned invoice files...\n');
  
  try {
    // Get database invoices
    const dbInvoices = await getDatabaseInvoices();
    console.log(`Database records: ${dbInvoices.length}`);
    
    // Get file system invoices
    const fsInvoices = findAllPDFs(INVOICE_DIR);
    console.log(`File system files: ${fsInvoices.length}\n`);
    
    // Find orphaned files
    const orphaned = fsInvoices.filter(file => !dbInvoices.includes(file));
    
    if (orphaned.length === 0) {
      console.log('✓ No orphaned files found!');
      return;
    }
    
    console.log(`Found ${orphaned.length} orphaned file(s):\n`);
    
    let totalSize = 0;
    let deletedCount = 0;
    
    orphaned.forEach((filename, index) => {
      const filePath = findFilePath(filename);
      if (!filePath) {
        console.log(`${index + 1}. ${filename} (path not found)`);
        return;
      }
      
      const stat = fs.statSync(filePath);
      totalSize += stat.size;
      
      if (verbose) {
        console.log(`${index + 1}. ${filename}`);
        console.log(`   Path: ${filePath}`);
        console.log(`   Size: ${formatFileSize(stat.size)}`);
        console.log(`   Modified: ${stat.mtime.toISOString()}`);
      } else {
        console.log(`${index + 1}. ${filename} (${formatFileSize(stat.size)})`);
      }
      
      // Delete if requested
      if (deleteFiles) {
        if (deleteFile(filePath)) {
          console.log(`   ✓ Deleted`);
          deletedCount++;
        } else {
          console.log(`   ✗ Failed to delete`);
        }
      }
      
      if (verbose) console.log('');
    });
    
    console.log(`\nTotal size: ${formatFileSize(totalSize)}`);
    
    if (deleteFiles) {
      console.log(`\nDeleted ${deletedCount} of ${orphaned.length} files`);
    } else {
      console.log('\nTo delete these files, run with --delete flag');
      console.log('WARNING: This action cannot be undone!');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

// Run main function
main();
