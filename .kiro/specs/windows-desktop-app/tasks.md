# Implementation Plan: Windows Desktop App

## Overview

This implementation plan covers packaging the Expense Tracker as a distributable Windows desktop application using Electron. The plan is structured to build incrementally, starting with core Electron infrastructure, then adding features like system tray, auto-updates, and finally the installer configuration.

**Status: For Future Consideration** - This is a significant architectural addition planned for future implementation.

## Tasks

- [ ] 1. Set up Electron project structure and dependencies
  - Create `electron/` directory with package.json
  - Install electron, electron-builder, electron-updater dependencies
  - Create basic main.js entry point
  - Configure electron-builder.json for Windows NSIS builds
  - Update root package.json with electron scripts
  - _Requirements: 1.1, 1.2, 2.1_

- [ ] 2. Implement core Electron managers
  - [ ] 2.1 Implement PortManager for port availability checking
    - Create `electron/portManager.js`
    - Implement `findAvailablePort()` with configurable max attempts
    - Implement `isPortAvailable()` using net.createServer
    - _Requirements: 1.3, 7.5_
  
  - [ ] 2.2 Write property test for PortManager
    - **Property 1: Port Management Correctness**
    - Test that for any port configuration, correct port is returned or error thrown
    - **Validates: Requirements 1.3, 7.5**
  
  - [ ] 2.3 Implement ConfigManager for settings persistence
    - Create `electron/configManager.js`
    - Implement `load()`, `save()`, `get()`, `set()` methods
    - Store config at %APPDATA%/ExpenseTracker/config/settings.json
    - Implement default configuration values
    - _Requirements: 5.6, 6.6_
  
  - [ ] 2.4 Write property test for ConfigManager round-trip
    - **Property 8: Configuration Round-Trip**
    - Test that save/load produces equivalent configuration
    - **Validates: Requirements 5.6, 6.6**
  
  - [ ] 2.5 Implement BackendManager for child process management
    - Create `electron/backendManager.js`
    - Implement `start()` to spawn backend with environment variables
    - Implement `stop()` for graceful shutdown
    - Implement ready detection via stdout parsing
    - Configure DATA_PATH environment variable for AppData storage
    - _Requirements: 1.2, 1.3, 1.6_

- [ ] 3. Checkpoint - Verify core managers work correctly
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement main process and window management
  - [ ] 4.1 Implement WindowManager with security settings
    - Create `electron/windowManager.js`
    - Configure BrowserWindow with nodeIntegration: false
    - Enable contextIsolation: true and sandbox: true
    - Implement external link handling via shell.openExternal
    - _Requirements: 12.1, 12.2_
  
  - [ ] 4.2 Create secure preload script
    - Create `electron/preload.js`
    - Expose limited API via contextBridge
    - Implement IPC channel whitelist validation
    - _Requirements: 12.3_
  
  - [ ] 4.3 Write property test for IPC validation
    - **Property 7: IPC Message Validation**
    - Test that invalid channels/messages are rejected
    - **Validates: Requirements 12.3**
  
  - [ ] 4.4 Implement main.js application lifecycle
    - Create `electron/main.js` with ExpenseTrackerApp class
    - Wire together all managers
    - Implement startup sequence: config → port → backend → window
    - Implement graceful shutdown on app quit
    - _Requirements: 1.3, 1.4, 1.6_

- [ ] 5. Implement system tray support
  - [ ] 5.1 Implement TrayManager
    - Create `electron/trayManager.js`
    - Create system tray icon on app start
    - Implement context menu with Open, Check for Updates, Settings, Exit
    - Implement status indicator (running, updating, error)
    - _Requirements: 4.1, 4.4, 4.5, 4.7_
  
  - [ ] 5.2 Implement minimize to tray behavior
    - Override window close to hide instead of quit
    - Restore window on tray icon click
    - Implement proper quit via tray menu Exit
    - _Requirements: 4.2, 4.3, 4.6_

- [ ] 6. Checkpoint - Verify basic Electron app runs correctly
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement auto-update functionality
  - [ ] 7.1 Implement UpdateManager with electron-updater
    - Create `electron/updateManager.js`
    - Configure autoUpdater for GitHub releases
    - Implement update check on startup
    - Implement manual update check via IPC
    - _Requirements: 3.1, 3.2, 3.7_
  
  - [ ] 7.2 Implement update retry logic
    - Create UpdateRetryHandler class
    - Implement exponential backoff with 3 max retries
    - Reset retry count on successful download
    - _Requirements: 3.6_
  
  - [ ] 7.3 Write property test for update retry logic
    - **Property 3: Update Retry Logic**
    - Test that exactly 3 retries occur before failure notification
    - **Validates: Requirements 3.6**
  
  - [ ] 7.4 Implement version comparison utility
    - Create semver comparison function
    - Handle major.minor.patch format
    - _Requirements: 3.8_
  
  - [ ] 7.5 Write property test for semver comparison
    - **Property 2: Semantic Version Comparison**
    - Test comparison correctness for random semver pairs
    - **Validates: Requirements 3.8**
  
  - [ ] 7.6 Implement update UI notifications
    - Send update-available event to renderer
    - Send download progress to renderer
    - Implement quit-and-install on user approval
    - _Requirements: 3.3, 3.4, 3.5_

