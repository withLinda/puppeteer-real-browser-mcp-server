# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.11] - 2025-07-06

### Changed
- **Major README improvement**: Completely restructured README.md for better user experience
  - Reduced length by 80% (from 1,192 to 231 lines) while keeping all essential information
  - Added clear value proposition and simplified Quick Start guide
  - Better information architecture with progressive disclosure
  - Focused on user goals rather than technical complexity

### Added
- **New TROUBLESHOOTING.md**: Comprehensive troubleshooting guide extracted from README
  - Detailed solutions for Windows connection issues (ECONNREFUSED)
  - Platform-specific troubleshooting for all AI assistants
  - Advanced configuration examples and debug procedures
  - Centralized location for all troubleshooting content

### Improved
- Documentation structure now follows best practices for open source projects
- Better cross-referencing between README, TESTING.md, and TROUBLESHOOTING.md
- Enhanced user onboarding experience for new users
- Clearer separation between basic usage and advanced configuration

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