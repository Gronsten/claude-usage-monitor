# Screenshots for Claude Usage Monitor

This folder contains screenshots for the VS Code Marketplace listing and README documentation.

## Required Screenshots

### 1. status-bar.png
**What to capture:**
- VS Code status bar (bottom of screen) showing the Claude usage indicator
- Should show the dual usage display (e.g., "Claude: 45% | Tokens: 26%")
- Include color-coded icon (green/orange/red based on usage)

**How to capture:**
1. Open VS Code with the extension installed
2. Wait for usage data to load
3. Screenshot just the status bar area at the bottom
4. Crop to focus on the Claude usage item

---

### 2. tree-view.png
**What to capture:**
- Activity bar with Claude Usage icon highlighted
- Tree view panel showing detailed usage information
- Should display both 5-hour and 7-day usage metrics
- Include reset times and last update timestamp

**How to capture:**
1. Click the Claude Usage icon in the Activity Bar (left sidebar)
2. Ensure the tree view panel is fully expanded
3. Screenshot the entire panel showing all usage details
4. Crop to show just the Claude Usage panel

---

### 3. tooltip.png
**What to capture:**
- Status bar with tooltip/hover popup visible
- Tooltip should show detailed usage information
- Include usage percentage, reset time, and usage level

**How to capture:**
1. Hover over the Claude usage status bar item
2. Wait for tooltip to appear
3. Screenshot the status bar with tooltip visible
4. Crop to include both status bar and full tooltip

---

### 4. settings.png (Optional)
**What to capture:**
- VS Code Settings UI showing Claude Usage configuration options
- Should display all three settings:
  - claudeUsage.fetchOnStartup
  - claudeUsage.headless
  - claudeUsage.autoRefreshMinutes

**How to capture:**
1. Open Settings (Ctrl+,)
2. Search for "Claude Usage"
3. Screenshot the settings panel showing all configuration options
4. Crop to focus on the Claude Usage settings section

---

## Screenshot Guidelines

- **Format**: PNG (preferred for UI screenshots)
- **Size**: Keep under 1MB each
- **Resolution**: Use standard screen resolution (1920x1080 or similar)
- **Cropping**: Crop tightly to relevant UI elements, remove unnecessary whitespace
- **Theme**: Use VS Code dark theme for consistency (or capture both light/dark)
- **Clean State**: Close unnecessary panels, hide distracting elements

## File Naming Convention

- Use lowercase with hyphens
- Be descriptive: `status-bar.png`, `tree-view.png`, `tooltip.png`
- Avoid spaces in filenames

## Once Screenshots Are Ready

After adding screenshots to this folder:
1. Update main README.md to reference them
2. Bump version to 2.3.8
3. Update CHANGELOG.md
4. Repackage and republish to VS Code Marketplace
