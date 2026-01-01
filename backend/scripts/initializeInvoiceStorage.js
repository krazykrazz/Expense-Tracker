const path = require('path');
const logger = require('../config/logger');
const fileStorage = require('../utils/fileStorage');
const filePermissions = require('../utils/filePermissions');

/**
 * Initialize invoice storage infrastructure
 * Creates directory structure and sets proper permissions
 */
async function initializeInvoiceStorage() {
  try {
    logger.info('Starting invoice storage initialization...');

    // Initialize base directories
    await fileStorage.initializeDirectories();

    // Set up secure permissions
    const baseDir = path.join(process.cwd(), 'config', 'invoices');
    const tempDir = path.join(baseDir, 'temp');

    // Secure the base invoice directory
    await filePermissions.secureDirectory(baseDir, {
      restrictive: false,
      removeWorldWrite: true,
      removeWorldRead: false
    });

    // Secure the temp directory
    await filePermissions.secureDirectory(tempDir, {
      restrictive: false,
      removeWorldWrite: true,
      removeWorldRead: false
    });

    // Verify permissions
    const basePermInfo = await filePermissions.getPermissionInfo(baseDir);
    const tempPermInfo = await filePermissions.getPermissionInfo(tempDir);

    logger.info('Invoice storage initialization completed successfully');
    logger.info('Base directory permissions:', {
      path: baseDir,
      permissions: basePermInfo.permissions,
      readable: basePermInfo.readable,
      writable: basePermInfo.writable,
      issues: basePermInfo.securityIssues
    });
    logger.info('Temp directory permissions:', {
      path: tempDir,
      permissions: tempPermInfo.permissions,
      readable: tempPermInfo.readable,
      writable: tempPermInfo.writable,
      issues: tempPermInfo.securityIssues
    });

    // Clean up any old temp files
    const cleanedCount = await fileStorage.cleanupTempFiles(24);
    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} old temporary files`);
    }

    return {
      success: true,
      baseDirectory: baseDir,
      tempDirectory: tempDir,
      basePermissions: basePermInfo,
      tempPermissions: tempPermInfo,
      cleanedTempFiles: cleanedCount
    };

  } catch (error) {
    logger.error('Failed to initialize invoice storage:', error);
    throw error;
  }
}

/**
 * Verify invoice storage is properly configured
 */
async function verifyInvoiceStorage() {
  try {
    const baseDir = path.join(process.cwd(), 'config', 'invoices');
    const tempDir = path.join(baseDir, 'temp');

    // Check if directories exist and are accessible
    const baseInfo = await filePermissions.getPermissionInfo(baseDir);
    const tempInfo = await filePermissions.getPermissionInfo(tempDir);

    const issues = [];
    
    if (!baseInfo.exists) {
      issues.push('Base invoice directory does not exist');
    } else {
      if (!baseInfo.readable) issues.push('Base directory is not readable');
      if (!baseInfo.writable) issues.push('Base directory is not writable');
      if (baseInfo.securityIssues.length > 0) {
        issues.push(...baseInfo.securityIssues.map(issue => `Base directory: ${issue}`));
      }
    }

    if (!tempInfo.exists) {
      issues.push('Temp directory does not exist');
    } else {
      if (!tempInfo.readable) issues.push('Temp directory is not readable');
      if (!tempInfo.writable) issues.push('Temp directory is not writable');
      if (tempInfo.securityIssues.length > 0) {
        issues.push(...tempInfo.securityIssues.map(issue => `Temp directory: ${issue}`));
      }
    }

    const isValid = issues.length === 0;

    logger.info('Invoice storage verification completed:', {
      isValid,
      issues: issues.length > 0 ? issues : 'No issues found'
    });

    return {
      isValid,
      issues,
      baseDirectory: baseInfo,
      tempDirectory: tempInfo
    };

  } catch (error) {
    logger.error('Failed to verify invoice storage:', error);
    return {
      isValid: false,
      issues: ['Failed to verify storage configuration'],
      error: error.message
    };
  }
}

// Export functions for use in other modules
module.exports = {
  initializeInvoiceStorage,
  verifyInvoiceStorage
};

// Allow running as standalone script
if (require.main === module) {
  (async () => {
    try {
      console.log('Initializing invoice storage...');
      const result = await initializeInvoiceStorage();
      console.log('Initialization completed successfully:', result);
      
      console.log('\nVerifying storage configuration...');
      const verification = await verifyInvoiceStorage();
      console.log('Verification result:', verification);
      
      if (!verification.isValid) {
        console.error('Storage verification failed. Issues found:');
        verification.issues.forEach(issue => console.error(`- ${issue}`));
        process.exit(1);
      }
      
      console.log('Invoice storage is ready for use.');
    } catch (error) {
      console.error('Failed to initialize invoice storage:', error);
      process.exit(1);
    }
  })();
}