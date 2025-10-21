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

This extension tracks Claude session token usage. After tool calls that consume significant tokens, update the session tracking:

```bash
node -e "const {SessionTracker}=require('./src/sessionTracker');new SessionTracker().updateTokens(CURRENT_TOKENS,200000)"
```

Replace `CURRENT_TOKENS` with the actual token count from system warnings.
