/**
 * Utility functions shared across the extension
 */

/**
 * Calculate the actual clock time when reset will occur
 * For short times (< 24h): returns time like "14:30"
 * For longer times (>= 24h): returns day and time like "Mon 14:30"
 * @param {string} resetTime - Relative time like "2h 30m" or "5d 21h"
 * @returns {string} Clock time with optional day
 */
function calculateResetClockTime(resetTime) {
    try {
        // Parse the reset time string (e.g., "2h 30m", "45m", "5d 21h")
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

        // Format time
        const hour = resetDate.getHours().toString().padStart(2, '0');
        const minute = resetDate.getMinutes().toString().padStart(2, '0');
        const timeStr = `${hour}:${minute}`;

        // If reset is more than 24 hours away, include the day
        if (totalMinutes >= 24 * 60) {
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const dayName = dayNames[resetDate.getDay()];
            const date = resetDate.getDate();
            return `${dayName} ${date} ${timeStr}`;
        }

        return timeStr;
    } catch (error) {
        return '??:??';
    }
}

module.exports = {
    calculateResetClockTime
};
