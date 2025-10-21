/**
 * Calculates activity level based on Claude.ai usage and session token usage
 * to show how much "Claude time" remains
 */
class ActivityMonitor {
    constructor() {
        // No state needed - we calculate on-demand from usage data
    }

    /**
     * Start monitoring - kept for backwards compatibility but does nothing now
     * @param {vscode.ExtensionContext} context
     */
    startMonitoring(context) {
        // No longer needed - we calculate from usage data instead
    }

    /**
     * Get current activity level based on Claude usage
     * @param {Object} usageData - Claude.ai usage data
     * @param {Object} sessionData - Session token data
     * @returns {'heavy'|'moderate'|'light'|'idle'}
     */
    getActivityLevel(usageData = null, sessionData = null) {
        // Calculate percentages
        const claudePercent = usageData ? usageData.usagePercent : 0;

        let tokenPercent = 0;
        if (sessionData && sessionData.tokenUsage) {
            tokenPercent = Math.round((sessionData.tokenUsage.current / sessionData.tokenUsage.limit) * 100);
        }

        // Use the HIGHER of the two percentages (most urgent)
        const maxPercent = Math.max(claudePercent, tokenPercent);

        // Determine activity level based on max usage
        if (maxPercent >= 80) {
            return 'heavy';      // 80-100% - Getting critical!
        } else if (maxPercent >= 50) {
            return 'moderate';   // 50-79% - Halfway there
        } else if (maxPercent >= 25) {
            return 'light';      // 25-49% - Quarter used
        } else {
            return 'idle';       // 0-24% - Plenty left
        }
    }

    /**
     * Get activity statistics for display
     * @param {Object} usageData - Claude.ai usage data
     * @param {Object} sessionData - Session token data
     * @returns {object}
     */
    getStats(usageData = null, sessionData = null) {
        const claudePercent = usageData ? usageData.usagePercent : 0;

        let tokenPercent = 0;
        if (sessionData && sessionData.tokenUsage) {
            tokenPercent = Math.round((sessionData.tokenUsage.current / sessionData.tokenUsage.limit) * 100);
        }

        const maxPercent = Math.max(claudePercent, tokenPercent);
        const level = this.getActivityLevel(usageData, sessionData);

        return {
            level: level,
            claudePercent: claudePercent,
            tokenPercent: tokenPercent,
            maxPercent: maxPercent,
            description: this.getActivityDescription(level, claudePercent, tokenPercent)
        };
    }

    /**
     * Get human-readable description of activity level
     * @param {string} level
     * @param {number} claudePercent
     * @param {number} tokenPercent
     * @returns {string}
     */
    getActivityDescription(level, claudePercent, tokenPercent) {
        const descriptions = {
            'heavy': 'Running low!',
            'moderate': 'Much work, many thought',
            'light': 'Quarter+ used',
            'idle': 'Plenty of Claude time!'
        };

        return descriptions[level] || 'Unknown';
    }
}

module.exports = { ActivityMonitor };
