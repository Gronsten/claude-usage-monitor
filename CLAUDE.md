# Claude Usage Extension - Development Guidelines

## Archiving Old Versions

### Practice
After packaging a new .vsix version, **ALWAYS** move the old .vsix files to the `archive/` folder to keep the root directory clean.

### Commands
```bash
# Package new version
vsce package

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
4. Run `vsce package`
5. **Move previous .vsix file(s) to archive/**
6. Test the new .vsix installation
7. Commit and push changes
8. Create git tag if publishing

---

## Session Token Tracking

This extension tracks Claude Code session token usage in real-time.

### Session Lifecycle (Important!)

Claude Code conversations and VS Code extension lifecycles are different:
- **Claude Code Conversation**: Starts when you begin a new chat, ends when you start another chat
- **Extension Lifecycle**: Activates/deactivates when VS Code starts/stops or reloads

**Key Point:** Sessions should track Claude Code conversations, NOT extension activations.

### Starting a New Session

**At the beginning of each NEW Claude Code conversation**, run:

```bash
# In the extension's directory
cd "c:\Users\mark.campbell3\OneDrive - Chick-fil-A, Inc\Desktop\!_WORKING\vscode-extensions\claude-usage"
node -e "const {SessionTracker}=require('./src/sessionTracker');new SessionTracker().startSession('Your session description').then(s=>console.log('Started:',s.sessionId))"
```

Or use the VS Code command: **"Claude: Start New Claude Code Session"**

This creates a new session with tokens starting at 0.

### IMPORTANT: Update After Every Response

**You MUST update the session-data.json file after EVERY response that includes tool calls.**

Look for the `<system_warning>Token usage: X/200000` message and use that number to update the session file:

```bash
node -e "const {SessionTracker}=require('./src/sessionTracker');new SessionTracker().updateTokens(CURRENT_TOKENS,200000)"
```

### Example Workflow

**Day 1 - New Claude Code Conversation:**
1. Start new chat in Claude Code
2. **Run:** `node -e "const {SessionTracker}=require('./src/sessionTracker');new SessionTracker().startSession('Implementing resilient data fetching').then(s=>console.log('Started:',s.sessionId))"`
3. You make tool calls (Read, Edit, Bash, etc.)
4. System shows: `<system_warning>Token usage: 48801/200000; 151199 remaining</system_warning>`
5. **IMMEDIATELY run:**
   ```bash
   node -e "const {SessionTracker}=require('./src/sessionTracker');new SessionTracker().updateTokens(48801,200000)"
   ```
6. Continue working, updating tokens after each response

**Later - VS Code Reload (same conversation):**
7. You reload VS Code or the extension
8. **DO NOT start a new session** - you're still in the same Claude Code conversation
9. Continue updating tokens as before

**Day 2 - New Claude Code Conversation:**
10. Start new chat in Claude Code
11. **Run:** Start new session command again (step 2)
12. Tokens reset to 0 for this new conversation

### When to Update Tokens

- ✅ After every response with tool calls
- ✅ After reading/writing multiple files
- ✅ After running bash commands
- ✅ At major milestones in the conversation
- ❌ Don't wait until end of conversation
- ❌ Don't skip "small" tool calls

### When to Start New Session

- ✅ At the START of a new Claude Code conversation (new chat)
- ✅ When beginning a completely new development task
- ❌ **NOT** when reloading VS Code
- ❌ **NOT** when extension activates/deactivates
- ❌ **NOT** in the middle of an ongoing conversation

### Why This Matters

The extension you're developing displays these token stats in the VS Code status bar. Keeping this file updated ensures:
- Real-time token usage visibility
- Accurate per-conversation session tracking
- Testing of the extension's own functionality
- Historical record of token usage per development session
