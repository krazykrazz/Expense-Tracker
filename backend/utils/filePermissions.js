const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');

/**
 * File permissions and security utilities
 * Handles file permissions, access control, and security measures
 */
class FilePermissionsUtils {
  constructor() {
    // Default permissions
    this.DEFAULT_DIR_MODE = 0o755;  // rwxr-xr-x
    this.DEFAULT_FILE_MODE = 0o644; // rw-r--r--
    this.SECURE_DIR_MODE = 0o750;   // rwxr-x---
    this.SECURE_FILE_MODE = 0o640;  // rw-r-----
  }

  /**
   * Set secure permissions on a directory
   * @param {string} dirPath - Directory path
   * @param {boolean} restrictive - Use more restrictive permissions
   */
  async setDirectoryPermissions(dirPath, restrictive = false) {
    try {
      const mode = restrictive ? this.SECURE_DIR_MODE : this.DEFAULT_DIR_MODE;
      await fs.promises.chmod(dirPath, mode);
      logger.debug('Set directory permissions:', { path: dirPath, mode: mode.toString(8) });
    } catch (error) {
      logger.error('Failed to set directory permissions:', error);
      throw error;
    }
  }

  /**
   * Set secure permissions on a file
   * @param {string} filePath - File path
   * @param {boolean} restrictive - Use more restrictive permissions
   */
  async setFilePermissions(filePath, restrictive = false) {
    try {
      const mode = restrictive ? this.SECURE_FILE_MODE : this.DEFAULT_FILE_MODE;
      await fs.promises.chmod(filePath, mode);
      logger.debug('Set file permissions:', { path: filePath, mode: mode.toString(8) });
    } catch (error) {
      logger.error('Failed to set file permissions:', error);
      throw error;
    }
  }

  /**
   * Verify file permissions are secure
   * @param {string} filePath - File path to check
   * @returns {Object} Permission check result
   */
  async verifyFilePermissions(filePath) {
    const result = {
      isSecure: false,
      permissions: null,
      issues: [],
      recommendations: []
    };

    try {
      const stats = await fs.promises.stat(filePath);
      const mode = stats.mode;
      const permissions = (mode & parseInt('777', 8)).toString(8);
      
      result.permissions = permissions;

      // On Windows, permission checking is different
      const isWindows = process.platform === 'win32';
      
      if (isWindows) {
        // On Windows, just check basic access
        const canRead = await this.hasPermission(filePath, 'read');
        const canWrite = await this.hasPermission(filePath, 'write');
        
        if (!canRead) {
          result.issues.push('File is not readable');
        }
        if (!canWrite) {
          result.issues.push('File is not writable');
        }
        
        // Check if file is executable (should not be for data files)
        if (mode & 0o111) {
          result.recommendations.push('Consider removing execute permissions');
        }
        
        // Windows files are generally secure by default
        result.isSecure = canRead && canWrite;
      } else {
        // Unix-like systems - check traditional permissions
        
        // Check if file is readable by owner
        if (!(mode & 0o400)) {
          result.issues.push('File is not readable by owner');
        }

        // Check if file is writable by owner
        if (!(mode & 0o200)) {
          result.issues.push('File is not writable by owner');
        }

        // Check if file is executable (should not be for data files)
        if (mode & 0o111) {
          result.issues.push('File should not be executable');
          result.recommendations.push('Remove execute permissions');
        }

        // Check if file is world-writable (security risk)
        if (mode & 0o002) {
          result.issues.push('File is world-writable (security risk)');
          result.recommendations.push('Remove world-write permissions');
        }

        // Check if file is world-readable (may be acceptable for some files)
        if (mode & 0o004) {
          result.recommendations.push('Consider removing world-read permissions for sensitive files');
        }

        result.isSecure = result.issues.length === 0;
      }
      
      return result;
    } catch (error) {
      logger.error('Failed to verify file permissions:', error);
      result.issues.push('Failed to check file permissions');
      return result;
    }
  }

