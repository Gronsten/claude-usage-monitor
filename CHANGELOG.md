# Change Log

All notable changes to the "claude-usage-monitor" extension will be documented in this file.

## [2.3.0] - 2025-10-24

### Added
- **Automatic Claude Code Token Tracking** 📊: Real-time monitoring of Claude Code session usage
  - Monitors `~/.claude/projects/*.jsonl` files for token usage data
  - File watcher detects changes instantly when you use Claude Code
  - 30-second polling backup ensures reliability
  - Tracks input, output, cache read, and cache creation tokens
  - Shows current session usage (last hour) in status bar tooltip
  - Detailed breakdown in "Claude Usage - Token Monitor" output channel
- **ASCII Sparkline Graphs** ✨: Visual usage trends in tree view
  - Last 8 data points displayed as sparkline (e.g., "▁▂▃▅▆▇█▇")
  - Separate sparklines for 5-hour and 7-day usage
  - Stored in `claude-usage-history.json` for persistence
  - Updates every 5 minutes with new data points
  - Maximum 24 data points retained (2 hours of history)
- **Usage History Tracking**: New UsageHistory class for historical data management
  - Stores usage snapshots with timestamps
  - Generates sparklines using block character visualization
  - Normalizes values for accurate trend display
  - Automatic cleanup of old data points

### Changed
- Replaced experimental console interception with proven JSONL file monitoring
- Removed proposed API usage that caused activation failures
- Enhanced diagnostic logging to "Claude Usage - Token Monitor" output channel
- Token monitoring now fully automatic - no manual updates needed

### Technical Details
- New file: `src/claudeDataLoader.js` - Handles JSONL parsing and data aggregation
- New file: `src/usageHistory.js` - Manages historical usage data and sparklines
- Enhanced `extension.js` with `setupTokenMonitoring()` and `updateTokensFromJsonl()`
- File watcher uses `vscode.workspace.createFileSystemWatcher()` for real-time updates
- JSONL parser supports deduplication by message ID + request ID
- Compatible with both `~/.claude/projects` and `~/.config/claude/projects` paths

### Performance
- **Real-time Updates**: Instant token tracking as you use Claude Code
- **Minimal I/O**: 1-minute caching and efficient file watching
- **Lightweight**: JSONL parsing with native Node.js streams
- **Reliable**: Dual monitoring (file watcher + polling) ensures no missed updates

## [2.2.0] - 2025-10-24

### Added
- **Direct API Access** 🚀: Extension now uses Claude.ai's internal API for faster, more reliable data retrieval
  - Request interception captures `/api/organizations/{id}/usage` endpoint automatically
  - Direct fetch API calls within page context for proper authentication
  - 2-3x faster than HTML scraping method
  - More reliable (JSON parsing vs regex on changing HTML)
  - Better data quality with structured API responses
- **7-Day Usage Tracking**: Now displays both 5-hour and 7-day usage metrics
  - Tree view shows "Usage (5-hour)" and "Usage (7-day)" separately
  - Weekly reset time displayed when available
  - Color-coded indicators for both usage types
- **Enhanced Reset Time Calculation**: Human-readable reset times from ISO timestamps
  - Examples: "2h 30m", "1d 4h", "45m"
  - More accurate than previous HTML parsing method

### Changed
- **Intelligent Fallback**: Gracefully falls back to HTML scraping if API access fails
  - Maintains backward compatibility
  - Logs method used (API vs HTML) for debugging
  - No user intervention required
- **Request Interception**: Puppeteer now intercepts requests to capture API endpoints
  - Enabled on both new browser launches and existing browser connections
  - Automatic capture on first page load
  - Cached for subsequent usage fetches

### Technical Details
- New methods: `setupRequestInterception()`, `processApiResponse()`, `calculateResetTime()`
- Enhanced `fetchUsageData()` with API-first approach
- Updated data provider to handle weekly usage data
- Raw API response stored in `usageData.rawData` for future enhancements

### Performance
- **Faster**: 2-3x reduction in data fetch time
- **More Reliable**: No more breakage when Claude.ai updates their HTML
- **Future-Proof**: API endpoints are more stable than UI layouts

## [2.1.0] - 2025-10-22

### Changed
- **Session Data Location**: Moved session-data.json to OS temp directory
  - **Windows**: `C:\Users\username\AppData\Local\Temp\claude-session-data.json`
  - **Mac/Linux**: `/tmp/claude-session-data.json`
  - Works consistently across all extension installation methods (dev, .vsix, marketplace)
  - Same file accessible regardless of where extension is installed
  - Cross-platform compatible

### Added
- Version number now displayed in status bar tooltip (e.g., "Click to refresh | v2.1.0")
- Helps confirm which extension version is running

### Documentation
- Updated CLAUDE.md with simplified token update command that works from any directory
- Clarified session file location in OS temp directory

## [2.0.3] - 2025-10-22

### Added
- Version number in status bar tooltip

## [2.0.2] - 2025-10-22

### Changed
- **Session Lifecycle Improvement**: Removed automatic token reset on extension deactivation
  - Sessions now persist across extension reloads and VS Code restarts
  - Session tracking aligns with Claude Code conversation lifecycle (not extension lifecycle)
  - Users manually start new sessions when beginning new Claude Code conversations

### Added
- **New Command**: "Claude: Start New Claude Code Session"
  - Prompts for optional session description
  - Resets token count to 0 for new conversation tracking
  - Creates new session entry in session-data.json

