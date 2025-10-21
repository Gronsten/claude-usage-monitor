const fs = require('fs').promises;
const path = require('path');

/**
 * Simple session tracker for Claude Code development sessions
 * Tracks token usage and activities in session-data.json
 */
class SessionTracker {
    constructor(sessionFilePath) {
        this.sessionFilePath = sessionFilePath || path.join(__dirname, '..', 'session-data.json');
        this.currentSession = null;
    }

    /**
     * Load existing session data from file
     * @returns {Promise<Object>}
     */
    async loadData() {
        try {
            const content = await fs.readFile(this.sessionFilePath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            // File doesn't exist or is invalid, return empty structure
            return {
                sessions: [],
                totals: {
                    totalSessions: 0,
                    totalTokensUsed: 0,
                    lastSessionDate: null
                }
            };
        }
    }

    /**
     * Save session data to file
     * @param {Object} data
     */
    async saveData(data) {
        await fs.writeFile(this.sessionFilePath, JSON.stringify(data, null, 2), 'utf8');
    }

    /**
     * Start a new session
     * @param {string} description - Brief description of what you're working on
     * @returns {Promise<Object>} The new session object
     */
    async startSession(description = 'Development session') {
        const data = await this.loadData();

        const sessionNumber = String(data.sessions.length + 1).padStart(3, '0');
        const date = new Date().toISOString().split('T')[0];

        this.currentSession = {
            sessionId: `session-${date}-${sessionNumber}`,
            startTime: new Date().toISOString(),
            description: description,
            tokenUsage: {
                current: 0,
                limit: 200000,
                remaining: 200000,
                lastUpdate: new Date().toISOString()
            },
            activities: [],
            fileChanges: []
        };

        data.sessions.push(this.currentSession);
        data.totals.totalSessions = data.sessions.length;
        data.totals.lastSessionDate = this.currentSession.startTime;

        await this.saveData(data);
        return this.currentSession;
    }

    /**
     * Update token usage for current session
     * @param {number} tokensUsed - Current token count
     * @param {number} tokenLimit - Token limit (default 200000)
     */
    async updateTokens(tokensUsed, tokenLimit = 200000) {
        const data = await this.loadData();

        // Find current session (last one if currentSession not set)
        const session = this.currentSession || data.sessions[data.sessions.length - 1];
        if (!session) {
            console.warn('No active session to update');
            return;
        }

        session.tokenUsage.current = tokensUsed;
        session.tokenUsage.limit = tokenLimit;
        session.tokenUsage.remaining = tokenLimit - tokensUsed;
        session.tokenUsage.lastUpdate = new Date().toISOString();

        // Update totals
        data.totals.totalTokensUsed = data.sessions.reduce(
            (sum, s) => sum + (s.tokenUsage.current || 0),
            0
        );

        await this.saveData(data);
    }

    /**
     * Add an activity to current session
     * @param {string} activity - Description of activity
     */
    async addActivity(activity) {
        const data = await this.loadData();
        const session = this.currentSession || data.sessions[data.sessions.length - 1];

        if (!session) {
            console.warn('No active session to add activity to');
            return;
        }

        if (!session.activities.includes(activity)) {
            session.activities.push(activity);
            await this.saveData(data);
        }
    }

    /**
     * Add file changes to current session
     * @param {string|string[]} files - File(s) changed
     */
    async addFileChanges(files) {
        const data = await this.loadData();
        const session = this.currentSession || data.sessions[data.sessions.length - 1];

        if (!session) {
            console.warn('No active session to add file changes to');
            return;
        }

        const fileArray = Array.isArray(files) ? files : [files];

        for (const file of fileArray) {
            if (!session.fileChanges.includes(file)) {
                session.fileChanges.push(file);
            }
        }

        await this.saveData(data);
    }

    /**
     * End current session
     */
    async endSession() {
        const data = await this.loadData();
        const session = this.currentSession || data.sessions[data.sessions.length - 1];

        if (!session) {
            console.warn('No active session to end');
            return;
        }

        session.endTime = new Date().toISOString();
        await this.saveData(data);
        this.currentSession = null;
    }

    /**
     * Get current session info
     * @returns {Promise<Object|null>}
     */
    async getCurrentSession() {
        if (this.currentSession) {
            return this.currentSession;
        }

        const data = await this.loadData();
        return data.sessions.length > 0 ? data.sessions[data.sessions.length - 1] : null;
    }

    /**
     * Get summary statistics
     * @returns {Promise<Object>}
     */
    async getSummary() {
        const data = await this.loadData();
        return {
            totalSessions: data.sessions.length,
            totalTokens: data.totals.totalTokensUsed,
            averageTokensPerSession: data.sessions.length > 0
                ? Math.round(data.totals.totalTokensUsed / data.sessions.length)
                : 0,
            lastSession: data.sessions.length > 0
                ? data.sessions[data.sessions.length - 1]
                : null
        };
    }

    /**
     * Reset token usage for current session to zero
     * Useful for clearing session data when Claude Code exits
     */
    async resetSessionTokens() {
        const data = await this.loadData();
        const session = this.currentSession || (data.sessions.length > 0 ? data.sessions[data.sessions.length - 1] : null);

        if (!session) {
            console.log('No session to reset');
            return;
        }

        // Reset token usage to zero
        session.tokenUsage.current = 0;
        session.tokenUsage.remaining = session.tokenUsage.limit;
        session.tokenUsage.lastUpdate = new Date().toISOString();

        await this.saveData(data);
        console.log(`Session tokens reset for: ${session.sessionId}`);
    }
}

module.exports = { SessionTracker };