- [ ] 8. Implement data storage and logging
  - [ ] 8.1 Configure AppData directory structure
    - Create directory initialization on first run
    - Set up database/, invoices/, statements/, backups/, config/, logs/ folders
    - Update backend to use DATA_PATH environment variable
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.8_
  
  - [ ] 8.2 Write property test for data storage location
    - **Property 4: Data Storage Location Invariant**
    - Test that all data writes go to AppData directory
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**
  
  - [ ] 8.3 Implement Electron-specific logger
    - Create `electron/logger.js`
    - Write logs to %APPDATA%/ExpenseTracker/logs/
    - Implement log rotation (max 5 files, 10MB each)
    - _Requirements: 11.1, 11.6_
  
  - [ ] 8.4 Write property test for log storage location
    - **Property 5: Log Storage Location Invariant**
    - Test that all log events go to logs directory
    - **Validates: Requirements 11.1**
  
  - [ ] 8.5 Write property test for log rotation
    - **Property 6: Log Rotation Bounds**
    - Test that log files never exceed configured limits
    - **Validates: Requirements 11.6**

- [ ] 9. Checkpoint - Verify data persistence and logging
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Implement error handling
  - [ ] 10.1 Create ErrorHandler for startup failures
    - Create `electron/errorHandler.js`
    - Handle EADDRINUSE, EACCES, TIMEOUT errors
    - Show user-friendly dialogs with recovery options
    - _Requirements: 11.2, 11.4_
  
  - [ ] 10.2 Implement log viewing and export
    - Add IPC handler for opening logs folder
    - Add IPC handler for exporting logs as zip
    - _Requirements: 11.3_

- [ ] 11. Implement Windows integration features
  - [ ] 11.1 Add theme support
    - Detect Windows dark/light mode via nativeTheme
    - Send theme changes to renderer
    - _Requirements: 8.3_
  
  - [ ] 11.2 Implement native file dialogs
    - Use Electron dialog.showOpenDialog for backup restore
    - Use Electron dialog.showSaveDialog for backup export
    - _Requirements: 8.4_
  
  - [ ] 11.3 Implement startup registration
    - Add option to register app in Windows startup
    - Use app.setLoginItemSettings()
    - _Requirements: 8.5_
  
  - [ ] 11.4 Implement Windows notifications
    - Use Electron Notification API for important events
    - Notify on update available, backup complete, errors
    - _Requirements: 8.6_
  
  - [ ] 11.5 Implement taskbar progress
    - Show download progress in taskbar during updates
    - Use mainWindow.setProgressBar()
    - _Requirements: 8.7_

- [ ] 12. Implement local network access features
  - [ ] 12.1 Display local network URL
    - Detect local IP address
    - Display URL in app window or settings
    - Update on network changes
    - _Requirements: 7.1, 7.2, 7.3_
  
  - [ ] 12.2 Implement network access configuration
    - Add setting for localhost-only mode
    - Configure backend binding based on setting
    - Show security warning when enabling network access
    - _Requirements: 7.4, 7.6, 12.5_

- [ ] 13. Implement first-run setup wizard (optional)
  - [ ] 13.1 Create setup wizard UI
    - Detect first run (no existing config)
    - Show welcome screen
    - Allow port configuration
    - Allow backup import
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [ ] 13.2 Implement wizard completion
    - Save configuration on completion
    - Mark setup as completed
    - Allow skipping with defaults
    - _Requirements: 6.6, 6.7_

- [ ] 14. Checkpoint - Verify all features work together
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Configure installer and build
  - [ ] 15.1 Create application assets
    - Create icon.ico (256x256, 128x128, 64x64, 32x32, 16x16)
    - Create tray-icon.png (16x16 or 32x32)
    - Create installer banner images if needed
    - _Requirements: 4.1, 8.1_
  
  - [ ] 15.2 Configure NSIS installer
    - Create `installer/installer.nsh` for custom NSIS scripts
    - Configure to preserve AppData on uninstall
    - Add option to remove all data on uninstall
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_
  
  - [ ] 15.3 Configure electron-builder
    - Finalize electron-builder.json configuration
    - Configure code signing (optional, with placeholders)
    - Configure GitHub publish settings
    - _Requirements: 2.1, 9.1, 9.2, 9.4_

- [ ] 16. Create GitHub Actions workflow
  - [ ] 16.1 Create electron-build.yml workflow
    - Build on push to release branches and tags
    - Run tests before building
    - Build Windows installer
    - Upload artifacts
    - _Requirements: 10.1, 10.2, 10.5_
  
  - [ ] 16.2 Configure release automation
    - Create GitHub release on tag push
    - Attach installer to release
    - Generate release notes from commits
    - _Requirements: 10.2, 10.3, 10.7_
  
  - [ ] 16.3 Add manual trigger support
    - Add workflow_dispatch trigger
    - Allow ad-hoc builds without tags
    - _Requirements: 10.6_

- [ ] 17. Create documentation
  - [ ] 17.1 Update README with Electron build instructions
    - Document development setup
    - Document build commands
    - Document release process
    - _Requirements: 9.5_
  
  - [ ] 17.2 Create user documentation
    - Installation guide
    - First-run setup guide
    - Troubleshooting guide
    - _Requirements: 11.2, 11.3_

- [ ] 18. Final checkpoint - Complete integration testing
  - Ensure all tests pass, ask the user if questions arise.
  - Test full installation flow on clean Windows system
  - Test update flow with mock GitHub release
  - Test data persistence across reinstall

## Notes

- All tasks including property-based tests are required for comprehensive coverage
- This spec is marked "For Future Consideration" - implementation is not immediate
- Code signing (Requirement 9) requires purchasing a certificate - can be deferred
- The existing backend requires minimal changes (mainly DATA_PATH environment variable support)
- Frontend requires no changes - it connects to backend via HTTP as usual
