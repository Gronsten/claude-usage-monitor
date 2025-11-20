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
        this.maxDataPoints = 48; // Keep last 48 data points (4 hours at 5-min intervals)
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
     * Generate Braille sparkline from data points (two-line cohesive graph)
     * @param {Array<number>} values - Array of numeric values (0-100)
     * @returns {Object} Object with topLine and bottomLine strings
     */
    generateBrailleSparkline(values) {
        if (!values || values.length === 0) {
            const emptyLength = 24;
            return {
                topLine: '⠀'.repeat(emptyLength),
                bottomLine: '⠀'.repeat(emptyLength)
            };
        }

        // Braille vertical bar patterns (each represents height 0-8 in that line)
        // Bottom line (dots 1-8): bottom half of graph (0-50%)
        const bottomPatterns = ['⠀', '⠁', '⠃', '⠇', '⡇', '⡗', '⡷', '⡿', '⣿'];

        // Top line (dots 1-8): top half of graph (50-100%)
        const topPatterns = ['⠀', '⢀', '⢠', '⢰', '⢸', '⣀', '⣠', '⣰', '⣸'];

        const topLine = [];
        const bottomLine = [];

        values.forEach(value => {
            // Clamp value to 0-100
            const clampedValue = Math.max(0, Math.min(100, value));

            // Map to 0-16 range (8 levels in each line)
            const totalHeight = (clampedValue / 100) * 16;

            if (totalHeight <= 8) {
                // Only bottom line shows (0-50%)
                const bottomIndex = Math.floor(totalHeight);
                topLine.push('⠀');  // Empty
                bottomLine.push(bottomPatterns[bottomIndex]);
            } else {
                // Both lines show (50-100%)
                bottomLine.push('⣿');  // Full bottom
                const topHeight = totalHeight - 8;
                const topIndex = Math.floor(topHeight);
                topLine.push(topPatterns[topIndex]);
            }
        });

        return {
            topLine: topLine.join(''),
            bottomLine: bottomLine.join('')
        };
    }

    /**
     * Generate ASCII sparkline from data points (legacy single-line)
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
     * Get sparkline for 5-hour usage history showing actual usage activity
     * @param {number} count - Number of sparkline characters to generate
     * @param {number} aggregateSize - Number of data points to average per character (default 2 for 10-min intervals)
     * @param {boolean} useBraille - Use two-line Braille sparkline (default true)
     * @returns {Promise<string|Object>} String for single-line, Object with topLine/bottomLine for Braille
     */
    async getFiveHourSparkline(count = 24, aggregateSize = 2, useBraille = true) {
        const totalPointsNeeded = count * aggregateSize;
        const dataPoints = await this.getRecentDataPoints(totalPointsNeeded);

        if (dataPoints.length === 0) {
            if (useBraille) {
                return {
                    topLine: '⠀'.repeat(count),
                    bottomLine: '⠀'.repeat(count)
                };
            }
            return '▁'.repeat(count); // Not enough data yet
        }

        // Calculate deltas (change in usage between consecutive points)
        // This shows actual activity rather than cumulative percentage
        const deltas = [];
        for (let i = 1; i < dataPoints.length; i++) {
            const delta = dataPoints[i].fiveHour - dataPoints[i - 1].fiveHour;
            deltas.push(Math.max(0, delta)); // Only show positive deltas (actual usage)
        }

        // Aggregate deltas by summing pairs (or groups) to get usage per time period
        const aggregatedValues = [];
        for (let i = 0; i < deltas.length; i += aggregateSize) {
            const chunk = deltas.slice(i, i + aggregateSize);
            const sum = chunk.reduce((total, delta) => total + delta, 0);
            aggregatedValues.push(sum);
        }

        // Normalize to 0-100 range for display
        const maxDelta = Math.max(...aggregatedValues, 1); // Avoid divide by zero
        const normalizedValues = aggregatedValues.map(v => (v / maxDelta) * 100);

        if (useBraille) {
            return this.generateBrailleSparkline(normalizedValues);
        }
        return this.generateSparkline(normalizedValues);
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
