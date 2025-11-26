const vscode = require('vscode');
const { calculateResetClockTime } = require('./utils');

/**
 * Get currency symbol for a currency code
 * @param {string} currency - ISO 4217 currency code
 * @returns {string} Currency symbol
 */
function getCurrencySymbol(currency) {
    const symbols = {
        USD: '$', AUD: '$', CAD: '$', EUR: '€', GBP: '£',
        JPY: '¥', CNY: '¥', KRW: '₩', INR: '₹', BRL: 'R$',
        MXN: '$', CHF: 'CHF ', SEK: 'kr', NOK: 'kr', DKK: 'kr',
        NZD: '$', SGD: '$', HKD: '$',
    };
    return symbols[currency] || '';
}

// Braille spinner frames
const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIndex = 0;
let spinnerInterval = null;

// Store references to all status bar items
let statusBarItems = {
    label: null,      // "Claude" label
    session: null,    // 5hr session usage
    weekly: null,     // 7d weekly usage
    sonnet: null,     // Sonnet weekly (optional)
    opus: null,       // Opus weekly (optional, Max plans only)
    tokens: null,     // Token usage
    credits: null     // Monthly credits (extra usage)
};

// Cache last displayed values to avoid unnecessary updates
let lastDisplayedValues = {
    sessionText: null,
    weeklyText: null,
    sonnetText: null,
    opusText: null,
    tokensText: null,
    creditsText: null
};

/**
 * Create and configure multiple status bar items
 * @param {vscode.ExtensionContext} context
 * @returns {object} Object containing all status bar items
 */
