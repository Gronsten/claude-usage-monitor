/**
 * Utility functions shared across the extension
 */

/**
 * Parse a relative reset time like "2h 30m", "45m" or "1d 4h" into minutes.
 * @param {string} resetTime
 * @returns {number|null} Minutes, or null if unparseable (e.g. "Unknown")
 */
function parseResetMinutes(resetTime) {
    if (!resetTime) return null;
    const days = resetTime.match(/(\d+)\s*d/);
    const hours = resetTime.match(/(\d+)\s*h/);
    const minutes = resetTime.match(/(\d+)\s*m/);
    if (!days && !hours && !minutes) return null;
    return (days ? parseInt(days[1]) * 1440 : 0) +
        (hours ? parseInt(hours[1]) * 60 : 0) +
        (minutes ? parseInt(minutes[1]) : 0);
}

/**
 * Calculate the actual clock time when reset will occur
 * @param {string} resetTime - Relative time like "2h 30m" or "45m"
 * @returns {string} Clock time in 24-hour format like "14:30"
 */
function calculateResetClockTime(resetTime) {
    try {
        const totalMinutes = parseResetMinutes(resetTime) || 0;

        // Calculate future time
        const now = new Date();
        const resetDate = new Date(now.getTime() + totalMinutes * 60 * 1000);

        // Format as 24-hour time
        const hour = resetDate.getHours().toString().padStart(2, '0');
        const minute = resetDate.getMinutes().toString().padStart(2, '0');

        return `${hour}:${minute}`;
    } catch (error) {
        return '??:??';
    }
}

module.exports = {
    parseResetMinutes,
    calculateResetClockTime
};
