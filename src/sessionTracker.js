const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * Simple session tracker for Claude Code development sessions
 * Tracks token usage and activities in session-data.json
 *
 * File is stored in OS temp directory for easy access across extension installations:
 * - Windows: C:\Users\username\AppData\Local\Temp\claude-session-data.json
 * - Mac/Linux: /tmp/claude-session-data.json
 */
class SessionTracker {
    constructor(sessionFilePath) {
        // Store in OS temp directory so it's accessible regardless of where extension is installed
        this.sessionFilePath = sessionFilePath || path.join(os.tmpdir(), 'claude-session-data.json');
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
            }
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
}

module.exports = { SessionTracker };
