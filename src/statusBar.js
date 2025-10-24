const vscode = require('vscode');
const { calculateResetClockTime } = require('./utils');

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
 * @param {Object} usageData - Optional Claude.ai usage data (may be null if web scraping fails)
 * @param {number} usageData.usagePercent
 * @param {string} usageData.resetTime
 * @param {Date} usageData.timestamp
 * @param {Object} activityStats - Optional activity monitor stats
 * @param {Object} sessionData - Optional session token usage data
 */
function updateStatusBar(item, usageData, activityStats = null, sessionData = null) {
    // If neither usageData nor sessionData is available, show default message
    if (!usageData && !sessionData) {
        item.text = '$(cloud) Claude Usage';
        item.tooltip = 'Click to fetch Claude usage data';
        return;
    }

    // Calculate token percentage if session data available
    const tokenPercent = (sessionData && sessionData.tokenUsage)
        ? Math.round((sessionData.tokenUsage.current / sessionData.tokenUsage.limit) * 100)
        : null;

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
    } else if (usageData) {
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
    } else if (tokenPercent !== null) {
        // Use token percentage for icon/color if Claude.ai data unavailable
        if (tokenPercent >= 90) {
            icon = '$(error)';
            color = new vscode.ThemeColor('errorForeground');
        } else if (tokenPercent >= 80) {
            icon = '$(warning)';
            color = new vscode.ThemeColor('editorWarning.foreground');
        } else {
            icon = '$(check)';
            color = new vscode.ThemeColor('testing.iconPassed');
        }
    }

    // Build status bar text - show what's available
    let statusText = icon;
    const statusParts = [];

    if (usageData) {
        statusParts.push(`Claude: ${usageData.usagePercent}%`);
    }

    if (tokenPercent !== null) {
        statusParts.push(`Tokens: ~${tokenPercent}%`);
    }

    statusText += ' ' + statusParts.join(' | ');

    item.text = statusText;
    item.color = color;

    // Create detailed tooltip
    const tooltipLines = [];

    // Add Claude.ai usage if available
    if (usageData) {
        const resetClockTime = calculateResetClockTime(usageData.resetTime);
        tooltipLines.push(`**Claude.ai Usage: ${usageData.usagePercent}%**`);
        tooltipLines.push(`Resets in: ${usageData.resetTime} (${resetClockTime})`);
        tooltipLines.push(`Last updated: ${usageData.timestamp.toLocaleTimeString()}`);
    } else {
        // If web scraping failed, show a message
        tooltipLines.push('**Claude.ai Usage: Unavailable**');
        tooltipLines.push('(Web scraping failed - check connection)');
    }

    // Add session token usage if available
    if (sessionData && sessionData.tokenUsage) {
        tooltipLines.push('');
        tooltipLines.push(`**Session Tokens: \\~${sessionData.tokenUsage.current.toLocaleString()} / ${sessionData.tokenUsage.limit.toLocaleString()} (\\~${tokenPercent}%)**`);
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

    // Get version from package.json
    const packageJson = require('../package.json');
    const version = packageJson.version;

    // Add footer with click instruction and version
    tooltipLines.push(`Click to refresh | v${version}`);

    // Use MarkdownString for bold formatting
    const markdown = new vscode.MarkdownString(tooltipLines.join('  \n'));
    item.tooltip = markdown;
}

module.exports = {
    createStatusBarItem,
    updateStatusBar
};
