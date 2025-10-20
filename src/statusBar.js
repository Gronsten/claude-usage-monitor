const vscode = require('vscode');

/**
 * Create and configure the status bar item
 * @param {vscode.ExtensionContext} context
 * @returns {vscode.StatusBarItem}
 */
function createStatusBarItem(context) {
    const item = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        100
    );

    item.command = 'claude-usage.fetchNow';
    item.text = '$(cloud) Claude Usage';
    item.tooltip = 'Click to fetch Claude usage data';
    item.show();

    context.subscriptions.push(item);
    return item;
}

/**
 * Update the status bar with usage data
 * @param {vscode.StatusBarItem} item
 * @param {Object} usageData
 * @param {number} usageData.usagePercent
 * @param {string} usageData.resetTime
 * @param {Date} usageData.timestamp
 */
function updateStatusBar(item, usageData) {
    if (!usageData) {
        item.text = '$(cloud) Claude Usage';
        item.tooltip = 'Click to fetch Claude usage data';
        return;
    }

    // Choose icon based on usage level
    let icon = '$(check)';
    let color = undefined;

    if (usageData.usagePercent >= 90) {
        icon = '$(error)';
        color = new vscode.ThemeColor('errorForeground');
    } else if (usageData.usagePercent >= 80) {
        icon = '$(warning)';
        color = new vscode.ThemeColor('editorWarning.foreground');
    } else {
        icon = '$(check)';
        color = new vscode.ThemeColor('testing.iconPassed');
    }

    // Update status bar
    item.text = `${icon} Claude: ${usageData.usagePercent}%`;
    item.color = color;

    // Create detailed tooltip
    const tooltipLines = [
        `Claude Usage: ${usageData.usagePercent}%`,
        `Resets in: ${usageData.resetTime}`,
        `Last updated: ${usageData.timestamp.toLocaleTimeString()}`,
        '',
        'Click to refresh'
    ];

    item.tooltip = tooltipLines.join('\n');
}

module.exports = {
    createStatusBarItem,
    updateStatusBar
};