function createStatusBarItem(context) {
    // Priority determines order (higher priority = further RIGHT for Right-aligned items)
    // Left-to-right order: Claude | 20%@13:03 (session) | 7d | S% | O% | $X/Y% | Tk
    // Session (5hr) ALWAYS first after Claude, Tokens ALWAYS last
    // Using high base priority (1000) with small decrements to keep items together
    // and avoid other extensions inserting between our items
    const basePriority = 1000;

    // Label item (leftmost = highest priority)
    statusBarItems.label = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        basePriority
    );
    statusBarItems.label.command = 'claude-usage.fetchNow';
    statusBarItems.label.text = 'Claude  ';  // Space placeholder for spinner
    statusBarItems.label.show();
    context.subscriptions.push(statusBarItems.label);

    // Session (5hr) usage
    statusBarItems.session = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        basePriority - 1
    );
    statusBarItems.session.command = 'claude-usage.fetchNow';
    context.subscriptions.push(statusBarItems.session);

    // Weekly (7d) usage
    statusBarItems.weekly = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        basePriority - 2
    );
    statusBarItems.weekly.command = 'claude-usage.fetchNow';
    context.subscriptions.push(statusBarItems.weekly);

    // Sonnet weekly usage (optional)
    statusBarItems.sonnet = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        basePriority - 3
    );
    statusBarItems.sonnet.command = 'claude-usage.fetchNow';
    context.subscriptions.push(statusBarItems.sonnet);

    // Opus weekly usage (optional, Max plans only)
    statusBarItems.opus = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        basePriority - 4
    );
    statusBarItems.opus.command = 'claude-usage.fetchNow';
    context.subscriptions.push(statusBarItems.opus);

    // Extra usage / credits
    statusBarItems.credits = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        basePriority - 5
    );
    statusBarItems.credits.command = 'claude-usage.fetchNow';
    context.subscriptions.push(statusBarItems.credits);

    // Token usage (rightmost = lowest priority, always at end)
    statusBarItems.tokens = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        basePriority - 6
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
    const showCredits = config.get('statusBar.showCredits', false);
    const warningThreshold = config.get('thresholds.warning', 75);
    const errorThreshold = config.get('thresholds.error', 90);

    // Track which items should be visible (updated in place to avoid flicker)
    let sessionVisible = false;
    let weeklyVisible = false;
    let sonnetVisible = false;
    let opusVisible = false;
    let tokensVisible = false;
    let creditsVisible = false;

    // If no data at all, show default and hide all metric items
    if (!usageData && !sessionData) {
        statusBarItems.label.text = 'Claude  ';  // Space placeholder for spinner
        statusBarItems.label.tooltip = 'Click to fetch Claude usage data';
        statusBarItems.label.color = undefined;
        // Hide all items at end
        statusBarItems.session.hide();
        statusBarItems.weekly.hide();
        statusBarItems.sonnet.hide();
        statusBarItems.opus.hide();
        statusBarItems.tokens.hide();
        statusBarItems.credits.hide();
        return;
    }

    // Reset label
    statusBarItems.label.text = 'Claude  ';  // Space placeholder for spinner
    statusBarItems.label.color = undefined;

    // Build shared tooltip
    const tooltipLines = [];

    // --- Session (5hr) usage ---
    let newSessionText = null;
    let newSessionColor = undefined;
    if (usageData) {
        const resetClockTime = calculateResetClockTime(usageData.resetTime);
        const { icon, color } = getIconAndColor(usageData.usagePercent, warningThreshold, errorThreshold);

        if (showSession) {
            newSessionText = `${icon ? icon + ' ' : ''}${usageData.usagePercent}%@${resetClockTime}`;
            newSessionColor = color;
            sessionVisible = true;
        }

        // Tooltip (always show)
        tooltipLines.push('**Session**');
        tooltipLines.push(`5hr limit: ${usageData.usagePercent}% (resets at ${resetClockTime})`);
    }

    // --- Token usage ---
    let newTokensText = null;
    let newTokensColor = undefined;
    if (showTokens) {
        if (sessionData && sessionData.tokenUsage) {
            const tokenPercent = Math.round(
                (sessionData.tokenUsage.current / sessionData.tokenUsage.limit) * 100
            );
            const { icon, color } = getIconAndColor(tokenPercent, warningThreshold, errorThreshold);

            newTokensText = `${icon ? icon + ' ' : ''}Tk ${tokenPercent}%`;
            newTokensColor = color;
            tokensVisible = true;

            // Tooltip (always show)
            if (tooltipLines.length > 0 && !tooltipLines[tooltipLines.length - 1].startsWith('**Session')) {
                tooltipLines.push('');
            }
            tooltipLines.push(`Tokens: ${sessionData.tokenUsage.current.toLocaleString()} / ${sessionData.tokenUsage.limit.toLocaleString()} (${tokenPercent}%)`);
        } else {
            // Show placeholder when no token data
            newTokensText = 'Tk -';
            newTokensColor = undefined;
            tokensVisible = true;
        }
    }

    // --- Weekly (7d) usage ---
    let newWeeklyText = null;
    let newWeeklyColor = undefined;
    if (usageData && usageData.usagePercentWeek !== undefined) {
        const weekResetClock = calculateResetClockTime(usageData.resetTimeWeek);
        const { icon, color } = getIconAndColor(usageData.usagePercentWeek, warningThreshold, errorThreshold);

        if (showWeekly) {
            newWeeklyText = `${icon ? icon + ' ' : ''}7d ${usageData.usagePercentWeek}%`;
            newWeeklyColor = color;
            weeklyVisible = true;
        }

        // Tooltip (always show)
        tooltipLines.push('');
        tooltipLines.push('**Weekly**');
        tooltipLines.push(`All models: ${usageData.usagePercentWeek}% (resets at ${weekResetClock})`);
    }

    // --- Sonnet weekly ---
    let newSonnetText = null;
    let newSonnetColor = undefined;
    if (usageData && usageData.usagePercentSonnet !== null && usageData.usagePercentSonnet !== undefined) {
        const { icon, color } = getIconAndColor(usageData.usagePercentSonnet, warningThreshold, errorThreshold);

        if (showSonnet) {
            newSonnetText = `${icon ? icon + ' ' : ''}${usageData.usagePercentSonnet}%S`;
            newSonnetColor = color;
            sonnetVisible = true;
        }

        // Tooltip (always show)
        if (!tooltipLines.some(l => l === '**Weekly**')) {
            tooltipLines.push('');
            tooltipLines.push('**Weekly**');
        }
        tooltipLines.push(`Sonnet: ${usageData.usagePercentSonnet}%`);
    }

    // --- Opus weekly ---
    let newOpusText = null;
    let newOpusColor = undefined;
    if (usageData && usageData.usagePercentOpus !== null && usageData.usagePercentOpus !== undefined) {
        const { icon, color } = getIconAndColor(usageData.usagePercentOpus, warningThreshold, errorThreshold);

        if (showOpus) {
            newOpusText = `${icon ? icon + ' ' : ''}${usageData.usagePercentOpus}%O`;
            newOpusColor = color;
            opusVisible = true;
        }

        // Tooltip (always show)
        if (!tooltipLines.some(l => l === '**Weekly**')) {
            tooltipLines.push('');
            tooltipLines.push('**Weekly**');
        }
        tooltipLines.push(`Opus: ${usageData.usagePercentOpus}%`);
    }

    // --- Monthly Credits (Extra Usage) ---
    let newCreditsText = null;
    let newCreditsColor = undefined;
    if (usageData && usageData.monthlyCredits) {
        const credits = usageData.monthlyCredits;
        const remaining = credits.limit - credits.used;
        const { icon, color } = getIconAndColor(credits.percent, warningThreshold, errorThreshold);
        const currencySymbol = getCurrencySymbol(credits.currency);

        if (showCredits) {
            // Show dollar amount and percentage (e.g., "$63/63%")
            const usedDisplay = credits.used >= 1000
                ? `${(credits.used / 1000).toFixed(1)}K`
                : Math.round(credits.used);
            newCreditsText = `${icon ? icon + ' ' : ''}${currencySymbol}${usedDisplay}/${credits.percent}%`;
            newCreditsColor = color;
            creditsVisible = true;
        }

        // Tooltip (always show) - format with currency symbol
        const usedFormatted = `${currencySymbol}${credits.used.toLocaleString()}`;
        const limitFormatted = `${currencySymbol}${credits.limit.toLocaleString()}`;
        const remainingFormatted = `${currencySymbol}${remaining.toLocaleString()}`;

        tooltipLines.push('');
        tooltipLines.push('**Extra Usage**');
        tooltipLines.push(`Used: ${usedFormatted} / ${limitFormatted} ${credits.currency} (${credits.percent}%)`);
        tooltipLines.push(`Remaining: ${remainingFormatted} ${credits.currency}`);
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

    // Apply tooltip to all items (tooltip changes don't cause flicker)
    const markdown = new vscode.MarkdownString(tooltipLines.join('  \n'));
    statusBarItems.label.tooltip = markdown;
    statusBarItems.session.tooltip = markdown;
    statusBarItems.weekly.tooltip = markdown;
    statusBarItems.sonnet.tooltip = markdown;
    statusBarItems.opus.tooltip = markdown;
    statusBarItems.tokens.tooltip = markdown;
    statusBarItems.credits.tooltip = markdown;

    // Only update status bar items if values actually changed (prevents flicker)
    if (newSessionText !== lastDisplayedValues.sessionText) {
        if (sessionVisible) {
            statusBarItems.session.text = newSessionText;
            statusBarItems.session.color = newSessionColor;
            statusBarItems.session.show();
        } else {
            statusBarItems.session.hide();
        }
        lastDisplayedValues.sessionText = newSessionText;
    }

    if (newWeeklyText !== lastDisplayedValues.weeklyText) {
        if (weeklyVisible) {
            statusBarItems.weekly.text = newWeeklyText;
            statusBarItems.weekly.color = newWeeklyColor;
            statusBarItems.weekly.show();
        } else {
            statusBarItems.weekly.hide();
        }
        lastDisplayedValues.weeklyText = newWeeklyText;
    }

    if (newSonnetText !== lastDisplayedValues.sonnetText) {
        if (sonnetVisible) {
            statusBarItems.sonnet.text = newSonnetText;
            statusBarItems.sonnet.color = newSonnetColor;
            statusBarItems.sonnet.show();
        } else {
            statusBarItems.sonnet.hide();
        }
        lastDisplayedValues.sonnetText = newSonnetText;
    }

    if (newOpusText !== lastDisplayedValues.opusText) {
        if (opusVisible) {
            statusBarItems.opus.text = newOpusText;
            statusBarItems.opus.color = newOpusColor;
            statusBarItems.opus.show();
        } else {
            statusBarItems.opus.hide();
        }
        lastDisplayedValues.opusText = newOpusText;
    }

    if (newTokensText !== lastDisplayedValues.tokensText) {
        if (tokensVisible) {
            statusBarItems.tokens.text = newTokensText;
            statusBarItems.tokens.color = newTokensColor;
            statusBarItems.tokens.show();
        } else {
            statusBarItems.tokens.hide();
        }
        lastDisplayedValues.tokensText = newTokensText;
    }

    if (newCreditsText !== lastDisplayedValues.creditsText) {
        if (creditsVisible) {
            statusBarItems.credits.text = newCreditsText;
            statusBarItems.credits.color = newCreditsColor;
            statusBarItems.credits.show();
        } else {
            statusBarItems.credits.hide();
        }
        lastDisplayedValues.creditsText = newCreditsText;
    }
}

