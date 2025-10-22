const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');
const fs = require('fs');
const vscode = require('vscode');

class ClaudeUsageScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.sessionDir = path.join(os.homedir(), '.claude-browser-session');
        this.isInitialized = false;
        this.debugPort = 9222; // Chrome remote debugging port
        this.isConnectedBrowser = false; // Track if we connected vs launched
    }

    /**
     * Helper function to wait/sleep (replacement for deprecated page.waitForTimeout)
     * @param {number} ms - Milliseconds to wait
     * @returns {Promise<void>}
     */
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Find Chrome executable on the system
     * @returns {string|null} Path to Chrome executable or null
     */
    findChrome() {
        const possiblePaths = [];

        if (process.platform === 'win32') {
            possiblePaths.push(
                // Google Chrome locations
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
                // Scoop package manager
                'C:\\AppInstall\\scoop\\apps\\googlechrome\\current\\chrome.exe',
                // Microsoft Edge (Chromium-based)
                'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
                'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
            );
        } else if (process.platform === 'darwin') {
            possiblePaths.push(
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
            );
        } else {
            possiblePaths.push(
                '/usr/bin/google-chrome',
                '/usr/bin/chromium-browser',
                '/usr/bin/chromium'
            );
        }

        // Find first existing path
        for (const chromePath of possiblePaths) {
            try {
                if (fs.existsSync(chromePath)) {
                    console.log(`Found Chrome at: ${chromePath}`);
                    return chromePath;
                }
            } catch (err) {
                // Continue to next path
            }
        }

        console.log('Chrome not found in common locations, will use Puppeteer default');
        return null;
    }

    /**
     * Try to connect to an existing browser instance
     * @returns {Promise<boolean>} True if connected successfully
     */
    async tryConnectToExisting() {
        try {
            const browserURL = `http://127.0.0.1:${this.debugPort}`;
            this.browser = await puppeteer.connect({
                browserURL,
                defaultViewport: null // Use the browser's viewport
            });

            // Get existing pages or create a new one
            const pages = await this.browser.pages();
            if (pages.length > 0) {
                // Try to find a page that's already on Claude
                for (const page of pages) {
                    const url = page.url();
                    if (url.includes('claude.ai')) {
                        this.page = page;
                        break;
                    }
                }

                // If no Claude page found, use the first page
                if (!this.page) {
                    this.page = pages[0];
                }
            } else {
                // Create a new page if none exist
                this.page = await this.browser.newPage();
            }

            // Set a realistic user agent
            await this.page.setUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            );

            this.isInitialized = true;
            this.isConnectedBrowser = true; // Mark as connected (not launched)
            console.log('Successfully connected to existing browser');
            return true;
        } catch (error) {
            console.log('Could not connect to existing browser:', error.message);
            return false;
        }
    }

    /**
     * Check if session is logged in by looking for session files
     * @returns {boolean} True if likely logged in
     */
    hasExistingSession() {
        try {
            // Check if session directory exists and has cookie files
            if (!fs.existsSync(this.sessionDir)) {
                return false;
            }

            // Look for Chrome's cookie files in the session directory
            const cookieFiles = [
                path.join(this.sessionDir, 'Default', 'Cookies'),
                path.join(this.sessionDir, 'Default', 'Network', 'Cookies')
            ];

            for (const cookieFile of cookieFiles) {
                if (fs.existsSync(cookieFile)) {
                    const stats = fs.statSync(cookieFile);
                    // If cookie file exists and has content, likely logged in
                    if (stats.size > 0) {
                        return true;
                    }
                }
            }

            return false;
        } catch (error) {
            console.log('Error checking session:', error);
            return false;
        }
    }

    /**
     * Initialize the Puppeteer browser instance
     * @param {boolean} forceHeaded - Force browser to show (for login)
     */
    async initialize(forceHeaded = false) {
        // Check if browser is still connected
        if (this.isInitialized && this.browser) {
            try {
                // Test if browser is still alive
                await this.browser.version();
                return; // Browser is still running, reuse it
            } catch (error) {
                // Browser was closed, reset state
                this.browser = null;
                this.page = null;
                this.isInitialized = false;
            }
        }

        // First, try to connect to an existing browser instance
        const connected = await this.tryConnectToExisting();
        if (connected) {
            return; // Successfully connected to existing browser
        }

        // No existing browser found, launch a new one
        const config = vscode.workspace.getConfiguration('claudeUsage');
        const userHeadless = config.get('headless', true);

        // Use headless mode unless forced to show or user disabled headless
        const headless = forceHeaded ? false : userHeadless;

        try {
            // Try to find Chrome executable path
            const executablePath = this.findChrome();

            const launchOptions = {
                headless: headless ? 'new' : false,
                userDataDir: this.sessionDir,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    `--remote-debugging-port=${this.debugPort}` // Enable remote debugging
                ],
                defaultViewport: {
                    width: 1280,
                    height: 800
                }
            };

            // Add executablePath if found
            if (executablePath) {
                launchOptions.executablePath = executablePath;
            }

            console.log(`Launching new browser with remote debugging on port ${this.debugPort}`);
            this.browser = await puppeteer.launch(launchOptions);

            this.page = await this.browser.newPage();

            // Set a realistic user agent to avoid detection
            await this.page.setUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
            );

            this.isInitialized = true;
            this.isConnectedBrowser = false; // Mark as launched (not connected)
            console.log('Successfully launched new browser');
        } catch (error) {
            // If browser is already running error, provide helpful message
            if (error.message.includes('already running')) {
                throw new Error('Browser session is locked by another process. Please close all Chrome/Edge windows and try again, or restart VSCode.');
            }
            throw new Error(`Failed to launch browser: ${error.message}. Make sure Chromium is installed.`);
        }
    }

    /**
     * Ensure user is logged into Claude.ai
     * Will wait for manual login if necessary
     */
    async ensureLoggedIn() {
        try {
            // Navigate directly to settings/usage page
            await this.page.goto('https://claude.ai/settings/usage', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Wait a moment for any redirects
            await this.sleep(2000);

            const currentUrl = this.page.url();

            // If URL contains 'login' or 'auth', user needs to log in
            if (currentUrl.includes('login') || currentUrl.includes('auth')) {
                vscode.window.showInformationMessage(
                    'Please log in to Claude.ai in the browser window. The extension will continue once you are logged in.',
                    { modal: false }
                );

                // Wait for navigation away from login page (max 5 minutes)
                try {
                    await this.page.waitForFunction(
                        () => {
                            const url = window.location.href;
                            return !url.includes('login') && !url.includes('auth');
                        },
                        { timeout: 300000 } // 5 minutes
                    );

                    vscode.window.showInformationMessage('Login successful! Session saved for future use.');
                } catch (timeoutError) {
                    throw new Error('Login timeout. Please try again and complete the login process.');
                }
            }
        } catch (error) {
            if (error.message.includes('timeout')) {
                throw new Error('Failed to load Claude.ai. Please check your internet connection.');
            }
            throw error;
        }
    }

    /**
     * Fetch usage data from Claude.ai settings/usage page
     * @returns {Promise<{usagePercent: number, resetTime: string, timestamp: Date}>}
     */
    async fetchUsageData() {
        try {
            // Navigate directly to the usage page
            await this.page.goto('https://claude.ai/settings/usage', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Wait for page to load and render content
            await this.sleep(2000);

            // Extract text content and parse usage data
            const data = await this.page.evaluate(() => {
                const bodyText = document.body.innerText;

                // Extract usage percentage
                const usageMatch = bodyText.match(/(\d+)%\s*used/i);
                const usagePercent = usageMatch ? parseInt(usageMatch[1], 10) : null;

                // Extract reset time
                const resetMatch = bodyText.match(/Resets?\s+in\s+([^\n]+)/i);
                const resetTime = resetMatch ? resetMatch[1].trim() : null;

                return {
                    usagePercent,
                    resetTime,
                    bodyText: bodyText.substring(0, 500) // For debugging
                };
            });

            if (data.usagePercent === null) {
                throw new Error('Could not find usage percentage on settings page. The page layout may have changed.');
            }

            return {
                usagePercent: data.usagePercent,
                resetTime: data.resetTime || 'Unknown',
                timestamp: new Date()
            };

        } catch (error) {
            if (error.message.includes('timeout')) {
                throw new Error('Usage page took too long to load. Please try again.');
            }
            throw error;
        }
    }

    /**
     * Close/disconnect from the browser instance
     * Only closes the browser if we launched it; disconnects if we connected to existing
     */
    async close() {
        if (this.browser) {
            if (this.isConnectedBrowser) {
                // We connected to an existing browser, just disconnect
                await this.browser.disconnect();
                console.log('Disconnected from shared browser');
            } else {
                // We launched this browser, close it completely
                await this.browser.close();
                console.log('Closed browser instance');
            }
            this.browser = null;
            this.page = null;
            this.isInitialized = false;
            this.isConnectedBrowser = false;
        }
    }
}

module.exports = { ClaudeUsageScraper };
