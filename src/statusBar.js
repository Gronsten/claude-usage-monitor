const vscode = require('vscode');
const { calculateResetClockTime } = require('./utils');

// Store references to all status bar items
let statusBarItems = {
    label: null,      // "Claude" label
    session: null,    // 5hr session usage
    weekly: null,     // 7d weekly usage
    sonnet: null,     // Sonnet weekly (optional)
    opus: null,       // Opus weekly (optional, Max plans only)
    tokens: null      // Token usage
};

/**
 * Create and configure multiple status bar items
 * @param {vscode.ExtensionContext} context
 * @returns {object} Object containing all status bar items
 */
function createStatusBarItem(context) {
    // Priority determines order (higher priority = further RIGHT for Right-aligned items)
    // We want left-to-right reading order: Claude | session | weekly | sonnet | opus | tokens
    // So leftmost items need HIGHEST priority, rightmost need LOWEST
    const basePriority = 100;

    // Label item (leftmost = highest priority)
    statusBarItems.label = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        basePriority + 5
    );
    statusBarItems.label.command = 'claude-usage.fetchNow';
    statusBarItems.label.text = 'Claude';
    statusBarItems.label.show();
    context.subscriptions.push(statusBarItems.label);

    // Session (5hr) usage
    statusBarItems.session = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        basePriority + 4
    );
    statusBarItems.session.command = 'claude-usage.fetchNow';
    context.subscriptions.push(statusBarItems.session);

    // Weekly (7d) usage
    statusBarItems.weekly = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        basePriority + 3
    );
    statusBarItems.weekly.command = 'claude-usage.fetchNow';
    context.subscriptions.push(statusBarItems.weekly);

    // Sonnet weekly usage (optional)
    statusBarItems.sonnet = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        basePriority + 2
    );
    statusBarItems.sonnet.command = 'claude-usage.fetchNow';
    context.subscriptions.push(statusBarItems.sonnet);

    // Opus weekly usage (optional, Max plans only)
    statusBarItems.opus = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        basePriority + 1
    );
    statusBarItems.opus.command = 'claude-usage.fetchNow';
    context.subscriptions.push(statusBarItems.opus);

    // Token usage (rightmost = lowest priority)
    statusBarItems.tokens = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        basePriority
    );
    statusBarItems.tokens.command = 'claude-usage.fetchNow';
    context.subscriptions.push(statusBarItems.tokens);

    // Return the label item for backwards compatibility
    return statusBarItems.label;
}

/**
 * Get icon and color for a percentage value based on configurable thresholds
 * @param {number} percent - The percentage value
 * @param {number} warningThreshold - Threshold for warning (default 75)
 * @param {number} errorThreshold - Threshold for error (default 90)
 * @returns {object} { icon, color }
 */
function getIconAndColor(percent, warningThreshold = 75, errorThreshold = 90) {
    if (percent >= errorThreshold) {
        return {
            icon: '$(error)',
            color: new vscode.ThemeColor('errorForeground')
        };
    } else if (percent >= warningThreshold) {
        return {
            icon: '$(warning)',
            color: new vscode.ThemeColor('editorWarning.foreground')
        };
    }
    return { icon: '', color: undefined };
}

/**
 * Update the status bar with usage data
 * @param {vscode.StatusBarItem} item - The main status bar item (for backwards compat)
 * @param {Object} usageData - Optional Claude.ai usage data
 * @param {Object} activityStats - Optional activity monitor stats
 * @param {Object} sessionData - Optional session token usage data
 */
