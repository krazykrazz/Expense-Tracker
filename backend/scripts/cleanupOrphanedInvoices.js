/**
 * Cleanup Orphaned Invoice Files
 * 
 * This script removes invoice files that exist in the file system
 * but have no corresponding record in the database.
 * 
 * Usage:
 *   node backend/scripts/cleanupOrphanedInvoices.js [--dry-run] [--backup]
 * 
 * Options:
 *   --dry-run  Show what would be deleted without actually deleting
 *   --backup   Create backup of files before deletion
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const createBackup = args.includes('--backup');

// Configuration
const INVOICE_DIR = path.join(__dirname, '../config/invoices');
const BACKUP_DIR = path.join(__dirname, '../config/invoices-backup');
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
      // Skip temp and backup directories
      if (file !== 'temp' && file !== 'invoices-backup') {
        findAllPDFs(filePath, fileList);
      }
    } else if (file.endsWith('.pdf')) {
      fileList.push({ name: file, path: filePath });
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
 * Create backup directory structure
 */
function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}`);
  fs.mkdirSync(backupPath, { recursive: true });
  
  return backupPath;
}

/**
 * Backup a file
 */
function backupFile(filePath, backupDir) {
  try {
    const filename = path.basename(filePath);
    const backupPath = path.join(backupDir, filename);
    fs.copyFileSync(filePath, backupPath);
    return true;
  } catch (err) {
    console.error(`Error backing up ${filePath}:`, err.message);
    return false;
  }
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
  console.log('Cleanup Orphaned Invoice Files');
  console.log('================================\n');
  
  if (dryRun) {
    console.log('DRY RUN MODE - No files will be deleted\n');
  }
  
  if (createBackup && !dryRun) {
    console.log('Backup mode enabled - Files will be backed up before deletion\n');
  }
  
  try {
    // Get database invoices
    const dbInvoices = await getDatabaseInvoices();
    console.log(`Database records: ${dbInvoices.length}`);
    
    // Get file system invoices
    const fsInvoices = findAllPDFs(INVOICE_DIR);
    console.log(`File system files: ${fsInvoices.length}\n`);
    
    // Find orphaned files
    const orphaned = fsInvoices.filter(file => !dbInvoices.includes(file.name));
    
    if (orphaned.length === 0) {
      console.log('✓ No orphaned files found!');
      return;
    }
    
    console.log(`Found ${orphaned.length} orphaned file(s)\n`);
    
    // Create backup directory if needed
    let backupDir = null;
    if (createBackup && !dryRun) {
      backupDir = ensureBackupDir();
      console.log(`Backup directory: ${backupDir}\n`);
    }
    
    // Process orphaned files
    let totalSize = 0;
    let deletedCount = 0;
    let backedUpCount = 0;
    
    console.log('Processing files:\n');
    
    for (let i = 0; i < orphaned.length; i++) {
      const file = orphaned[i];
      const stat = fs.statSync(file.path);
      totalSize += stat.size;
      
      console.log(`${i + 1}. ${file.name}`);
      console.log(`   Path: ${file.path}`);
      console.log(`   Size: ${formatFileSize(stat.size)}`);
      console.log(`   Modified: ${stat.mtime.toISOString()}`);
      
      if (dryRun) {
        console.log(`   [DRY RUN] Would delete this file`);
      } else {
        // Backup if requested
        if (createBackup) {
          if (backupFile(file.path, backupDir)) {
            console.log(`   ✓ Backed up`);
            backedUpCount++;
          } else {
            console.log(`   ✗ Backup failed - skipping deletion`);
            continue;
          }
        }
        
        // Delete file
        if (deleteFile(file.path)) {
          console.log(`   ✓ Deleted`);
          deletedCount++;
        } else {
          console.log(`   ✗ Failed to delete`);
        }
      }
      
      console.log('');
    }
    
    // Summary
    console.log('Summary');
    console.log('=======');
    console.log(`Total orphaned files: ${orphaned.length}`);
    console.log(`Total size: ${formatFileSize(totalSize)}`);
    
    if (dryRun) {
      console.log('\nDRY RUN - No files were deleted');
      console.log('Run without --dry-run to actually delete files');
    } else {
      if (createBackup) {
        console.log(`Backed up: ${backedUpCount} files`);
      }
      console.log(`Deleted: ${deletedCount} files`);
      
      if (deletedCount < orphaned.length) {
        console.log(`Failed: ${orphaned.length - deletedCount} files`);
      }
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
