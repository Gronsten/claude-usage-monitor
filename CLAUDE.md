# Claude Usage Extension - Development Guidelines

## Archiving Old Versions

### Practice
After packaging a new .vsix version, **ALWAYS** move the old .vsix files to the `archive/` folder to keep the root directory clean.

### Commands
```bash
# Build and package new version
npm run package

# Move old versions to archive
mv *.vsix archive/  # Move all but keep the latest one out

# Or move specific old versions
mv extension-name-X.Y.Z.vsix archive/
```

### Directory Structure
```
claude-usage/
├── archive/              # All previous .vsix versions
│   ├── claude-usage-monitor-1.0.0.vsix
│   ├── claude-usage-monitor-1.0.1.vsix
│   └── claude-session-usage-1.1.0.vsix
├── extension-name-2.0.0.vsix  # Current/latest version only
├── package.json
└── extension.js
```

### Why?
- Keeps root directory clean and organized
- Preserves version history for rollback if needed
- Makes it clear which is the current/latest version
- Prevents accidental installation of old versions

### Workflow Checklist
1. Make changes and test
2. Update version in package.json
3. Update CHANGELOG.md
4. Run `npm run package` (builds with esbuild + packages)
5. **Move previous .vsix file(s) to archive/**
6. Test the new .vsix installation
7. Commit and push changes
8. Create git tag if publishing

---

## Automatic Token Tracking (v2.3.0+)

This extension **automatically tracks** Claude Code session token usage in real-time by monitoring JSONL files.

### How It Works

The extension monitors `~/.claude/projects/*.jsonl` files where Claude Code stores conversation data:
- **File Watcher**: Detects changes instantly when you use Claude Code
- **30-Second Polling**: Backup mechanism ensures reliability
- **Automatic Parsing**: Extracts token usage from JSONL entries
- **Real-Time Display**: Updates status bar and tree view automatically

### What Gets Tracked

For the current session (last hour):
- **Input Tokens**: Tokens in your prompts and context
- **Output Tokens**: Tokens in Claude's responses
- **Cache Read Tokens**: Tokens read from prompt cache
- **Cache Creation Tokens**: Tokens used to create cache entries

### Token Display

**Status Bar:**
- Shows combined Claude.ai usage + current session tokens
- Example: `Claude: 45% | Session: 12.5K tokens`
- Tooltip shows detailed breakdown

**Tree View:**
- Displays individual token categories
- Shows sparkline graphs for usage trends
- Updates automatically as you use Claude Code

**Output Channel:**
- Detailed diagnostic logs in "Claude Usage - Token Monitor"
- Shows JSONL parsing results
- Useful for troubleshooting

### Data Sources

The extension reads from two locations (checks both):
1. `~/.claude/projects/` (Windows/Mac)
2. `~/.config/claude/projects/` (Linux)

JSONL files contain conversation history with format:
```json
{"type":"usage","inputTokens":1234,"outputTokens":567,...}
```

### Usage History & Sparklines (v2.3.0)

The extension now visualizes usage trends:
- **ASCII Sparklines**: Shows last 8 data points (e.g., `▁▂▃▅▆▇█▇`)
- **5-Hour Usage**: Sparkline showing usage trend over time
- **Automatic Updates**: New data point every 5 minutes
- **Persistence**: Stored in `claude-usage-history.json`

### No Manual Updates Needed!

**Previous versions (v2.2.0 and earlier)** required manual token updates via Node.js commands.

**v2.3.0+** is fully automatic - just use Claude Code normally and the extension tracks everything!

### Legacy: Manual Tracking (v2.2.0 and earlier)

<details>
<summary>Click to view legacy manual tracking instructions (not needed in v2.3.0+)</summary>

**Note:** These instructions are for historical reference only. v2.3.0+ handles tracking automatically.

In older versions, you had to manually update token usage:

```bash
# Start new session (v2.2.0)
node -e "const {SessionTracker}=require('./src/sessionTracker');new SessionTracker().startSession('Description')"

# Update tokens manually (v2.2.0)
node -e "const {SessionTracker}=require('./src/sessionTracker');new SessionTracker().updateTokens(CURRENT_TOKENS,200000)"
```

**This is no longer necessary in v2.3.0+** - the extension monitors JSONL files automatically!

</details>

### Migration from v2.2.0 to v2.3.0

If you're upgrading from v2.2.0:
- Remove any manual token update commands from your workflow
- The extension will automatically start tracking when you use Claude Code
- Historical session data from `claude-session-data.json` is preserved
- JSONL monitoring works alongside (not replacing) Claude.ai web scraping

### Troubleshooting

**Not seeing token updates?**
1. Check "Claude Usage - Token Monitor" output channel for diagnostic logs
2. Verify Claude Code is saving to `~/.claude/projects/` directory
3. Ensure file watcher has permissions to read the directory
4. Check that JSONL files exist and contain usage data

**Want to see what's being tracked?**
- Open Command Palette (Ctrl+Shift+P)
- Run "Developer: Show Logs"
- Select "Extension Host" to see extension logs
- Look for "Token usage from JSONL" messages
