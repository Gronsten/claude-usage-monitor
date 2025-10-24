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
        this.apiEndpoint = null; // Captured API endpoint URL
        this.apiHeaders = null; // Captured API request headers
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

            // Set up request interception to capture API calls
            await this.setupRequestInterception();

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

            // Set up request interception to capture API calls
            await this.setupRequestInterception();

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
     * Set up request interception to capture Claude API calls
     */
    async setupRequestInterception() {
        try {
            // Enable request interception
            await this.page.setRequestInterception(true);

            // Listen for API requests
            this.page.on('request', (request) => {
                const url = request.url();

                // Capture the usage API endpoint
                if (url.includes('/api/organizations/') && url.includes('/usage')) {
                    this.apiEndpoint = url;
                    this.apiHeaders = {
                        ...request.headers(),
                        'Content-Type': 'application/json'
                    };
                    console.log('Captured API endpoint:', this.apiEndpoint);
                }

                // Always continue the request
                request.continue();
            });

            console.log('Request interception enabled for API capture');
        } catch (error) {
            console.warn('Failed to set up request interception:', error.message);
            // Don't throw - fall back to HTML scraping
        }
    }

    /**
     * Calculate human-readable reset time from ISO timestamp
     * @param {string} isoTimestamp - ISO 8601 timestamp
     * @returns {string} Human-readable time remaining
     */
    calculateResetTime(isoTimestamp) {
        if (!isoTimestamp) {
            return 'Unknown';
        }

        try {
            const resetDate = new Date(isoTimestamp);
            const now = new Date();
            const diffMs = resetDate - now;

            if (diffMs <= 0) {
                return 'Soon';
            }

            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

            if (hours > 24) {
                const days = Math.floor(hours / 24);
                const remainingHours = hours % 24;
                return `${days}d ${remainingHours}h`;
            } else if (hours > 0) {
                return `${hours}h ${minutes}m`;
            } else {
                return `${minutes}m`;
            }
        } catch (error) {
            console.error('Error calculating reset time:', error);
            return 'Unknown';
        }
    }

    /**
     * Process API response and convert to expected format
     * @param {object} apiResponse - Raw API response
     * @returns {object} Processed usage data
     */
    processApiResponse(apiResponse) {
        try {
            const fiveHoursUsage = apiResponse.five_hour?.utilization || 0;
            const resetsAtFiveHour = apiResponse.five_hour?.resets_at;

            // Use 7-day utilization as the weekly percentage
            const sevenDayUsage = apiResponse.seven_day?.utilization || 0;
            const resetsAt = apiResponse.seven_day?.resets_at;

            return {
                usagePercent: fiveHoursUsage,
                resetTime: this.calculateResetTime(resetsAtFiveHour),
                usagePercentWeek: sevenDayUsage,
                resetTimeWeek: this.calculateResetTime(resetsAt),
                timestamp: new Date(),
                rawData: apiResponse // Keep raw data for future use
            };

        } catch (error) {
            console.error('Error processing API response:', error);
            throw new Error('Failed to process API response data');
        }
    }

    /**
     * Fetch usage data from Claude.ai settings/usage page
     * @returns {Promise<{usagePercent: number, resetTime: string, timestamp: Date}>}
     */
    async fetchUsageData() {
        try {
            // Navigate directly to the usage page to trigger API calls
            await this.page.goto('https://claude.ai/settings/usage', {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            // Wait for page to load and potentially capture API endpoint
            await this.sleep(2000);

            // If we captured the API endpoint, use it directly for faster, more reliable data
            if (this.apiEndpoint && this.apiHeaders) {
                try {
                    console.log('Using captured API endpoint for direct access');

                    // Get cookies from the page context
                    const cookies = await this.page.cookies();
                    const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');

                    // Make direct API call within page context to use browser's auth
                    const response = await this.page.evaluate(async (endpoint, headers, cookieString) => {
                        const response = await fetch(endpoint, {
                            method: 'GET',
                            headers: {
                                ...headers,
                                'Cookie': cookieString
                            }
                        });

                        if (!response.ok) {
                            throw new Error(`API request failed: ${response.status}`);
                        }

                        return await response.json();
                    }, this.apiEndpoint, this.apiHeaders, cookieString);

                    // Process API response and return
                    console.log('Successfully fetched data via API');
                    return this.processApiResponse(response);

                } catch (apiError) {
                    console.log('API call failed, falling back to HTML scraping:', apiError.message);
                    // Fall through to HTML scraping fallback
                }
            }

            // Fallback: Extract text content and parse usage data from HTML
            console.log('Using HTML scraping method');
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
