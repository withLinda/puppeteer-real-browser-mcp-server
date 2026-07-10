# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] - 2026-07-10

### Security and safety

- Removed every system-wide Chrome termination command.
- Added a repository guard that rejects process-name-based Chrome cleanup.
- Added exact Chrome ownership through a direct `chrome-launcher` handle.
- Rejects external debugging endpoints, manual debugging ports, and unowned user-data directories.
- Added ownership markers for persistent automation profiles.

### Changed

- Replaced the end-of-life `puppeteer-real-browser` runtime dependency with a managed TypeScript adapter using `chrome-launcher`, `rebrowser-puppeteer-core`, and `ghost-cursor`.
- Replaced duplicate port and connection fallback strategies with one owned launch path.
- Added coordinated stdin EOF, SIGINT, SIGTERM, startup-failure, and fatal-error cleanup.
- Removed the permanent heartbeat timer.
- Made the package lockfile part of the release source and pinned direct dependencies.
- Build output now excludes test files and includes declarations and source maps.

### Tests

- Added failure-path tests for launch, connection, timeout, late connection, and page preparation.
- Added concurrent launch and idempotent close tests.
- Added a real Chrome acceptance test proving that an unrelated Chrome-named process stays alive.
- Package smoke testing now verifies MCP initialization, tool listing, tarball contents, and clean stdin-EOF shutdown.

## [1.5.12] - 2025-07-06

### Maintenance
- Updated build and distribution process
- Verified all tools and functionality working correctly
- Maintenance release to ensure latest version availability

## [1.5.9] - 2025-01-04

### Fixed
- Removed maintenance warning from README.md as MCP functionality is now fully restored
- Browser initialization issues have been resolved
- All tools are working as intended

### Changed
- Updated documentation to reflect stable functionality

## [1.5.8] - 2025-01-04

### Fixed
- Resolved browser initialization and MCP protocol compatibility issues
- Fixed ES module cleanup and npx execution failures
- Enhanced debugging and error handling for MCP server startup

### Added
- Comprehensive debugging for MCP server initialization crashes
- Better error messages and troubleshooting guidance

## [1.5.5] - Previous Release

### Added
- Initial MCP server implementation with puppeteer-real-browser integration
- Support for browser automation with anti-detection features
- 11 comprehensive tools for browser interaction
- Cross-platform Chrome detection and compatibility
