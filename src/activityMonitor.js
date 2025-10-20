const vscode = require('vscode');

/**
 * Monitors VS Code activity to determine coding intensity
 * and recommend appropriate refresh intervals
 */
class ActivityMonitor {
    constructor() {
        this.editCount = 0;
        this.fileChangeCount = 0;
        this.lastActivityTime = Date.now();
        this.activityWindow = 15 * 60 * 1000; // 15 minute window
        this.listeners = [];
    }

    /**
     * Start monitoring VS Code activity
     * @param {vscode.ExtensionContext} context
     */
    startMonitoring(context) {
        // Monitor text document changes (typing)
        const textChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
            if (event.contentChanges.length > 0) {
                this.editCount++;
                this.lastActivityTime = Date.now();
            }
        });

        // Monitor file saves
        const fileSaveListener = vscode.workspace.onDidSaveTextDocument(() => {
            this.fileChangeCount++;
            this.lastActivityTime = Date.now();
        });

        // Monitor active editor changes
        const editorChangeListener = vscode.window.onDidChangeActiveTextEditor(() => {
            this.lastActivityTime = Date.now();
        });

        context.subscriptions.push(textChangeListener);
        context.subscriptions.push(fileSaveListener);
        context.subscriptions.push(editorChangeListener);

        // Reset counters periodically (every 15 minutes)
        const resetInterval = setInterval(() => {
            this.resetCounters();
        }, this.activityWindow);

        context.subscriptions.push({
            dispose: () => clearInterval(resetInterval)
        });
    }

    /**
     * Reset activity counters
     */
    resetCounters() {
        this.editCount = 0;
        this.fileChangeCount = 0;
    }

    /**
     * Get current activity level
     * @returns {'heavy'|'moderate'|'light'|'idle'}
     */
    getActivityLevel() {
        const timeSinceLastActivity = Date.now() - this.lastActivityTime;

        // If no activity in last 30 minutes, consider idle
        if (timeSinceLastActivity > 30 * 60 * 1000) {
            return 'idle';
        }

        // Heavy: More than 100 edits in 15 minutes (active coding)
        if (this.editCount > 100) {
            return 'heavy';
        }

        // Moderate: 30-100 edits in 15 minutes
        if (this.editCount > 30) {
            return 'moderate';
        }

        // Light: 1-30 edits in 15 minutes
        if (this.editCount > 0) {
            return 'light';
        }

        // Idle: No edits but recent activity
        return 'idle';
    }

    /**
     * Get recommended refresh interval in minutes based on activity
     * @returns {number} Minutes between refreshes
     */
    getRecommendedRefreshInterval() {
        const level = this.getActivityLevel();

        switch (level) {
            case 'heavy':
                return 5;  // Every 5 minutes when actively coding
            case 'moderate':
                return 15; // Every 15 minutes for moderate activity
            case 'light':
                return 30; // Every 30 minutes for light activity
            case 'idle':
            default:
                return 60; // Every 60 minutes when idle
        }
    }

    /**
     * Get activity statistics for display
     * @returns {object}
     */
    getStats() {
        return {
            level: this.getActivityLevel(),
            editCount: this.editCount,
            fileChangeCount: this.fileChangeCount,
            recommendedInterval: this.getRecommendedRefreshInterval(),
            timeSinceLastActivity: Math.floor((Date.now() - this.lastActivityTime) / 1000)
        };
    }
}

module.exports = { ActivityMonitor };
