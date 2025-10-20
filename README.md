# Claude Usage Monitor

Monitor your Claude.ai chat usage directly in VS Code. This extension uses Puppeteer to fetch your current usage percentage and reset time from the Claude.ai settings page.

## Features

- **Real-time Usage Monitoring**: See your Claude.ai usage percentage at a glance
- **Status Bar Integration**: Quick view in the VS Code status bar
- **Tree View Panel**: Detailed usage information in a dedicated side panel
- **Auto-refresh**: Optional automatic usage updates
- **Session Persistence**: Log in once, stay authenticated across VS Code sessions
- **Visual Indicators**: Color-coded warnings when approaching usage limits

## Installation

### Prerequisites

- VS Code 1.80.0 or higher
- Node.js installed (for Puppeteer/Chromium)

### Install from VSIX

1. Download the `.vsix` file
2. Open VS Code
3. Go to Extensions view (`Ctrl+Shift+X`)
4. Click the `...` menu at the top
5. Select "Install from VSIX..."
6. Choose the downloaded file

## First-Time Setup

The first time you fetch usage data, you'll need to log in to Claude.ai:

1. Click the "Claude Usage" item in the status bar, or run the command "Fetch Claude Usage Now"
2. A browser window will open to claude.ai
3. Log in with your credentials (Google, email, etc.)
4. Once logged in, the extension will automatically fetch your usage data
5. Your session is saved locally - you won't need to log in again!

## Usage

### Fetch Usage Data

There are several ways to fetch your usage data:

1. **Click the status bar item** (right side of VS Code)
2. **Use Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`):
   - Search for "Fetch Claude Usage Now"
3. **View the Activity Bar panel**:
   - Click the Claude Usage icon in the Activity Bar (left sidebar)
   - View detailed usage information

### View Usage Information

- **Status Bar**: Shows current usage percentage with a color-coded icon
  - Green check: < 80% usage
  - Orange warning: 80-89% usage
  - Red error: ≥ 90% usage

- **Tree View Panel**: Shows detailed information:
  - Usage percentage
  - Time until reset
  - Last update timestamp

## Configuration

Open VS Code Settings and search for "Claude Usage" to configure:

### `claudeUsage.fetchOnStartup`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Automatically fetch usage data when VS Code starts

### `claudeUsage.headless`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Run browser in headless mode (invisible) after first login. Set to `true` for better performance after initial setup.

### `claudeUsage.autoRefreshMinutes`
- **Type**: Number
- **Default**: `0` (disabled)
- **Description**: Automatically refresh usage data every X minutes. Set to `0` to disable auto-refresh.

**Example Configuration** (`settings.json`):
```json
{
  "claudeUsage.fetchOnStartup": true,
  "claudeUsage.headless": true,
  "claudeUsage.autoRefreshMinutes": 30
}
```

## Commands

All commands are available via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- **`Claude: Fetch Claude Usage Now`** - Manually fetch current usage data
- **`Claude: Open Claude Settings Page`** - Open claude.ai/settings in your default browser

## How It Works

1. The extension uses Puppeteer to launch a Chromium browser
2. On first run, you manually log in to Claude.ai
3. Your session is saved to `~/.claude-browser-session/` for future use
4. The extension navigates to `claude.ai/settings`
5. Usage data is extracted from the page and displayed in VS Code
6. Subsequent fetches use your saved session (no re-login required)

## Privacy & Security

- **No credentials stored**: The extension never stores or transmits your credentials
- **Local session only**: Your authentication session is saved locally by Chromium
- **No data transmission**: Usage data stays on your machine
- **Open source**: All code is available for review

## Troubleshooting

### Browser won't launch

**Problem**: Error message "Failed to launch browser"

**Solutions**:
- Ensure you have enough disk space (~500MB for Chromium)
- Check that no antivirus is blocking Puppeteer
- Try running VS Code as administrator (Windows)

### Login timeout

**Problem**: "Login timeout" error after 5 minutes

**Solutions**:
- Complete the login process more quickly
- Check your internet connection
- Try again - the browser window should still be open

### Session expired

**Problem**: Browser keeps asking you to log in

**Solutions**:
- Delete the session folder: `~/.claude-browser-session/`
- Log in again - session should persist this time
- Make sure `headless` mode is `false` during login

### Can't find usage data

**Problem**: "Could not find usage percentage" error

**Solutions**:
- Claude.ai may have changed their settings page layout
- Check if you can see your usage at [claude.ai/settings](https://claude.ai/settings)
- Report an issue for the extension to be updated

### Performance issues

**Problem**: Browser uses too much memory

**Solutions**:
- Enable `headless` mode after first login
- Disable `autoRefreshMinutes` or increase the interval
- The browser closes automatically after fetching to save memory

## Known Limitations

- Requires Chromium to be downloaded by Puppeteer (~150-200MB)
- Fetch time: 2-10 seconds depending on network speed
- If Claude.ai changes their settings page, the extension may need updates
- Sessions can expire (typically after several weeks of inactivity)

## Feedback & Issues

If you encounter any issues or have suggestions:

1. Check the troubleshooting section above
2. Review open issues on the project repository
3. Submit a new issue with:
   - VS Code version
   - Extension version
   - Error messages from the Output panel (View → Output → Claude Usage Monitor)
   - Steps to reproduce

## Version History

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.

## License

MIT License - See LICENSE file for details

---

**Note**: This is an unofficial extension and is not affiliated with Anthropic or Claude.ai.
