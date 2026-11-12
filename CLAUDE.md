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
7. Update README.md/ARCHITECTURE.md for any user-visible change (docs ship with every release;
   the marketplace listing README comes from the packaged `.vsix`)
8. Commit (signed) and push on a feature branch, open a PR, wait for approval, squash-merge
9. Create the GitHub release from the merged `main`, attaching the `.vsix`:
   `gh release create vX.Y.Z claude-session-usage-X.Y.Z.vsix --title "..." --notes-file notes.md`
10. Publish that same `.vsix` to the marketplace (see Publishing below)

### Publishing

Publish the exact `.vsix` attached to the GitHub release so both channels match:

```bash
vsce publish --packagePath claude-session-usage-X.Y.Z.vsix
```

- **Auth:** `vsce` reads the marketplace Personal Access Token from the `VSCE_PAT` environment
  variable (user-level on Windows). `vsce login` is not needed and stores the token in clear text
  in `~/.vsce`; prefer the env variable. Verify with `vsce verify-pat Gronsten`.
- **Creating/rotating the PAT:** https://dev.azure.com > User settings > Personal access tokens,
  Organization "All accessible organizations", scope **Marketplace > Manage**. Rotate with
  `[Environment]::SetEnvironmentVariable('VSCE_PAT','<token>','User')` and restart terminals.
- **Expired PAT symptom:** `Access Denied: The Personal Access Token used has expired`.
- **Versions are immutable:** a published version cannot be overwritten. README/docs changes only
  reach the marketplace listing with the next version.
- **vsce version:** installed globally via `npm i -g @vscode/vsce`. The corporate npm mirror
  (cfa.jfrog.io) does not carry `yauzl@3.4.0`, so vsce 4.x fails to install there; 3.9.2 is the
  newest that resolves. Do not bypass the mirror without checking company policy.
- **Open VSX** is not currently published to (needs an `ovsx` token).
- **Slow uploads:** `gh release create` with the `.vsix` can take several minutes and can leave
  an empty draft if interrupted; run it in the background and verify with `gh release view`.

### Documentation images

The README images live in `screenshots/` (PNG) and `assets/demo.gif`. Both are bundled in the
`.vsix`, so keep them small. Retake them when the UI they show changes (see the docs-with-every-release
step above); a refresh only reaches the marketplace listing with the next version.

**Capture with Windows 11 built-in tools** (no install needed):

- **Screenshots:** Snipping Tool (`Win+Shift+S`) saves PNGs. A hover tooltip disappears when a key is
  pressed, so use the Snipping Tool *app* with its 3-second delay and hover the item instead of the hotkey.
- **Demo GIF:** the Snipping Tool screen recorder (`Win+Shift+R`) records the screen and exports a GIF.
- Use the dark theme, crop tightly, and avoid anything personal (account names, other extensions).
  Run the real extension, ideally the published build, with live data.

| File | Show |
|------|------|
| `screenshots/status-bar.png` | Status bar item, for example `Claude: 45%`, with the pace-colored icon |
| `screenshots/tooltip.png` | Hover tooltip: usage %, reset time, **Usage Pace**, projection line, version footer |
| `screenshots/tree-view.png` | Claude Usage activity-bar panel: sparkline, usage, reset countdown (take it when usage is above 0%) |
| `screenshots/settings.png` | Settings filtered to `Claude Usage`, showing the current options |
| `assets/demo.gif` | Status bar refresh, tooltip hover, then the Claude Usage panel; aim for 15-25 s |

**Shrink the GIF** (the recorder saves every frame whole; a raw export can be over 10 MB). Install
`gifsicle` with `scoop install gifsicle`, then:

```bash
# 1. Lossless re-optimisation + 128 colors: ~11 MB -> ~1.3 MB, visually identical
gifsicle -O3 --colors 128 raw.gif -o demo.gif

# 2. Drop every second frame and double each delay (same speed, half the frames): ~0.8 MB
#    (delays are uniform in recorder output; check with: gifsicle --info demo.gif)
gifsicle -U --delay=16 demo.gif $(seq -f "#%g" 0 2 <lastframe>) -O3 --colors 128 -o demo-small.gif

# 3. Cut a section (keep frames 0-72 and 118-172, drop the rest)
gifsicle -U --delay=16 demo-small.gif '#0-72' '#118-172' -O3 --colors 128 -o demo-final.gif
```

- Do not use `--resize-width` or `--lossy` here: resizing scrambled the frame delays and lossy made the
  file larger in testing.
- To find cut points, split into full frames with `gifsicle -U --explode -o frame demo.gif`, then give the
  files a `.gif` extension to open them in an image viewer. At 6.25 FPS, frame number x 0.16 s is the time.
- Target: GIF under about 1 MB; each PNG under 100 KB.

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
