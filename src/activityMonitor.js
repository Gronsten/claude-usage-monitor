/**
 * Calculates a pace-based usage level: is usage outpacing the time left in the
 * current 5-hour Claude.ai window?
 */
const { parseResetMinutes } = require('./utils');

const WINDOW_MINUTES = 5 * 60;   // Claude.ai usage window length
const MIN_ELAPSED_MINUTES = 15;  // Before this, a projection is too noisy to trust
const HIGH_PROJECTION = 100;     // Projected % at reset: over this you hit the limit before reset
const MEDIUM_PROJECTION = 70;    // Projected % at reset: on track to use most of it

class ActivityMonitor {
    /**
     * Start monitoring - kept for backwards compatibility but does nothing now
     * @param {vscode.ExtensionContext} context
     */
    startMonitoring(context) {
        // No longer needed - we calculate from usage data instead
    }

    /**
     * Compute pace statistics from the scraped usage and reset time.
     * Session token data is intentionally ignored (token tracking is deprecated).
     * @param {Object} usageData - Claude.ai usage data ({usagePercent, resetTime})
     * @returns {{level: 'high'|'medium'|'low', pace: number|null, projectedPercent: number|null,
     *            minutesToLimit: number|null, tooEarly: boolean, usagePercent: number}}
     */
    calculatePace(usageData) {
        const usagePercent = usageData ? usageData.usagePercent : 0;
        const result = {
            level: 'low', pace: null, projectedPercent: null,
            minutesToLimit: null, tooEarly: false, usagePercent
        };

        if (usagePercent >= 100) {
            result.level = 'high';
            return result;
        }

        const remaining = usageData ? parseResetMinutes(usageData.resetTime) : null;
        if (remaining === null || remaining > WINDOW_MINUTES) {
            // No usable reset time: fall back to absolute thresholds
            result.level = usagePercent >= 80 ? 'high' : usagePercent >= 50 ? 'medium' : 'low';
            return result;
        }

        const elapsed = WINDOW_MINUTES - remaining;
        if (elapsed < MIN_ELAPSED_MINUTES) {
            result.tooEarly = true;
            return result;
        }

        const rate = usagePercent / elapsed; // % per minute
        result.pace = usagePercent / ((elapsed / WINDOW_MINUTES) * 100);
        result.projectedPercent = Math.round(rate * WINDOW_MINUTES);

        if (result.projectedPercent > HIGH_PROJECTION) {
            result.level = 'high';
            result.minutesToLimit = rate > 0 ? Math.round((100 - usagePercent) / rate) : null;
        } else if (result.projectedPercent >= MEDIUM_PROJECTION) {
            result.level = 'medium';
        }
        return result;
    }

    /**
     * Get current pace-based level
     * @param {Object} usageData - Claude.ai usage data
     * @returns {'high'|'medium'|'low'}
     */
    getActivityLevel(usageData = null) {
        return this.calculatePace(usageData).level;
    }

    /**
     * Get activity statistics for display
     * @param {Object} usageData - Claude.ai usage data
     * @param {Object} sessionData - Ignored (kept for call-site compatibility)
     * @returns {object}
     */
    getStats(usageData = null, sessionData = null) {
        const pace = this.calculatePace(usageData);
        return {
            ...pace,
            maxPercent: pace.usagePercent,
            description: this.getActivityDescription(pace)
        };
    }

    /**
     * Human-readable explanation of the level
     * @param {Object} pace - Result of calculatePace
     * @returns {string}
     */
    getActivityDescription(pace) {
        if (pace.tooEarly) {
            return 'Too early in the window to project pace';
        }
        if (pace.projectedPercent === null) {
            return pace.level === 'high' ? 'Limit reached or nearly so' : 'Pace unavailable (no reset time)';
        }
        if (pace.level === 'high') {
            let when = '';
            if (pace.minutesToLimit !== null) {
                const h = Math.floor(pace.minutesToLimit / 60);
                const m = pace.minutesToLimit % 60;
                when = `, limit in ~${h > 0 ? h + 'h ' : ''}${m}m at this rate`;
            }
            return `Outpacing the window: projected ${pace.projectedPercent}% by reset${when}`;
        }
        if (pace.level === 'medium') {
            return `On track to use most of it: projected ${pace.projectedPercent}% by reset`;
        }
        return `Room to spare: projected ${pace.projectedPercent}% by reset`;
    }
}

module.exports = { ActivityMonitor };