  /**
   * Verify directory permissions are secure
   * @param {string} dirPath - Directory path to check
   * @returns {Object} Permission check result
   */
  async verifyDirectoryPermissions(dirPath) {
    const result = {
      isSecure: false,
      permissions: null,
      issues: [],
      recommendations: []
    };

    try {
      const stats = await fs.promises.stat(dirPath);
      const mode = stats.mode;
      const permissions = (mode & parseInt('777', 8)).toString(8);
      
      result.permissions = permissions;

      // On Windows, permission checking is different
      const isWindows = process.platform === 'win32';
      
      if (isWindows) {
        // On Windows, just check basic access
        const canRead = await this.hasPermission(dirPath, 'read');
        const canWrite = await this.hasPermission(dirPath, 'write');
        
        if (!canRead) {
          result.issues.push('Directory is not readable');
        }
        if (!canWrite) {
          result.issues.push('Directory is not writable');
        }
        
        // Windows directories are generally secure by default
        result.isSecure = canRead && canWrite;
      } else {
        // Unix-like systems - check traditional permissions
        
        // Check if directory is readable by owner
        if (!(mode & 0o400)) {
          result.issues.push('Directory is not readable by owner');
        }

        // Check if directory is writable by owner
        if (!(mode & 0o200)) {
          result.issues.push('Directory is not writable by owner');
        }

        // Check if directory is executable by owner (required for access)
        if (!(mode & 0o100)) {
          result.issues.push('Directory is not executable by owner');
        }

        // Check if directory is world-writable (security risk)
        if (mode & 0o002) {
          result.issues.push('Directory is world-writable (security risk)');
          result.recommendations.push('Remove world-write permissions');
        }

        result.isSecure = result.issues.length === 0;
      }
      
      return result;
    } catch (error) {
      logger.error('Failed to verify directory permissions:', error);
      result.issues.push('Failed to check directory permissions');
      return result;
    }
  }

  /**
   * Secure a file by setting appropriate permissions and ownership
   * @param {string} filePath - File path to secure
   * @param {Object} options - Security options
   */
  async secureFile(filePath, options = {}) {
    const {
      restrictive = false,
      removeExecute = true,
      removeWorldWrite = true,
      removeWorldRead = false
    } = options;

    try {
      const stats = await fs.promises.stat(filePath);
      let mode = stats.mode;

      // Remove execute permissions if requested
      if (removeExecute) {
        mode &= ~0o111;
      }

      // Remove world-write permissions if requested
      if (removeWorldWrite) {
        mode &= ~0o002;
      }

      // Remove world-read permissions if requested
      if (removeWorldRead) {
        mode &= ~0o004;
      }

      // Apply restrictive permissions if requested
      if (restrictive) {
        mode = (mode & ~0o077) | 0o040; // Remove group/other permissions, add group read
      }

      await fs.promises.chmod(filePath, mode);
      logger.debug('Secured file:', { path: filePath, mode: (mode & parseInt('777', 8)).toString(8) });
    } catch (error) {
      logger.error('Failed to secure file:', error);
      throw error;
    }
  }

