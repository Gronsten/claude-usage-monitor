# Assets Directory

## Creating demo.gif

To create a demo GIF for the README:

1. **Recording Tools:**
   - Windows: Use [ScreenToGif](https://www.screentogif.com/) (free, open-source)
   - Alternative: [LICEcap](https://www.cockos.com/licecap/) (cross-platform)
   - VS Code specific: [GIF Recorder](https://marketplace.visualstudio.com/items?itemName=idered.gif-recorder) extension

2. **What to Record:**
   - Fresh VS Code start showing auto-fetch on startup
   - Status bar showing usage percentages
   - Hover tooltip with detailed information
   - Click to manually refresh
   - Open tree view panel from activity bar
   - Show color changes at different usage levels
   - Keep recording under 30 seconds for optimal file size

3. **Recording Settings:**
   - Frame rate: 10-15 FPS (sufficient for UI demos)
   - Resolution: 800px width minimum (readable on GitHub)
   - Duration: 20-30 seconds (keeps file size manageable)
   - File size target: Under 5MB for GitHub

4. **Save the file:**
   - Save as `demo.gif` in this directory
   - GitHub automatically displays it in the README

## Tips for Great Demo GIFs

- Use a clean VS Code theme (Dark+ or Light+ for consistency)
- Zoom in on the status bar and tree view for visibility
- Move cursor deliberately (not too fast)
- Show 2-3 key features in sequence
- Add brief pauses between actions (1-2 seconds)
- Demonstrate the color-coded warnings (green → orange → red)
- Optimize GIF size with tools like [gifsicle](https://www.lcdf.org/gifsicle/)

## Demo Sequence Suggestion

1. Show VS Code startup (2 sec)
2. Status bar appears with usage (2 sec)
3. Hover over status bar for tooltip (3 sec)
4. Click status bar to refresh (3 sec)
5. Open activity bar panel (2 sec)
6. Show detailed usage info in panel (3 sec)
7. Navigate through tree view items (3 sec)
