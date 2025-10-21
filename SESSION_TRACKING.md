# Session Tracking

This project includes a simple session tracking system to monitor Claude Code token usage during development.

## Overview

The `SessionTracker` class helps you:
- Track token usage across development sessions
- Log activities and file changes
- Maintain a history of all sessions in `session-data.json`
- **Automatically updates when working with Claude Code** (configured in CLAUDE.md)

## Quick Start

### Automated Tracking (When Using Claude Code)

If you're using Claude Code to develop this extension, session tracking is **automatic**!

The `CLAUDE.md` file instructs Claude Code to update `session-data.json` after every tool call. You'll see updates like:
```
✓ Session updated
```

The extension reads this file every 5 minutes and displays token usage in the status bar.

### Manual Tracking

You can also manually update the session data:

```javascript
const { SessionTracker } = require('./src/sessionTracker');
const tracker = new SessionTracker();

// Update token usage (from Claude Code's <system_warning>)
await tracker.updateTokens(43746, 200000);

// Add activity
await tracker.addActivity('Added proactive activity monitoring');

// Add file changes
await tracker.addFileChanges(['extension.js', 'CHANGELOG.md']);
```

### Using Node REPL

Quick way to update from command line:

```bash
node
```

Then in the REPL:
```javascript
const { SessionTracker } = require('./src/sessionTracker');
const tracker = new SessionTracker();

// Update tokens
await tracker.updateTokens(43746, 200000);

// View current session
await tracker.getCurrentSession();

// Get summary
await tracker.getSummary();
```

### Starting a New Session

```javascript
const { SessionTracker } = require('./src/sessionTracker');
const tracker = new SessionTracker();

// Start new session
await tracker.startSession('Implementing feature X');

// Work on your code...

// Update periodically
await tracker.updateTokens(25000, 200000);
await tracker.addActivity('Created new component');
await tracker.addFileChanges('src/newComponent.js');

// End session when done
await tracker.endSession();
```

## Session Data Structure

The `session-data.json` file contains:

```json
{
  "sessions": [
    {
      "sessionId": "session-2025-10-21-001",
      "startTime": "2025-10-21T08:00:00Z",
      "endTime": "2025-10-21T09:30:00Z",
      "description": "Feature implementation",
      "tokenUsage": {
        "current": 45000,
        "limit": 200000,
        "remaining": 155000,
        "lastUpdate": "2025-10-21T09:30:00Z"
      },
      "activities": [
        "Created session tracker",
        "Updated documentation"
      ],
      "fileChanges": [
        "extension.js",
        "README.md"
      ]
    }
  ],
  "totals": {
    "totalSessions": 1,
    "totalTokensUsed": 45000,
    "lastSessionDate": "2025-10-21T08:00:00Z"
  }
}
```

## Finding Token Usage

Look for the `<system_warning>` messages in Claude Code:

```
<system_warning>Token usage: 43746/200000; 156254 remaining</system_warning>
```

- **Current tokens**: 43746
- **Token limit**: 200000
- **Remaining**: 156254

## Tips

1. **Update after major milestones** - Don't need to update after every single change
2. **End sessions** - Call `endSession()` when you finish a work session
3. **Start new sessions** - Use `startSession()` for distinct features/tasks
4. **Git-friendly** - `session-data.json` is in `.gitignore` by default

## Example Workflow

1. Start your coding session:
   ```bash
   node -e "const {SessionTracker}=require('./src/sessionTracker');new SessionTracker().startSession('Add feature Y').then(()=>console.log('Session started'))"
   ```

2. Work with Claude Code on your feature...

3. Periodically check token usage in Claude Code and update:
   ```bash
   node -e "const {SessionTracker}=require('./src/sessionTracker');new SessionTracker().updateTokens(50000).then(()=>console.log('Updated'))"
   ```

4. End session when done:
   ```bash
   node -e "const {SessionTracker}=require('./src/sessionTracker');new SessionTracker().endSession().then(()=>console.log('Session ended'))"
   ```

## Viewing Session History

```bash
# Pretty print the session data
node -e "const fs=require('fs');console.log(JSON.stringify(JSON.parse(fs.readFileSync('./session-data.json')),null,2))"
```

Or just open `session-data.json` in VS Code!
