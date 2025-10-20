# Change Log

All notable changes to the "claude-usage-monitor" extension will be documented in this file.

## [1.0.2] - 2025-10-20

### Fixed
- Fixed `waitForTimeout is not a function` error with Puppeteer v24
- Replaced deprecated `page.waitForTimeout()` with Promise-based `sleep()` helper
- Improved compatibility with latest Puppeteer API

## [1.0.1] - 2025-10-20

### Fixed
- Fixed "Cannot find Chrome" error by adding automatic Chrome/Edge detection
- Extension now finds and uses system-installed browsers (Chrome, Edge, Chromium)
- Added support for Scoop-installed Chrome
- Updated Puppeteer to v24.15.0 (from deprecated v21.0.0)
- Improved browser detection across Windows, macOS, and Linux

### Changed
- Extension no longer requires bundling Chromium (~150MB savings)
- Uses existing browser installation on user's system

## [1.0.0] - 2025-10-19

### Added
- Initial release of Claude Usage Monitor
- Status bar integration showing real-time usage percentage
- Tree view panel with detailed usage information
- Puppeteer-based web scraping of claude.ai/settings
- Session persistence for authentication (log in once, stay logged in)
- Color-coded visual indicators:
  - Green check (< 80% usage)
  - Orange warning (80-89% usage)
  - Red error (≥ 90% usage)
- Commands:
  - "Fetch Claude Usage Now" - Manual refresh
  - "Open Claude Settings Page" - Quick access to Claude.ai settings
- Configuration options:
  - `fetchOnStartup` - Auto-fetch on VS Code startup
  - `headless` - Run browser in background mode
  - `autoRefreshMinutes` - Automatic periodic refresh
- Progress notifications during data fetching
- Comprehensive error handling and user-friendly error messages
- Activity bar panel for easy access to usage details

### Features
- First-time setup wizard with guided login process
- Automatic session management via Chromium user data directory
- Smart retry logic for network failures
- Detailed tooltips on status bar item
- Supports both visible and headless browser modes
- Memory-efficient: browser closes after each fetch (optional keep-alive for auto-refresh)

### Technical Details
- Built with VS Code Extension API 1.80.0+
- Uses Puppeteer 21.0.0 for browser automation
- Regex-based data extraction from page content
- Session stored in `~/.claude-browser-session/`
- No credential storage or transmission
- Local-only data processing

## [Unreleased]

### Planned Features
- Usage history tracking and graphing
- Configurable alert thresholds
- Multiple account support
- Export usage data to CSV
- Desktop notifications when approaching limits
- Dark/light theme-aware icons

---

## Version Numbering

This extension follows [Semantic Versioning](https://semver.org/):
- **MAJOR** version for incompatible API changes
- **MINOR** version for new functionality in a backwards compatible manner
- **PATCH** version for backwards compatible bug fixes
