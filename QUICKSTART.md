# Quick Start Guide

Get your Claude Usage Monitor extension up and running in 5 minutes!

## 📋 Project Structure

```
claude-usage/
├── package.json           # Extension manifest
├── extension.js           # Main entry point
├── src/
│   ├── scraper.js        # Puppeteer browser controller
│   ├── dataProvider.js   # Tree view data provider
│   └── statusBar.js      # Status bar manager
├── .vscode/
│   └── launch.json       # Debug configuration
├── .vscodeignore         # Files excluded from package
├── .gitignore           # Git ignore rules
├── README.md            # User documentation
├── CHANGELOG.md         # Version history
├── TESTING.md           # Testing guide
└── QUICKSTART.md        # This file
```

## 🚀 Testing the Extension

### Step 1: Open the Project
```bash
cd "c:\Users\mark.campbell3\OneDrive - Chick-fil-A, Inc\Desktop\!_WORKING\vscode-extensions\claude-usage"
code .
```

### Step 2: Launch Extension Development Host
- Press **F5** in VS Code
- Or: Run → Start Debugging
- A new VS Code window will open with your extension loaded

### Step 3: Test Basic Functionality
1. Look for "$(cloud) Claude Usage" in the status bar (bottom right)
2. Click it to trigger the first fetch
3. A browser window will open to claude.ai
4. Log in with your Claude.ai credentials
5. Wait for the extension to fetch your usage data
6. You should see a notification with your usage percentage!

### Step 4: Verify Features
- **Status Bar**: Should show "✓ Claude: XX%"
- **Activity Bar**: Click the pulse icon to see detailed usage
- **Tree View**: Shows usage %, reset time, and last update

## ⚙️ Configuration (Optional)

Press `Ctrl+,` to open settings and search for "Claude Usage":

```json
{
  "claudeUsage.fetchOnStartup": false,        // Auto-fetch when VS Code starts
  "claudeUsage.headless": true,              // Run browser in background
  "claudeUsage.autoRefreshMinutes": 30       // Auto-refresh every 30 min
}
```

## 📦 Packaging for Distribution

### Install VSCE (VS Code Extension Manager)
```bash
npm install -g @vscode/vsce
```

### Create VSIX Package
```bash
cd "c:\Users\mark.campbell3\OneDrive - Chick-fil-A, Inc\Desktop\!_WORKING\vscode-extensions\claude-usage"
vsce package
```

This creates `claude-usage-monitor-1.0.0.vsix`

### Install Your Extension
1. Open VS Code
2. Extensions view (`Ctrl+Shift+X`)
3. Click `...` menu → "Install from VSIX..."
4. Select your `.vsix` file

## 🔧 Development Workflow

### Making Changes
1. Edit code in your main VS Code window
2. In Extension Development Host: Press `Ctrl+R` to reload
3. Or close and press F5 again

### Debugging
- Set breakpoints in your code
- View console: Help → Toggle Developer Tools (in Extension Development Host)
- Check Extension Host output: View → Output → "Extension Host"

### Common Commands
```bash
# Install dependencies (already done)
npm install

# Package extension
vsce package

# Publish to marketplace (requires publisher account)
vsce publish
```

## 🎯 Key Files Explained

### package.json
- Extension manifest
- Defines commands, views, and configuration
- Lists dependencies (Puppeteer)

### extension.js
- Entry point: `activate()` and `deactivate()`
- Registers commands and initializes components
- Sets up auto-refresh timer

### src/scraper.js
- Launches Puppeteer browser
- Handles authentication
- Extracts usage data from claude.ai/settings

### src/dataProvider.js
- Provides data for tree view
- Manages usage data state
- Handles refresh logic

### src/statusBar.js
- Creates and updates status bar item
- Shows color-coded usage indicators
- Provides tooltips

## 🐛 Troubleshooting

### Browser won't launch
```bash
# Reinstall Puppeteer
npm install puppeteer
```

### Session not persisting
- Ensure `headless` is `false` for first login
- Check that `~/.claude-browser-session/` exists
- Try deleting the folder and logging in again

### Can't find usage data
- Manually visit claude.ai/settings in a regular browser
- Verify you can see your usage there
- The page layout may have changed (update regex in scraper.js)

## 📚 Next Steps

1. **Test thoroughly** - See [TESTING.md](TESTING.md)
2. **Customize** - Add your own features
3. **Package** - Create VSIX for distribution
4. **Share** - Install on other machines or publish to marketplace

## 💡 Tips

- **First login**: Keep browser visible (`headless: false`)
- **After login**: Enable headless mode for better performance
- **Auto-refresh**: Set to 30-60 minutes for passive monitoring
- **Fetch on startup**: Enable if you want data right away

## 🎉 Success Criteria

You're ready to go when:
- ✅ Status bar shows your Claude usage
- ✅ Tree view displays detailed information
- ✅ Browser session persists (no re-login needed)
- ✅ All commands work from Command Palette
- ✅ Configuration options change behavior

---

**Happy coding!** You've just built your first VS Code extension!

For detailed information, see:
- [README.md](README.md) - User documentation
- [TESTING.md](TESTING.md) - Comprehensive testing guide
- [CHANGELOG.md](CHANGELOG.md) - Version history