### Removed
- Auto-reset of session tokens in `deactivate()` function
  - Previous behavior: tokens reset to 0 every time extension reloaded
  - New behavior: tokens persist until user manually starts new session

### Documentation
- Updated CLAUDE.md with detailed session lifecycle explanation
- Added workflow examples for starting new sessions vs continuing existing ones
- Clarified when to start new sessions vs when to update tokens

## [2.0.1] - 2025-10-22

### Fixed
- **Resilient Data Fetching**: Extension no longer fails completely if web scraping fails
  - Web scraping (Claude.ai usage) and session token data (from `session-data.json`) are now handled independently
  - If web scraping fails, session token data is still displayed in status bar
  - Shows warning message when web scraping fails, but extension remains functional
  - Status bar tooltip indicates when Claude.ai data is unavailable

### Changed
- Improved error handling in data provider to gracefully degrade when web scraping encounters issues
- Status bar now intelligently shows available data even when one source fails

## [2.0.0] - 2025-10-21

### Major Changes
- **BREAKING**: Removed complex activity-based refresh scheduling - now uses simple fixed 5-minute interval
- **NEW**: Session token tracking integration - displays both Claude.ai usage AND session token usage
- **NEW**: Usage level indicator now based on actual Claude usage, not keyboard edits
- **Simplified**: Default refresh interval is now 5 minutes for all usage checks

### Added
- Session token usage display in status bar (e.g., "Claude: 45% | Tokens: 26%")
- Reads `session-data.json` to show current development session token usage
- **New Activity Level Logic**: Shows "Claude time remaining" based on actual usage
  - Idle (0-24%): Plenty of Claude time remaining
  - Light (25-49%): Quarter of usage consumed
  - Moderate (50-79%): Halfway through available usage
  - Heavy (80-100%): Running low on Claude time!
  - Calculated from MAX of Claude.ai % or session token %
- Enhanced tooltip shows:
  - Claude.ai usage percentage and reset time
  - Session token usage (current/limit/percentage)
  - Session ID
  - Usage level with description

### Removed
- Activity-based dynamic refresh scheduling (was redundant and conceptually flawed)
- `activityBasedRefresh` configuration option
- Complex `scheduleNextRefresh()` and `checkAndRescheduleIfNeeded()` logic
- VS Code edit tracking (text document changes, file saves, editor switches)
- Edit count and file change count metrics

### Changed
- Default `autoRefreshMinutes` changed from 15 to 5
- Refresh interval is now fixed (not dynamic based on activity)
- Status bar updates include session data from `session-data.json`
- Simplified configuration with single `autoRefreshMinutes` setting

### Technical Changes
- Integrated `SessionTracker` class for reading session data
- Updated `updateStatusBar()` to accept optional `sessionData` parameter
- New `updateStatusBarWithAllData()` helper consolidates all status bar updates
- Removed `activityCheckTimer` (no longer needed)
- **Rewrote `ActivityMonitor` class**: Now stateless, calculates from usage data on-demand
- `getStats()` now accepts `usageData` and `sessionData` parameters
- Activity level based on `Math.max(claudePercent, tokenPercent)` with thresholds: 25%, 50%, 80%
- Removed all VS Code event listeners (no longer tracking edits)

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

## [1.1.0] - 2025-10-20

### Added
- **Smart Activity-Based Refresh** 🚀: Extension now monitors VS Code activity and adjusts refresh intervals dynamically
  - Heavy coding (100+ edits/15min): 5-minute refresh
  - Moderate activity (30-100 edits/15min): 15-minute refresh
  - Light activity (1-30 edits/15min): 30-minute refresh
  - Idle (no activity): 60-minute refresh
- **Activity Level Tooltip**: Status bar hover now displays current activity level and next refresh interval
  - Example: "Activity level: Heavy (5 min refresh)"
- New configuration option `claudeUsage.activityBasedRefresh` (default: `true`)
- Activity monitoring module (`activityMonitor.js`) tracks text edits, file saves, and editor changes
- Console logging of activity levels and next refresh time for debugging
- Smart session detection checks for existing cookies before launching browser
- Activity level checked on startup to set initial refresh interval

### Changed
- **Auto-Start Enabled by Default**: `claudeUsage.fetchOnStartup` now defaults to `true` - usage fetches automatically on VS Code startup
- **Headless Mode Enabled by Default**: `claudeUsage.headless` now defaults to `true` - browser runs hidden after initial login
- **Smart Headless Detection**: Browser automatically shows if login is needed (no session found), runs hidden otherwise
- Direct navigation to `https://claude.ai/settings/usage` in both `ensureLoggedIn()` and `fetchUsageData()` (skips homepage redirect)
- Removed unnecessary tab clicking and intermediate navigation logic from scraper
- Updated default `autoRefreshMinutes` from `0` to `15` (used only when activity-based refresh is disabled)
- Configuration descriptions updated to reflect new smart defaults

### Improved
- Faster initial load: eliminates redirect through `claude.ai/new` page
- Better performance: reduced navigation steps from 2+ to 1
- Smarter refresh scheduling based on actual coding activity
- More efficient session handling with cookie-based detection
- No browser window shown unless login is actually required

### Fixed
- Extension now works correctly with F5 debugging (removed unnecessary `preLaunchTask` from launch.json)

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
