# Claude Usage Monitor - Architecture Guide

**Version:** 2.3.9
**Last Updated:** 2025-11-19
**Purpose:** Technical architecture reference for Claude AI assistant sessions

---

## Table of Contents

1. [Overview](#overview)
2. [Project Structure](#project-structure)
3. [Core Architecture](#core-architecture)
4. [Module Responsibilities](#module-responsibilities)
5. [Data Flow Diagrams](#data-flow-diagrams)
6. [Configuration System](#configuration-system)
7. [External Dependencies](#external-dependencies)
8. [Performance Characteristics](#performance-characteristics)
9. [Common Development Patterns](#common-development-patterns)
10. [Troubleshooting Guide](#troubleshooting-guide)

---

## Overview

### What is Claude Usage Monitor?

A VS Code extension providing **dual monitoring** capabilities for Claude usage:
1. **Claude.ai Web Usage** - Tracks 5-hour and 7-day usage limits via web scraping (with API fallback)
2. **Claude Code Token Consumption** - Real-time monitoring of development session token usage through JSONL file tracking

### Core Design Principles

1. **Dual Data Sources** - Independent monitoring of web usage and local tokens
2. **Smart Browser Management** - Connection pooling, lazy launch, intelligent headless mode
3. **Progressive Enhancement** - Status bar → Tooltip → Tree view (increasing detail)
4. **Resilient Architecture** - Each data source fails independently without breaking the other
5. **Performance Optimized** - API-first with HTML fallback, minimal resource usage

### Key Stats

- **Total Source Lines**: ~2,023 lines of JavaScript
- **Main Entry**: extension.js (309 lines)
- **Modules**: 8 specialized modules in src/
- **Auto-refresh**: Configurable 1-60 minutes (default 5 min)
- **Token Tracking**: Real-time via file watcher + 30-second polling

---

## Project Structure

```
/root/vscode-extensions/claude-usage/
├── extension.js                     # Main entry point (309 lines)
├── cleanup-browser.js               # Browser lock file cleanup utility (40 lines)
├── package.json                     # Extension manifest (103 lines)
├── package-lock.json                # Dependency lock file
├── LICENSE                          # MIT License
├── README.md                        # User-facing documentation
├── CHANGELOG.md                     # Version history
├── CLAUDE.md                        # Development guidelines
├── QUICKSTART.md                    # Quick setup guide
├── TESTING.md                       # Testing documentation
│
├── src/                             # Source modules
│   ├── activityMonitor.js          # Usage level calculator (93 lines)
│   ├── claudeDataLoader.js         # JSONL parser for token data (376 lines)
│   ├── dataProvider.js             # Tree view data provider (280 lines)
│   ├── scraper.js                  # Puppeteer web scraper (500 lines)
│   ├── sessionTracker.js           # Session management (123 lines)
│   ├── statusBar.js                # Status bar UI (162 lines)
│   ├── usageHistory.js             # Historical data & sparklines (142 lines)
│   └── utils.js                    # Shared utilities (38 lines)
│
├── icons/                           # Extension icons
│   ├── claude-usage-icon.png       # Marketplace icon
│   └── claude-usage-tree-icon.svg  # Activity bar icon
│
├── screenshots/                     # Documentation screenshots
│   ├── status-bar.png
│   ├── tooltip.png
│   ├── tree-view.png
│   └── settings.png
│
├── assets/                          # Demo assets
│   └── demo.gif
│
├── .vscode/                         # VS Code configuration
│   └── launch.json                 # Debug configuration
│
├── .github/                         # GitHub Actions workflows
│   └── workflows/
│
├── archive/                         # Previous .vsix versions
│   └── [old versions]
│
├── node_modules/                    # Dependencies (Puppeteer)
│
└── .vscodeignore                    # Files excluded from .vsix
```

---

## Core Architecture

### Extension Lifecycle

```
VS Code Startup
    ↓
onStartupFinished activation event
    ↓
activate(context) in extension.js
    ↓
┌─────────────────────────────────────────────┐
│ 1. Create Core Components                   │
│    - Status bar item                         │
│    - Data provider (tree view)               │
│    - Activity monitor                        │
│    - Session tracker                         │
│    - Claude data loader                      │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│ 2. Setup Token Monitoring                   │
│    - Find Claude data directory              │
│    - Setup file watcher (*.jsonl)            │
│    - Start 30-second polling backup          │
│    - Load initial token usage                │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│ 3. Register VS Code Integration             │
│    - Commands (fetchNow, openSettings, etc.)│
│    - Tree view container (activity bar)      │
│    - Configuration listeners                 │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│ 4. Optional: Fetch on Startup               │
│    if (claudeUsage.fetchOnStartup === true) │
│    → Triggers web scraping immediately       │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│ 5. Start Auto-Refresh Timer                 │
│    Interval: claudeUsage.autoRefreshMinutes │
│    Default: 5 minutes                        │
│    → Periodic web scraping + token refresh  │
└─────────────────────────────────────────────┘
```

### Deactivation Cleanup

```
deactivate() called
    ↓
Clear auto-refresh timer
    ↓
Close Puppeteer browser
    ↓
Dispose file watchers
    ↓
Clean up resources
```

---

## Module Responsibilities

### 1. extension.js (Main Entry Point)

**Lines**: 309
**Role**: Orchestrates all components and manages extension lifecycle

**Key Functions**:

| Function | Purpose | Key Operations |
|----------|---------|----------------|
| `activate(context)` | Extension entry point | Creates components, registers commands, starts monitoring |
| `setupTokenMonitoring(context)` | Initialize JSONL tracking | Sets up file watcher + polling, loads initial data |
| `updateTokensFromJsonl(channel, silent)` | Update token usage | Parses JSONL → updates session tracker → refreshes UI |
| `updateStatusBarWithAllData()` | Refresh all UI | Updates status bar + tree view with latest data |
| `deactivate()` | Cleanup on shutdown | Clears timers, closes browser, disposes watchers |

**Global State Variables**:
```javascript
let statusBarItem;          // VS Code status bar item
let dataProvider;           // Tree view data provider
let autoRefreshTimer;       // Interval for periodic refresh
let activityMonitor;        // Usage level calculator
let sessionTracker;         // Session management
let claudeDataLoader;       // JSONL parser
let jsonlWatcher;          // File system watcher
```

**Command Registration**:
- `claude-usage.fetchNow` → `dataProvider.fetchUsage()`
- `claude-usage.openSettings` → Opens https://claude.ai/settings
- `claude-usage.startNewSession` → Prompts for description, creates new session
- `claude-usage.updateTokens` → Test command for manual token updates

---

### 2. scraper.js (Web Scraping Engine)

**Lines**: 500
**Role**: Fetches Claude.ai usage data via Puppeteer with dual-mode (API + HTML)

**Architecture**: Smart browser management with connection pooling

**Key Functions**:

| Function | Purpose | Details |
|----------|---------|---------|
| `initialize(forceHeaded)` | Launch/connect browser | Tries port 9222 connection first, falls back to launch |
| `hasExistingSession()` | Check for saved cookies | Looks in `~/.claude-browser-session/` |
| `ensureLoggedIn()` | Wait for authentication | Max 5 minutes, shows browser if needed |
| `setupRequestInterception()` | Capture API endpoints | Intercepts `/api/organizations/*/usage` requests |
| `fetchUsageData()` | **CORE** - Get usage data | API mode (preferred) or HTML mode (fallback) |
| `processApiResponse(apiResponse)` | Parse API JSON | Extracts `five_hour.utilization` and `seven_day.utilization` |
| `calculateResetTime(isoTimestamp)` | Convert ISO to "2h 30m" | Human-readable time until reset |
| `close()` | Smart cleanup | Disconnect if connected, close if launched |

**Dual-Mode Data Fetching**:

**Priority 1: API Mode** (2-3x faster, more reliable)
```javascript
// Captured during request interception:
GET /api/organizations/{org_id}/usage

Response:
{
  "five_hour": {
    "utilization": 0.45,  // 45%
    "reset_at": "2025-11-19T23:30:00.000Z"
  },
  "seven_day": {
    "utilization": 0.78,  // 78%
    "reset_at": "2025-11-26T10:00:00.000Z"
  }
}
```

**Priority 2: HTML Mode** (fallback if API unavailable)
```javascript
// Regex patterns:
/(\d+)%\s*used/              → Percentage
/Resets?\s+in\s+([^\n]+)/    → Reset time
```

**Session Persistence**:
- Cookie storage: `~/.claude-browser-session/`
- Persists for weeks
- No re-login needed on subsequent runs

**Chrome Detection**: Searches for executables in order:
1. Google Chrome (standard install)
2. Scoop package manager location
3. Microsoft Edge (Chromium-based)

---

### 3. claudeDataLoader.js (JSONL Parser)

**Lines**: 376
**Role**: Parses Claude Code's JSONL files for token usage data

**Data Source**: `~/.config/claude/projects/**/*.jsonl` (or `~/.claude/projects/**/*.jsonl`)

**Key Functions**:

| Function | Purpose | Algorithm |
|----------|---------|-----------|
| `findClaudeDataDirectory()` | Locate Claude data folder | Checks multiple locations, validates existence |
| `findJsonlFiles(dirPath)` | Find all .jsonl files | Recursive directory traversal |
| `parseJsonlFile(filePath)` | Parse JSONL to objects | Line-by-line JSON parsing, validates records |
| `getCurrentSessionUsage()` | **CORE** - Get current session tokens | Finds active conversation, extracts cache size |
| `loadUsageRecords(sinceTimestamp)` | Aggregate historical usage | Filters by timestamp, deduplicates |
| `isValidUsageRecord(record)` | Validate record structure | Filters out synthetic messages |

**Current Session Detection Algorithm**:
```
1. Find all .jsonl files
    ↓
2. Filter files modified in last 5 minutes (active conversation)
    ↓
3. Sort by modification time (newest first)
    ↓
4. Read most recent file from END to START
    ↓
5. Find last "assistant" message with usage data
    ↓
6. Extract cache_read_input_tokens (approximates context size)
    ↓
7. Return token breakdown:
   - inputTokens: Tokens in prompts
   - outputTokens: Tokens in responses
   - cacheReadTokens: Tokens read from cache (SESSION TOTAL)
   - cacheCreationTokens: Tokens used to create cache
```

**Why cache_read_tokens?**
- Represents the total context size Claude is reading
- Approximates current session token consumption
- More accurate than summing individual messages (avoids double-counting)

**JSONL Record Format**:
```json
{
  "type": "usage",
  "inputTokens": 1234,
  "outputTokens": 567,
  "cacheCreationInputTokens": 100,
  "cacheReadInputTokens": 45000,
  "id": "msg_abc123",
  "requestId": "req_xyz789"
}
```

**Deduplication**: Uses `message.id + requestId` hash to avoid counting duplicates across file reads

---

### 4. dataProvider.js (Tree View Provider)

**Lines**: 280
**Role**: Provides data for VS Code tree view panel in activity bar

**Implements**: `vscode.TreeDataProvider<TreeItem>`

**Key Functions**:

| Function | Purpose | Returns |
|----------|---------|---------|
| `getChildren(element)` | Build tree view items | Array of TreeItem objects |
| `getTreeItem(element)` | Convert to VS Code TreeItem | TreeItem with icon, label, tooltip |
| `refresh()` | Trigger UI refresh | Fires `onDidChangeTreeData` event |
| `fetchUsage()` | Orchestrate web scraping | Calls scraper, shows progress, updates tree |
| `updateSessionData(sessionData)` | Update token display | Refreshes tree with new token counts |

**Tree View Structure**:
```
Claude Usage
├── 📊 Usage (5-hour): 45%
│   ├── 📈 Sparkline: ▁▁▂▂▃▃▄▅▅▆▆▇▇█▇▆▆▅▅▄▃▃▂▂ (4 hours)
│   └── ⏰ Resets in: 2h 30m (14:30)
├── 📊 Usage (7-day): 78%
│   ├── 📈 Sparkline: ▂▃▄▅▆▇██
│   └── ⏰ Resets in: 6d 12h (Nov 26, 10:00)
├── 🎯 Session Tokens: 45,234 / 200,000 (~23%)
│   ├── ↗️ Input: 20,123 tokens
│   ├── ↙️ Output: 15,111 tokens
│   ├── 💾 Cache Read: 45,234 tokens
│   └── 🔧 Cache Creation: 10,000 tokens
└── 🕐 Last updated: 2:45 PM
```

**Icon System**:
- Critical (≥90%): `$(error)` Red error icon
- Warning (≥80%): `$(warning)` Orange warning icon
- Normal (<80%): `$(pass)` Green check icon
- Time: `$(clock)` Clock icon
- Trending: `$(graph)` Graph icon

**Progress Notification**:
- Shows VS Code progress bar during web scraping
- Displays "Fetching Claude usage data..." message
- Cancellable by user

---

### 5. sessionTracker.js (Session Management)

**Lines**: 123
**Role**: Tracks Claude Code development sessions and token usage

**Data Storage**: `%TEMP%\claude-session-data.json` (Windows) or `/tmp/claude-session-data.json` (Mac/Linux)

**Key Functions**:

| Function | Purpose | Operation |
|----------|---------|-----------|
| `startSession(description)` | Create new session | Generates unique ID, initializes with 0 tokens |
| `updateTokens(tokensUsed, tokenLimit)` | Update current session | Sets current/limit/remaining, saves to disk |
| `getCurrentSession()` | Get active session | Returns current session data or null |
| `loadData()` / `saveData()` | Persistence | Reads/writes JSON file |

**Session ID Format**: `session-YYYY-MM-DD-###`
- Example: `session-2025-11-19-001`
- Auto-increments daily counter

**Data Structure**:
```json
{
  "sessions": [
    {
      "sessionId": "session-2025-11-19-001",
      "startTime": "2025-11-19T10:30:00.000Z",
      "description": "Implementing user authentication",
      "tokenUsage": {
        "current": 45000,
        "limit": 200000,
        "remaining": 155000,
        "lastUpdate": "2025-11-19T11:15:00.000Z"
      }
    }
  ],
  "totals": {
    "totalSessions": 1,
    "totalTokensUsed": 45000,
    "lastSessionDate": "2025-11-19T10:30:00.000Z"
  }
}
```

---

### 6. statusBar.js (Status Bar UI)

**Lines**: 162
**Role**: Manages status bar item display and tooltips

**Key Functions**:

| Function | Purpose | Updates |
|----------|---------|---------|
| `createStatusBarItem(context)` | Create status bar item | Right-aligned, high priority |
| `updateStatusBar(item, usageData, activityStats, sessionData)` | Update display | Text, color, tooltip, command |

**Status Bar Display**:
```
Text: $(icon) Claude: 45% | Tokens: ~26%
Color: $(warning) Orange (warning level)
Click: Opens tree view panel
```

**Tooltip (Markdown Format)**:
```markdown
**Claude.ai Web Usage:**
- 5-hour: 45% (resets in 2h 30m)
- 7-day: 78% (resets in 6d 12h)

**Session Token Usage:**
- Current: 45,234 / 200,000 (~23%)

**Usage Level:** Moderate (50-79%)
Much work, many thought

*Last updated: 2:45 PM*
*Extension version: 2.3.9*
*Click to view details*
```

**Icon Selection Based on Activity Level**:
```javascript
idle:     new vscode.ThemeIcon('pass', new vscode.ThemeColor('charts.green'))
light:    new vscode.ThemeIcon('info', new vscode.ThemeColor('charts.blue'))
moderate: new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.orange'))
heavy:    new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'))
```

---

### 7. activityMonitor.js (Usage Level Calculator)

**Lines**: 93
**Role**: Calculates overall usage level based on both Claude.ai and token usage

**Key Functions**:

| Function | Purpose | Returns |
|----------|---------|---------|
| `getActivityLevel(usageData, sessionData)` | Determine usage level | 'idle' \| 'light' \| 'moderate' \| 'heavy' |
| `getStats(usageData, sessionData)` | Calculate detailed stats | Object with percentages and level |
| `getActivityDescription(level)` | Human-readable description | Flavor text for each level |

**Level Thresholds**:
```javascript
Heavy:    80-100%  "Running low!"
Moderate: 50-79%   "Much work, many thought"
Light:    25-49%   "Quarter+ used"
Idle:     0-24%    "Plenty of Claude time!"
```

**Algorithm**:
```javascript
function getActivityLevel(usageData, sessionData) {
  const claudePercent = Math.max(
    usageData.fiveHourUsage || 0,
    usageData.sevenDayUsage || 0
  );

  const tokenPercent = sessionData.tokenUsage
    ? (sessionData.tokenUsage.current / sessionData.tokenUsage.limit) * 100
    : 0;

  const maxPercent = Math.max(claudePercent, tokenPercent);

  if (maxPercent >= 80) return 'heavy';
  if (maxPercent >= 50) return 'moderate';
  if (maxPercent >= 25) return 'light';
  return 'idle';
}
```

**Why MAX of both percentages?**
- Conservative approach: Shows highest urgency
- User sees worst-case scenario
- Prevents surprise rate limiting

---

### 8. usageHistory.js (Historical Data & Sparklines)

**Lines**: 142
**Role**: Stores historical usage data and generates ASCII sparklines

**Data Storage**: `%TEMP%\claude-usage-history.json`

**Key Functions**:

| Function | Purpose | Algorithm |
|----------|---------|-----------|
| `addDataPoint(fiveHourUsage)` | Save new data point | Appends with timestamp, auto-cleanup old data |
| `getRecentDataPoints(count)` | Retrieve last N points | Returns array of {timestamp, value} |
| `generateSparkline(values)` | Convert numbers to blocks | Maps 0-100% to `▁▂▃▄▅▆▇█` characters |
| `getFiveHourSparkline(count)` | Get sparkline string | Calls generateSparkline with last N values |

**Sparkline Algorithm**:
```javascript
function generateSparkline(values) {
  const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

  // Normalize to 0-7 range
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values.map(v => {
    const normalized = ((v - min) / range) * 7;
    const index = Math.min(7, Math.floor(normalized));
    return blocks[index];
  }).join('');
}
```

**Example Output**: `▁▁▂▂▃▃▄▅▅▆▆▇▇█▇▆▆▅▅▄▃▃▂▂` (24 chars, 4-hour trend)

**Data Retention**:
- Max data points: 48 (4 hours at 5-minute intervals)
- Sparkline display: 24 characters (each representing 10 minutes via 2-point average)
- Auto-cleanup removes points older than 48 entries
- Persisted across VS Code restarts

---

### 9. utils.js (Shared Utilities)

**Lines**: 38
**Role**: Shared utility functions

**Key Functions**:

| Function | Purpose | Example |
|----------|---------|---------|
| `calculateResetClockTime(resetTime)` | Convert relative time to clock time | "2h 30m" → "14:30" |

**Algorithm**:
```javascript
// Input: "2h 30m" or "6d 12h" or "45m"
// Output: "14:30" or "Nov 26, 10:00"

1. Parse with regex: /(\d+)d/, /(\d+)h/, /(\d+)m/
2. Convert to milliseconds
3. Add to current time
4. Format as HH:MM or "Mon DD, HH:MM"
```

---

## Data Flow Diagrams

### Web Scraping Flow

```
User Action (Click status bar / Auto-refresh timer)
    ↓
dataProvider.fetchUsage()
    ↓
┌──────────────────────────────────────────┐
│ 1. Initialize Browser                     │
│    scraper.initialize()                   │
│    ├─ Try connect to port 9222            │
│    ├─ Fall back to launch new browser     │
│    └─ Check for saved session cookies     │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│ 2. Ensure Authentication                  │
│    scraper.ensureLoggedIn()               │
│    ├─ If has session: Continue            │
│    └─ If no session: Show browser, wait   │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│ 3. Fetch Usage Data (Dual Mode)          │
│    scraper.fetchUsageData()               │
│                                           │
│  Priority 1: API Mode                    │
│  ├─ Navigate to settings page            │
│  ├─ Capture /api/.../usage endpoint      │
│  ├─ Make direct fetch to API             │
│  └─ processApiResponse()                 │
│      ↓                                    │
│  Priority 2: HTML Mode (fallback)        │
│  ├─ Parse page body text                 │
│  ├─ Regex extract: /(\d+)%\s*used/       │
│  └─ Regex extract: /Resets?\s+in\s+/     │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│ 4. Store & Process                        │
│    usageHistory.addDataPoint()            │
│    dataProvider.usageData = result        │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│ 5. Update UI                              │
│    updateStatusBarWithAllData()           │
│    ├─ statusBar.updateStatusBar()         │
│    └─ dataProvider.refresh()              │
└──────────────────────────────────────────┘
```

### Token Tracking Flow

```
Extension Activation
    ↓
setupTokenMonitoring()
    ↓
┌──────────────────────────────────────────┐
│ 1. Find Claude Data Directory            │
│    claudeDataLoader.findClaudeDataDirectory() │
│    ├─ Check ~/.config/claude/projects    │
│    ├─ Check ~/.claude/projects           │
│    └─ Check $CLAUDE_CONFIG_DIR           │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│ 2. Setup Dual Monitoring                 │
│                                           │
│  A) File Watcher (Real-time)            │
│     vscode.workspace.createFileSystemWatcher() │
│     ├─ Pattern: **/*.jsonl               │
│     ├─ onDidChange: updateTokens()       │
│     └─ onDidCreate: updateTokens()       │
│                                           │
│  B) Polling Backup (Every 30 seconds)   │
│     setInterval(updateTokens, 30000)     │
│     └─ Safety net for missed events      │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│ 3. Update Token Usage                    │
│    updateTokensFromJsonl()                │
│    ↓                                      │
│    claudeDataLoader.getCurrentSessionUsage() │
│    ├─ Find files modified in last 5 min  │
│    ├─ Read most recent JSONL             │
│    ├─ Parse from end to start            │
│    ├─ Find last "assistant" message      │
│    └─ Extract cache_read_input_tokens    │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│ 4. Store & Distribute                     │
│    sessionTracker.updateTokens()          │
│    ↓                                      │
│    updateStatusBarWithAllData()           │
│    ├─ statusBar.updateStatusBar()         │
│    └─ dataProvider.updateSessionData()    │
└──────────────────────────────────────────┘
```

### Activity Level Calculation

```
activityMonitor.getStats(usageData, sessionData)
    ↓
┌──────────────────────────────────────────┐
│ Extract Web Usage                        │
│ claudePercent = max(                      │
│   usageData.fiveHourUsage,               │
│   usageData.sevenDayUsage                │
│ )                                         │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│ Extract Token Usage                       │
│ tokenPercent = (                          │
│   sessionData.current /                   │
│   sessionData.limit                       │
│ ) * 100                                   │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│ Determine Maximum (Conservative)         │
│ maxPercent = max(                         │
│   claudePercent,                          │
│   tokenPercent                            │
│ )                                         │
└──────────────────────────────────────────┘
    ↓
┌──────────────────────────────────────────┐
│ Map to Activity Level                     │
│ if maxPercent >= 80 → 'heavy'            │
│ if maxPercent >= 50 → 'moderate'         │
│ if maxPercent >= 25 → 'light'            │
│ else → 'idle'                             │
└──────────────────────────────────────────┘
    ↓
Return: {
  level: 'moderate',
  claudePercent: 45,
  tokenPercent: 23,
  maxPercent: 45,
  description: 'Much work, many thought'
}
```

---

## Configuration System

### VS Code Extension Manifest (package.json)

**Extension Metadata**:
```json
{
  "name": "claude-session-usage",
  "displayName": "Claude Session Usage",
  "version": "2.3.9",
  "publisher": "Gronsten",
  "engines": { "vscode": "^1.80.0" }
}
```

**Activation**:
- Event: `onStartupFinished`
- Main: `./extension.js`
- Category: "Other"

**Commands**:
| Command ID | Title | Handler |
|------------|-------|---------|
| `claude-usage.fetchNow` | Fetch Claude Usage Now | `dataProvider.fetchUsage()` |
| `claude-usage.openSettings` | Open Claude Settings Page | Opens https://claude.ai/settings |
| `claude-usage.startNewSession` | Start New Claude Code Session | Prompts for description, creates session |
| `claude-usage.updateTokens` | Update Token Usage (Manual Test) | Test command (hidden from palette) |

**Views Configuration**:
```json
{
  "viewsContainers": {
    "activitybar": [{
      "id": "claude-usage",
      "title": "Claude Usage",
      "icon": "icons/claude-usage-tree-icon.svg"
    }]
  },
  "views": {
    "claude-usage": [{
      "id": "claude-usage-view",
      "name": "Session Usage"
    }]
  }
}
```

**Settings**:

| Setting | Type | Default | Range | Description |
|---------|------|---------|-------|-------------|
| `claudeUsage.fetchOnStartup` | boolean | `true` | - | Auto-fetch on VS Code startup |
| `claudeUsage.headless` | boolean | `true` | - | Run browser in headless mode (shows if login needed) |
| `claudeUsage.autoRefreshMinutes` | number | `5` | 1-60 | Auto-refresh interval in minutes |

**Dependencies**:
```json
{
  "dependencies": {
    "puppeteer": "^24.15.0"
  },
  "devDependencies": {
    "@types/vscode": "^1.80.0"
  }
}
```

---

## External Dependencies

### Runtime Dependencies

**puppeteer** (^24.15.0)
- **Purpose**: Chromium automation for web scraping
- **Download Size**: ~150-200MB (includes Chromium)
- **Features Used**:
  - Browser launch and connection
  - Page navigation and interaction
  - Request interception (API capture)
  - Cookie/session persistence
  - Headless and headed modes

### Dev Dependencies

**@types/vscode** (^1.80.0)
- **Purpose**: TypeScript definitions for VS Code extension API
- **Use**: Type checking and IntelliSense (even for JavaScript projects)

### Built-in Node.js Modules

| Module | Usage |
|--------|-------|
| `fs` / `fs.promises` | File system operations (read JSONL, save session data) |
| `path` | Path manipulation (join, resolve, dirname) |
| `os` | OS information (homedir, tmpdir) |
| `vscode` | VS Code extension API (commands, views, status bar, etc.) |

---

## Performance Characteristics

### Resource Usage

| Metric | Value | Notes |
|--------|-------|-------|
| **Web Scraping** | 2-10 seconds | Depends on network speed and API vs HTML mode |
| **JSONL Parsing** | <100ms | Native Node.js, no external deps |
| **File Watching** | Instant | OS-level file system notifications |
| **Memory Usage** | ~150-200MB | Chromium browser when running |
| **Disk Usage** | ~150-200MB | Puppeteer Chromium download |
| **Auto-refresh Impact** | Minimal | Browser closes between fetches |

### Optimization Strategies

1. **API-First Fetching**: 2-3x faster than HTML scraping
2. **Browser Connection Pooling**: Reuses existing Chrome instance
3. **Smart Headless Mode**: Shows browser only when authentication needed
4. **Lazy Browser Launch**: Only launches when fetching data
5. **Incremental JSONL Parsing**: Reads from end-to-start (stops at first match)
6. **30-Second Polling**: Balance between real-time and CPU usage

---

## Common Development Patterns

### 1. Adding a New Command

**Step 1**: Register in package.json
```json
{
  "contributes": {
    "commands": [{
      "command": "claude-usage.myNewCommand",
      "title": "My New Command",
      "category": "Claude"
    }]
  }
}
```

**Step 2**: Implement in extension.js
```javascript
// In activate(context)
context.subscriptions.push(
  vscode.commands.registerCommand('claude-usage.myNewCommand', async () => {
    // Implementation here
    vscode.window.showInformationMessage('Command executed!');
  })
);
```

### 2. Adding a New Tree View Item

**Modify dataProvider.js**:
```javascript
async getChildren(element) {
  const items = await super.getChildren(element);

  // Add new item
  items.push(new vscode.TreeItem(
    'My New Item',
    vscode.TreeItemCollapsibleState.None
  ));

  return items;
}
```

### 3. Adding a New Configuration Setting

**Step 1**: Add to package.json
```json
{
  "configuration": {
    "properties": {
      "claudeUsage.myNewSetting": {
        "type": "boolean",
        "default": true,
        "description": "My new setting description"
      }
    }
  }
}
```

**Step 2**: Read in code
```javascript
const config = vscode.workspace.getConfiguration('claudeUsage');
const myValue = config.get('myNewSetting');
```

**Step 3**: Listen for changes
```javascript
vscode.workspace.onDidChangeConfiguration(e => {
  if (e.affectsConfiguration('claudeUsage.myNewSetting')) {
    // Handle change
  }
});
```

### 4. Packaging a New Version

**Workflow Checklist**:
```bash
# 1. Update version in package.json
"version": "2.3.10"

# 2. Update CHANGELOG.md
### v2.3.10 (2025-XX-XX)
- Added: New feature description

# 3. Package the extension
npm run package

# 4. Move old .vsix to archive
mv claude-session-usage-2.3.9.vsix archive/

# 5. Test the new .vsix
# Install in VS Code and verify

# 6. Commit changes
git add .
git commit -S -m "Release v2.3.10"
git push origin main

# 7. Create GitHub release
gh release create v2.3.10 --title "v2.3.10 - Feature Name" \
  --notes "Release notes..." \
  claude-session-usage-2.3.10.vsix
```

### 5. Debugging the Extension

**VS Code Debug Configuration** (.vscode/launch.json):
```json
{
  "type": "extensionHost",
  "request": "launch",
  "name": "Launch Extension",
  "runtimeExecutable": "${execPath}",
  "args": ["--extensionDevelopmentPath=${workspaceFolder}"]
}
```

**Debugging Steps**:
1. Press `F5` to launch Extension Development Host
2. Set breakpoints in source files
3. Open "Debug Console" for output
4. Use "Output" → "Extension Host" for logs
5. Run commands in development host to trigger breakpoints

---

## Troubleshooting Guide

### Common Issues

**Issue: Token usage not updating**

**Symptoms**: Status bar shows stale token counts

**Diagnosis**:
1. Check "Claude Usage - Token Monitor" output channel
2. Verify Claude Code is saving to `~/.config/claude/projects/`
3. Check file watcher has permissions

**Solution**:
```javascript
// Check output channel for diagnostic logs
// Look for:
"✅ Found Claude data directory: /path/to/.config/claude"
"📊 Current session: X tokens (Y messages)"
```

---

**Issue: Web scraping fails with "Login required"**

**Symptoms**: Browser shows login page, extension can't fetch data

**Diagnosis**:
1. Session cookies expired
2. Claude.ai changed authentication flow

**Solution**:
```bash
# 1. Delete saved session
rm -rf ~/.claude-browser-session/

# 2. Manually fetch usage (browser will show)
# Command Palette → "Fetch Claude Usage Now"

# 3. Log in when browser appears
# Extension will save new session
```

---

**Issue: Browser won't close / lock file error**

**Symptoms**: Multiple browser instances, "UserDataDir is already in use"

**Diagnosis**: Previous browser instance didn't close cleanly

**Solution**:
```bash
# Run cleanup utility
node cleanup-browser.js

# Or manually:
rm -rf /tmp/puppeteer-* # Mac/Linux
# Windows: Delete %TEMP%\puppeteer-* folders
```

---

**Issue: JSONL files not found**

**Symptoms**: Output channel shows "Claude data directory not found"

**Diagnosis**: Claude Code data in non-standard location

**Solution**:
```bash
# Set custom path in environment
export CLAUDE_CONFIG_DIR="/custom/path/to/claude"

# Or check where Claude Code is saving:
ls ~/.config/claude/projects/*.jsonl
ls ~/.claude/projects/*.jsonl
```

---

**Issue: High memory usage**

**Symptoms**: VS Code slow, high RAM consumption

**Diagnosis**: Puppeteer browser not closing

**Solution**:
1. Ensure `autoRefreshMinutes` is reasonable (≥5 minutes)
2. Check for multiple browser processes (`ps aux | grep chrome`)
3. Restart VS Code to clean up

---

**Issue: Sparklines not showing**

**Symptoms**: Tree view shows "N/A" for sparklines

**Diagnosis**: Not enough historical data points

**Solution**:
- Wait for at least 2 auto-refresh cycles
- Manually fetch usage to populate history
- Check `claude-usage-history.json` exists

---

## Quick Reference

### File Locations

| Purpose | Windows | Mac/Linux |
|---------|---------|-----------|
| Session data | `%TEMP%\claude-session-data.json` | `/tmp/claude-session-data.json` |
| Usage history | `%TEMP%\claude-usage-history.json` | `/tmp/claude-usage-history.json` |
| Browser session | `%USERPROFILE%\.claude-browser-session\` | `~/.claude-browser-session/` |
| Claude JSONL | `%USERPROFILE%\.config\claude\projects\` | `~/.config/claude/projects/` |

### Key Line Numbers (Approximate)

| Feature | File | Lines |
|---------|------|-------|
| Main entry point | extension.js | 1-309 |
| Web scraping | scraper.js | 1-500 |
| JSONL parsing | claudeDataLoader.js | 1-376 |
| Tree view | dataProvider.js | 1-280 |
| Token monitoring setup | extension.js | 21-83 |
| Current session detection | claudeDataLoader.js | 200-250 |
| Dual-mode fetching | scraper.js | 150-300 |

### Architecture Diagrams Key

- **→** Sequential flow
- **├─** Branch/option
- **└─** Final branch/end
- **↓** Continues downward
- **$(icon)** VS Code ThemeIcon

---

**End of Architecture Document**

*For user-facing documentation, see [README.md](README.md). For quick setup, see [QUICKSTART.md](QUICKSTART.md).*