/**
 * Start the loading spinner animation on the Claude label
 */
function startSpinner() {
    if (spinnerInterval) return; // Already running

    spinnerIndex = 0;
    spinnerInterval = setInterval(() => {
        if (statusBarItems.label) {
            statusBarItems.label.text = `Claude ${spinnerFrames[spinnerIndex]}`;
        }
        spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
    }, 80); // Fast smooth animation
}

/**
 * Stop the loading spinner and restore the Claude label
 * Shows warning symbol (⚠) in yellow if web scrape failed but tokens work
 * Shows error symbol (✗) in red if both web scrape AND tokens failed
 * @param {Error} [webError] - Optional web scrape error
 * @param {Error} [tokenError] - Optional token fetch error
 */
function stopSpinner(webError = null, tokenError = null) {
    if (spinnerInterval) {
        clearInterval(spinnerInterval);
        spinnerInterval = null;
    }
    if (statusBarItems.label) {
        if (webError && tokenError) {
            // Complete failure - both web scrape and tokens failed (RED)
            statusBarItems.label.text = 'Claude ✗';
            statusBarItems.label.color = new vscode.ThemeColor('errorForeground');

            const errorLines = [
                '**Complete Fetch Failed**',
                '',
                `Web: ${webError.message}`,
                `Tokens: ${tokenError.message}`,
                '',
                '**Debug Info**',
                `Time: ${new Date().toLocaleString()}`,
                '',
                '**Actions**',
                '• Click to retry',
                '• Run "Claude: Show Debug Output" for details',
                '• Run "Claude: Reset Browser Connection" to reconnect'
            ];
            statusBarItems.label.tooltip = new vscode.MarkdownString(errorLines.join('  \n'));
        } else if (webError) {
            // Partial failure - web scrape failed but tokens may work (YELLOW)
            statusBarItems.label.text = 'Claude ⚠';
            statusBarItems.label.color = new vscode.ThemeColor('editorWarning.foreground');

            const errorLines = [
                '**Web Fetch Failed**',
                '',
                `Error: ${webError.message}`,
                '',
                '**Debug Info**',
                `Time: ${new Date().toLocaleString()}`,
                '',
                'Token data may still be available',
                '',
                '**Actions**',
                '• Click to retry',
                '• Run "Claude: Show Debug Output" for details',
                '• Run "Claude: Reset Browser Connection" to reconnect'
            ];
            statusBarItems.label.tooltip = new vscode.MarkdownString(errorLines.join('  \n'));
        } else {
            // Normal state - space placeholder keeps width consistent with spinner
            statusBarItems.label.text = 'Claude  ';
            statusBarItems.label.color = undefined;
        }
    }
}

module.exports = {
    createStatusBarItem,
    updateStatusBar,
    startSpinner,
    stopSpinner
};
