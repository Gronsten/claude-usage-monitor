const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * Manages historical usage data for sparkline visualization
 * Stores usage data points with timestamps in OS temp directory
 */
class UsageHistory {
    constructor(historyFilePath) {
        // Store in OS temp directory alongside session-data.json
        this.historyFilePath = historyFilePath || path.join(os.tmpdir(), 'claude-usage-history.json');
        this.maxDataPoints = 24; // Keep last 24 data points (2 hours at 5-min intervals)
    }

    /**
     * Load existing history data from file
     * @returns {Promise<Object>}
     */
    async loadData() {
        try {
            const content = await fs.readFile(this.historyFilePath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            // File doesn't exist or is invalid, return empty structure
            return {
                dataPoints: [],
                lastUpdated: null
            };
        }
    }

    /**
     * Save history data to file
     * @param {Object} data
     */
    async saveData(data) {
        await fs.writeFile(this.historyFilePath, JSON.stringify(data, null, 2), 'utf8');
    }

    /**
     * Add a new data point to history
     * @param {number} fiveHourUsage - 5-hour usage percentage
     */
    async addDataPoint(fiveHourUsage) {
        const data = await this.loadData();

        const dataPoint = {
            timestamp: new Date().toISOString(),
            fiveHour: fiveHourUsage
        };

        // Add new data point
        data.dataPoints.push(dataPoint);

        // Keep only the last N data points
        if (data.dataPoints.length > this.maxDataPoints) {
            data.dataPoints = data.dataPoints.slice(-this.maxDataPoints);
        }

        data.lastUpdated = dataPoint.timestamp;

        await this.saveData(data);
        return dataPoint;
    }

    /**
     * Get recent data points for visualization
     * @param {number} count - Number of recent data points to retrieve
     * @returns {Promise<Array>}
     */
    async getRecentDataPoints(count = 8) {
        const data = await this.loadData();

        if (data.dataPoints.length === 0) {
            return [];
        }

        // Return the last N data points
        return data.dataPoints.slice(-count);
    }

    /**
     * Generate ASCII sparkline from data points
     * @param {Array<number>} values - Array of numeric values (0-100)
     * @returns {string} ASCII sparkline
     */
    generateSparkline(values) {
        if (!values || values.length === 0) {
            return '▁▁▁▁▁▁▁▁'; // Empty sparkline
        }

        // Sparkline characters from lowest to highest
        const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

        // Normalize values to 0-7 range for indexing chars
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min;

        if (range === 0) {
            // All values are the same
            const index = Math.min(Math.floor(values[0] / 12.5), 7);
            return chars[index].repeat(values.length);
        }

        // Map each value to a sparkline character
        return values.map(value => {
            const normalized = (value - min) / range; // 0 to 1
            const index = Math.min(Math.floor(normalized * 7.99), 7); // 0 to 7
            return chars[index];
        }).join('');
    }

    /**
     * Get sparkline for 5-hour usage history
     * @param {number} count - Number of data points to include
     * @returns {Promise<string>}
     */
    async getFiveHourSparkline(count = 8) {
        const dataPoints = await this.getRecentDataPoints(count);

        if (dataPoints.length === 0) {
            return '▁▁▁▁▁▁▁▁'; // Not enough data yet
        }

        const values = dataPoints.map(dp => dp.fiveHour);
        return this.generateSparkline(values);
    }

    /**
     * Clear all historical data
     */
    async clearHistory() {
        await this.saveData({
            dataPoints: [],
            lastUpdated: null
        });
    }
}

module.exports = { UsageHistory };