  /**
   * Secure a directory by setting appropriate permissions
   * @param {string} dirPath - Directory path to secure
   * @param {Object} options - Security options
   */
  async secureDirectory(dirPath, options = {}) {
    const {
      restrictive = false,
      removeWorldWrite = true,
      removeWorldRead = false,
      recursive = false
    } = options;

    try {
      const stats = await fs.promises.stat(dirPath);
      let mode = stats.mode;

      // Ensure owner has full access
      mode |= 0o700;

      // Remove world-write permissions if requested
      if (removeWorldWrite) {
        mode &= ~0o002;
      }

      // Remove world-read permissions if requested
      if (removeWorldRead) {
        mode &= ~0o004;
      }

      // Apply restrictive permissions if requested
      if (restrictive) {
        mode = (mode & ~0o077) | 0o050; // Remove group/other permissions, add group read/execute
      }

      await fs.promises.chmod(dirPath, mode);
      logger.debug('Secured directory:', { path: dirPath, mode: (mode & parseInt('777', 8)).toString(8) });

      // Recursively secure subdirectories if requested
      if (recursive) {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          if (entry.isDirectory()) {
            await this.secureDirectory(fullPath, options);
          } else if (entry.isFile()) {
            await this.secureFile(fullPath, options);
          }
        }
      }
    } catch (error) {
      logger.error('Failed to secure directory:', error);
      throw error;
    }
  }

  /**
   * Check if current process has required permissions for a path
   * @param {string} filePath - Path to check
   * @param {string} operation - Operation to check ('read', 'write', 'execute')
   * @returns {boolean} True if permission is available
   */
  async hasPermission(filePath, operation) {
    try {
      let mode;
      
      switch (operation.toLowerCase()) {
        case 'read':
          mode = fs.constants.R_OK;
          break;
        case 'write':
          mode = fs.constants.W_OK;
          break;
        case 'execute':
          mode = fs.constants.X_OK;
          break;
        default:
          throw new Error(`Invalid operation: ${operation}`);
      }

      await fs.promises.access(filePath, mode);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get comprehensive permission information for a path
   * @param {string} filePath - Path to analyze
   * @returns {Object} Detailed permission information
   */
  async getPermissionInfo(filePath) {
    const info = {
      exists: false,
      isFile: false,
      isDirectory: false,
      permissions: null,
      readable: false,
      writable: false,
      executable: false,
      securityIssues: [],
      recommendations: []
    };

    try {
      const stats = await fs.promises.stat(filePath);
      info.exists = true;
      info.isFile = stats.isFile();
      info.isDirectory = stats.isDirectory();
      
      const mode = stats.mode;
      info.permissions = (mode & parseInt('777', 8)).toString(8);
      
      // Check access permissions
      info.readable = await this.hasPermission(filePath, 'read');
      info.writable = await this.hasPermission(filePath, 'write');
      info.executable = await this.hasPermission(filePath, 'execute');
      
      // Security analysis
      if (info.isFile) {
        const fileCheck = await this.verifyFilePermissions(filePath);
        info.securityIssues = fileCheck.issues;
        info.recommendations = fileCheck.recommendations;
      } else if (info.isDirectory) {
        const dirCheck = await this.verifyDirectoryPermissions(filePath);
        info.securityIssues = dirCheck.issues;
        info.recommendations = dirCheck.recommendations;
      }
      
      return info;
    } catch (error) {
      if (error.code === 'ENOENT') {
        info.exists = false;
      } else {
        logger.error('Failed to get permission info:', error);
        info.securityIssues.push('Failed to analyze permissions');
      }
      return info;
    }
  }

  /**
   * Initialize secure directory structure with proper permissions
   * @param {string} basePath - Base directory path
   * @param {Array} subdirs - Array of subdirectory names to create
   * @param {Object} options - Security options
   */
  async initializeSecureStructure(basePath, subdirs = [], options = {}) {
    const { restrictive = false } = options;

    try {
      // Create base directory
      await fs.promises.mkdir(basePath, { recursive: true });
      await this.setDirectoryPermissions(basePath, restrictive);
      
      // Create subdirectories
      for (const subdir of subdirs) {
        const subdirPath = path.join(basePath, subdir);
        await fs.promises.mkdir(subdirPath, { recursive: true });
        await this.setDirectoryPermissions(subdirPath, restrictive);
      }
      
      logger.info('Initialized secure directory structure:', { basePath, subdirs });
    } catch (error) {
      logger.error('Failed to initialize secure structure:', error);
      throw error;
    }
  }
}

module.exports = new FilePermissionsUtils();