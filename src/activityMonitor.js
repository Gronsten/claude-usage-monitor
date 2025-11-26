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
        // Thresholds raised for Claude Code heavy usage patterns
        if (maxPercent >= 90) {
            return 'heavy';      // 90-100% - Critical, running out!
        } else if (maxPercent >= 75) {
            return 'moderate';   // 75-89% - Getting low
        } else {
            return 'idle';       // 0-74% - Normal usage
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
     * @returns {object} { short, quirky }
     */
    getActivityDescription(level, claudePercent, tokenPercent) {
        const descriptions = {
            'heavy': {
                short: 'Running low!',
                quirky: 'Claude needs a coffee break soon ☕'
            },
            'moderate': {
                short: 'Getting low',
                quirky: 'Pace yourself, human 🐢'
            },
            'idle': {
                short: 'Normal usage',
                quirky: 'Plenty of Claude time remaining 🚀'
            }
        };

        return descriptions[level] || { short: '', quirky: '' };
    }
}

module.exports = { ActivityMonitor };
