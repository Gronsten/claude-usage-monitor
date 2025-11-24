# Testing Guide - Claude Usage Monitor

This guide will help you test the extension in the Extension Development Host.

## Prerequisites

- VS Code installed
- npm dependencies installed (`npm install` already completed)
- Node.js and npm available

## How to Test the Extension

### Method 1: Press F5 (Recommended)

1. Open the `claude-usage` folder in VS Code
2. Press `F5` on your keyboard
3. A new VS Code window will open (Extension Development Host)
4. The extension will be loaded and activated in this window

### Method 2: Use Debug Menu

1. Open the `claude-usage` folder in VS Code
2. Go to **Run → Start Debugging** (or Debug view on sidebar)
3. Select "Run Extension" from the dropdown
4. Click the green play button
5. A new VS Code window will open with the extension loaded

## Testing Checklist

### Initial Setup Test

- [ ] Extension Development Host window opens successfully
- [ ] Check status bar (bottom right) - should see "$(cloud) Claude Usage"
- [ ] Check Activity Bar (left sidebar) - should see Claude Usage icon (pulse icon)
- [ ] Click the Activity Bar icon - panel should open with message "Click status bar..."

### First Fetch Test

- [ ] Click the status bar "Claude Usage" item
- [ ] Browser window should open (Chromium)
- [ ] Browser navigates to claude.ai
- [ ] If not logged in: Log in manually with your credentials
- [ ] Wait for browser to navigate to settings page
- [ ] VS Code should show progress notification
- [ ] Success notification should appear with usage percentage
- [ ] Status bar should update to show "$(check) Claude: XX%"
- [ ] Tree view panel should show:
  - Usage: XX%
  - Resets in: [time]
  - Last updated: [timestamp]

### Browser Session Persistence Test

- [ ] Close the Extension Development Host window
- [ ] Press F5 again to reload
- [ ] Click status bar to fetch usage again
- [ ] Browser should NOT ask you to log in (session persisted)
- [ ] Data should fetch successfully without re-login

### Status Bar Test

- [ ] Click status bar item - should trigger fetch
- [ ] Hover over status bar - tooltip should show details
- [ ] Status bar icon should change based on usage:
  - Green check if usage < 80%
  - Orange warning if usage 80-89%
  - Red error if usage ≥ 90%

### Command Palette Test

- [ ] Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
- [ ] Type "Claude" - should see two commands:
  - "Claude: Fetch Claude Usage Now"
  - "Claude: Open Claude Settings Page"
- [ ] Run "Fetch Claude Usage Now" - should fetch data
- [ ] Run "Open Claude Settings Page" - should open browser to claude.ai/settings

### Configuration Test

1. Open VS Code Settings (`Ctrl+,`)
2. Search for "Claude Usage"
3. Test each setting:

#### fetchOnStartup
- [ ] Enable "Fetch On Startup"
- [ ] Reload Extension Development Host window (`Ctrl+R` in that window)
- [ ] Extension should automatically fetch usage within 2 seconds
- [ ] Disable setting and verify no auto-fetch on next reload

#### headless
- [ ] Enable "Headless" mode
- [ ] Click status bar to fetch
- [ ] Browser should run in background (no visible window)
- [ ] Data should still be fetched successfully
- [ ] **Note**: Disable headless for first-time login!

#### autoRefreshMinutes
- [ ] Set to `1` (1 minute)
- [ ] Wait 1 minute
- [ ] Extension should automatically refresh usage
- [ ] Status bar should update
- [ ] Check VS Code Output panel for logs
- [ ] Set back to `0` to disable

### Error Handling Test

#### Network Error
- [ ] Disconnect internet
- [ ] Try to fetch usage
- [ ] Should see error message about network/timeout

#### Invalid Session
- [ ] Delete session folder: `~/.claude-browser-session/`
- [ ] Try to fetch usage
- [ ] Should prompt for login again

#### Page Not Found (Simulate)
- [ ] Modify URL in scraper.js to invalid page (e.g., claude.ai/invalid)
- [ ] Try to fetch
- [ ] Should handle gracefully with error message
- [ ] Restore correct URL

### Visual Testing

- [ ] Check tree view icons are appropriate
- [ ] Verify status bar colors match usage levels
- [ ] Test with different VS Code themes (dark/light)
- [ ] Ensure tooltips are readable and informative

## Debugging Tips

### View Console Logs

1. In Extension Development Host window:
   - **Help → Toggle Developer Tools**
2. Go to Console tab
3. Look for logs from the extension

### View Extension Output

1. In Extension Development Host window:
   - **View → Output**
2. Select "Extension Host" from dropdown
3. Look for activation and error messages

### Common Issues

**Extension doesn't activate:**
- Check package.json syntax is valid
- Look for errors in Extension Host output
- Verify `activationEvents` is set correctly

**Browser won't launch:**
- Check that Puppeteer installed correctly
- Look in terminal/output for Chromium download errors
- Try running `npm install puppeteer` manually

**Can't find usage data:**
- Open browser manually to claude.ai/settings
- Check if page layout has changed
- Verify regex patterns in scraper.js still match

**Session not persisting:**
- Check `~/.claude-browser-session/` exists
- Ensure headless mode is OFF for initial login
- Try deleting session folder and logging in again

## Performance Testing

- [ ] Measure time from click to data displayed (should be 2-10 seconds)
- [ ] Check memory usage in Task Manager
- [ ] Verify browser closes after fetch (memory should drop)
- [ ] Test with auto-refresh enabled for extended period

## Edge Cases

- [ ] Test with no internet connection
- [ ] Test when Claude.ai is down
- [ ] Test with expired session
- [ ] Test rapid repeated fetches (click multiple times)
- [ ] Test with different Claude.ai usage levels (if possible)

## Final Verification

Before considering the extension ready:

- [ ] All core features work as expected
- [ ] No console errors during normal operation
- [ ] Error messages are user-friendly
- [ ] Documentation matches actual behavior
- [ ] Configuration options all work correctly
- [ ] Extension can be packaged: `npm run package`

## Packaging Test

Package the extension using the npm script:

```bash
cd claude-usage
npm run package
```

- [ ] Package creates successfully (creates .vsix file)
- [ ] Install .vsix in fresh VS Code instance
- [ ] Verify all features work in production install

## Notes

- Extension Development Host is a separate VS Code instance
- Changes to code require reloading the Extension Development Host
- To reload: Press `Ctrl+R` in the Extension Development Host window
- Or close and press F5 again in your main VS Code window

---

**Happy Testing!** Report any issues you find and verify fixes work as expected.
