/**
 * Cleanup script to remove browser lock files
 * Run this if you get "browser is already running" errors
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const sessionDir = path.join(os.homedir(), '.claude-browser-session');

console.log('Cleaning up browser session...');
console.log(`Session directory: ${sessionDir}`);

// Remove lock files that might be preventing browser from starting
const lockFiles = [
    path.join(sessionDir, 'SingletonLock'),
    path.join(sessionDir, 'SingletonSocket'),
    path.join(sessionDir, 'SingletonCookie'),
    path.join(sessionDir, 'lockfile')
];

let cleaned = 0;
for (const lockFile of lockFiles) {
    try {
        if (fs.existsSync(lockFile)) {
            fs.unlinkSync(lockFile);
            console.log(`✓ Removed: ${path.basename(lockFile)}`);
            cleaned++;
        }
    } catch (error) {
        console.log(`✗ Could not remove ${path.basename(lockFile)}: ${error.message}`);
    }
}

if (cleaned === 0) {
    console.log('No lock files found to clean.');
} else {
    console.log(`\nCleaned ${cleaned} lock file(s). You can now try reloading the extension.`);
}
