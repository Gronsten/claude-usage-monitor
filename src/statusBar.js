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
 * @param {Object} activityStats - Optional activity monitor stats
 * @param {Object} sessionData - Optional session token usage data
 */
function updateStatusBar(item, usageData, activityStats = null, sessionData = null) {
    if (!usageData) {
        item.text = '$(cloud) Claude Usage';
        item.tooltip = 'Click to fetch Claude usage data';
        return;
    }

    // Choose icon and color based on activity level (max usage)
    let icon = '$(check)';
    let color = undefined;

    if (activityStats) {
        // Use activity level which is based on max(claudePercent, tokenPercent)
        switch (activityStats.level) {
            case 'heavy':
                icon = '$(error)';
                color = new vscode.ThemeColor('errorForeground');
                break;
            case 'moderate':
                icon = '$(warning)';
                color = new vscode.ThemeColor('editorWarning.foreground');
                break;
            case 'light':
                icon = '$(info)';
                color = new vscode.ThemeColor('editorInfo.foreground');
                break;
            case 'idle':
            default:
                icon = '$(check)';
                color = new vscode.ThemeColor('testing.iconPassed');
                break;
        }
    } else {
        // Fallback to Claude.ai usage if no activity stats available
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
    }

    // Build status bar text with both usage percentages
    let statusText = `${icon} Claude: ${usageData.usagePercent}%`;

    if (sessionData && sessionData.tokenUsage) {
        const tokenPercent = Math.round((sessionData.tokenUsage.current / sessionData.tokenUsage.limit) * 100);
        statusText += ` | Tokens: ${tokenPercent}%`;
    }

    item.text = statusText;
    item.color = color;

    // Create detailed tooltip
    const tooltipLines = [
        `Claude.ai Usage: ${usageData.usagePercent}%`,
        `Resets in: ${usageData.resetTime}`,
        `Last updated: ${usageData.timestamp.toLocaleTimeString()}`
    ];

    // Add session token usage if available
    if (sessionData && sessionData.tokenUsage) {
        const tokenPercent = Math.round((sessionData.tokenUsage.current / sessionData.tokenUsage.limit) * 100);
        tooltipLines.push('');
        tooltipLines.push(`Session Tokens: ${sessionData.tokenUsage.current.toLocaleString()} / ${sessionData.tokenUsage.limit.toLocaleString()} (${tokenPercent}%)`);
        tooltipLines.push(`Session: ${sessionData.sessionId}`);
    }

    // Add activity level info if available
    if (activityStats) {
        const levelLabel = activityStats.level.charAt(0).toUpperCase() + activityStats.level.slice(1);
        tooltipLines.push('');
        tooltipLines.push(`Usage Level: ${levelLabel} (${activityStats.maxPercent}%)`);
        tooltipLines.push(`${activityStats.description}`);
    }

    tooltipLines.push('');
    tooltipLines.push('Click to refresh');

    item.tooltip = tooltipLines.join('\n');
}

module.exports = {
    createStatusBarItem,
    updateStatusBar
};