function updateStatusBar(item, usageData, activityStats = null, sessionData = null) {
    // Get settings
    const config = vscode.workspace.getConfiguration('claudeUsage');
    const showSession = config.get('statusBar.showSession', true);
    const showWeekly = config.get('statusBar.showWeekly', true);
    const showSonnet = config.get('statusBar.showSonnet', false);
    const showOpus = config.get('statusBar.showOpus', false);
    const showTokens = config.get('statusBar.showTokens', true);
    const warningThreshold = config.get('thresholds.warning', 75);
    const errorThreshold = config.get('thresholds.error', 90);

    // Hide all items first
    statusBarItems.session.hide();
    statusBarItems.weekly.hide();
    statusBarItems.sonnet.hide();
    statusBarItems.opus.hide();
    statusBarItems.tokens.hide();

    // If no data at all, show default
    if (!usageData && !sessionData) {
        statusBarItems.label.text = 'Claude --';
        statusBarItems.label.tooltip = 'Click to fetch Claude usage data';
        statusBarItems.label.color = undefined;
        return;
    }

    // Reset label
    statusBarItems.label.text = 'Claude';
    statusBarItems.label.color = undefined;

    // Build shared tooltip
    const tooltipLines = [];

    // --- Session (5hr) usage ---
    if (usageData) {
        const resetClockTime = calculateResetClockTime(usageData.resetTime);
        const { icon, color } = getIconAndColor(usageData.usagePercent, warningThreshold, errorThreshold);

        if (showSession) {
            statusBarItems.session.text = `${icon ? icon + ' ' : ''}${usageData.usagePercent}%@${resetClockTime}`;
            statusBarItems.session.color = color;
            statusBarItems.session.show();
        }

        // Tooltip (always show)
        tooltipLines.push('**Session**');
        tooltipLines.push(`5hr limit: ${usageData.usagePercent}% (resets ${resetClockTime})`);
    }

    // --- Token usage ---
    if (sessionData && sessionData.tokenUsage) {
        const tokenPercent = Math.round(
            (sessionData.tokenUsage.current / sessionData.tokenUsage.limit) * 100
        );
        const { icon, color } = getIconAndColor(tokenPercent, warningThreshold, errorThreshold);

        if (showTokens) {
            statusBarItems.tokens.text = `${icon ? icon + ' ' : ''}Tk ${tokenPercent}%`;
            statusBarItems.tokens.color = color;
            statusBarItems.tokens.show();
        }

        // Tooltip (always show)
        if (tooltipLines.length > 0 && !tooltipLines[tooltipLines.length - 1].startsWith('**Session')) {
            tooltipLines.push('');
        }
        tooltipLines.push(`Tokens: ${sessionData.tokenUsage.current.toLocaleString()} / ${sessionData.tokenUsage.limit.toLocaleString()} (${tokenPercent}%)`);
    }

    // --- Weekly (7d) usage ---
    if (usageData && usageData.usagePercentWeek !== undefined) {
        const weekResetClock = calculateResetClockTime(usageData.resetTimeWeek);
        const { icon, color } = getIconAndColor(usageData.usagePercentWeek, warningThreshold, errorThreshold);

        if (showWeekly) {
            statusBarItems.weekly.text = `${icon ? icon + ' ' : ''}7d ${usageData.usagePercentWeek}%`;
            statusBarItems.weekly.color = color;
            statusBarItems.weekly.show();
        }

        // Tooltip (always show)
        tooltipLines.push('');
        tooltipLines.push('**Weekly**');
        tooltipLines.push(`All models: ${usageData.usagePercentWeek}% (resets ${weekResetClock})`);
    }

    // --- Sonnet weekly ---
    if (usageData && usageData.usagePercentSonnet !== null && usageData.usagePercentSonnet !== undefined) {
        const { icon, color } = getIconAndColor(usageData.usagePercentSonnet, warningThreshold, errorThreshold);

        if (showSonnet) {
            statusBarItems.sonnet.text = `${icon ? icon + ' ' : ''}${usageData.usagePercentSonnet}%S`;
            statusBarItems.sonnet.color = color;
            statusBarItems.sonnet.show();
        }

        // Tooltip (always show)
        if (!tooltipLines.some(l => l === '**Weekly**')) {
            tooltipLines.push('');
            tooltipLines.push('**Weekly**');
        }
        tooltipLines.push(`Sonnet: ${usageData.usagePercentSonnet}%`);
    }

    // --- Opus weekly ---
    if (usageData && usageData.usagePercentOpus !== null && usageData.usagePercentOpus !== undefined) {
        const { icon, color } = getIconAndColor(usageData.usagePercentOpus, warningThreshold, errorThreshold);

        if (showOpus) {
            statusBarItems.opus.text = `${icon ? icon + ' ' : ''}${usageData.usagePercentOpus}%O`;
            statusBarItems.opus.color = color;
            statusBarItems.opus.show();
        }

        // Tooltip (always show)
        if (!tooltipLines.some(l => l === '**Weekly**')) {
            tooltipLines.push('');
            tooltipLines.push('**Weekly**');
        }
        tooltipLines.push(`Opus: ${usageData.usagePercentOpus}%`);
    }

    // --- Activity Status (quirky description) ---
    if (activityStats && activityStats.description) {
        tooltipLines.push('');
        tooltipLines.push(`*${activityStats.description.quirky}*`);
    }

    // --- Footer ---
    tooltipLines.push('');
    if (usageData) {
        tooltipLines.push(`Updated: ${usageData.timestamp.toLocaleTimeString()}`);
    }
    tooltipLines.push('Click to refresh');

    // Apply tooltip to all visible items
    const markdown = new vscode.MarkdownString(tooltipLines.join('  \n'));
    statusBarItems.label.tooltip = markdown;
    statusBarItems.session.tooltip = markdown;
    statusBarItems.weekly.tooltip = markdown;
    statusBarItems.sonnet.tooltip = markdown;
    statusBarItems.opus.tooltip = markdown;
    statusBarItems.tokens.tooltip = markdown;
}

module.exports = {
    createStatusBarItem,
    updateStatusBar
};
