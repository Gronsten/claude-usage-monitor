/**
 * Utility functions shared across the extension
 */

/**
 * Calculate the actual clock time when reset will occur
 * @param {string} resetTime - Relative time like "2h 30m" or "45m"
 * @returns {string} Clock time in 24-hour format like "14:30"
 */
function calculateResetClockTime(resetTime) {
    try {
        // Parse the reset time string (e.g., "2h 30m", "45m", "1d 4h")
        const days = resetTime.match(/(\d+)d/);
        const hours = resetTime.match(/(\d+)h/);
        const minutes = resetTime.match(/(\d+)m/);

        let totalMinutes = 0;
        if (days) totalMinutes += parseInt(days[1]) * 24 * 60;
        if (hours) totalMinutes += parseInt(hours[1]) * 60;
        if (minutes) totalMinutes += parseInt(minutes[1]);

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
    calculateResetClockTime
};
