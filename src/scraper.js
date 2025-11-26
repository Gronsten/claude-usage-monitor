const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');
const fs = require('fs');
const vscode = require('vscode');
const {
    USAGE_API_SCHEMA,
    API_ENDPOINTS,
    extractFromSchema,
    matchesEndpoint,
    processOverageData,
    getSchemaInfo,
} = require('./apiSchema');

// Debug output channel for API responses (lazy creation)
let debugChannel = null;

function getDebugChannel() {
    if (!debugChannel) {
        debugChannel = vscode.window.createOutputChannel('Claude Usage - API Debug');
    }
    return debugChannel;
}

// Track if we're running in development mode (set during activation)
let runningInDevMode = false;

/**
 * Set whether running in development mode
 * @param {boolean} isDev
 */
function setDevMode(isDev) {
    runningInDevMode = isDev;
}

/**
 * Check if debug mode is enabled via settings OR running in development mode
 * @returns {boolean}
 */
function isDebugEnabled() {
    // Check user setting
    const config = vscode.workspace.getConfiguration('claudeUsage');
    const userEnabled = config.get('debug', false);

    return userEnabled || runningInDevMode;
}

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

            // Store all captured API endpoints for debugging
            this.capturedEndpoints = [];

            // Listen for API requests
            this.page.on('request', (request) => {
                const url = request.url();

                // Log ALL API calls to debug channel for discovery (only if debug enabled)
                if (url.includes('/api/')) {
                    if (isDebugEnabled()) {
                        const debugOutput = getDebugChannel();
                        debugOutput.appendLine(`[REQUEST] ${request.method()} ${url}`);
                    }
                    this.capturedEndpoints.push({ method: request.method(), url });
                }

                // Capture endpoints using schema definitions (see apiSchema.js)
                if (matchesEndpoint(url, API_ENDPOINTS.usage)) {
                    this.apiEndpoint = url;
                    this.apiHeaders = {
                        ...request.headers(),
                        'Content-Type': 'application/json'
                    };
                    console.log('Captured usage endpoint:', this.apiEndpoint);
                }

                if (matchesEndpoint(url, API_ENDPOINTS.prepaidCredits)) {
                    this.creditsEndpoint = url;
                    console.log('Captured credits endpoint:', this.creditsEndpoint);
                }

                if (matchesEndpoint(url, API_ENDPOINTS.overageSpendLimit)) {
                    this.overageEndpoint = url;
                    console.log('Captured overage endpoint:', this.overageEndpoint);
                }

                // Always continue the request
                request.continue();
            });

            // Also listen for responses to capture response data (only log if debug enabled)
            this.page.on('response', async (response) => {
                const url = response.url();

                // Log API responses with their data (only if debug enabled)
                if (isDebugEnabled() && url.includes('/api/') && response.status() === 200) {
                    try {
                        const contentType = response.headers()['content-type'] || '';
                        if (contentType.includes('application/json')) {
                            const data = await response.json();
                            const debugOutput = getDebugChannel();
                            debugOutput.appendLine(`[RESPONSE] ${url}`);
                            debugOutput.appendLine(JSON.stringify(data, null, 2));
                            debugOutput.appendLine('---');

                            // Highlight important endpoints
                            if (url.includes('/prepaid/credits')) {
                                debugOutput.appendLine('*** PREPAID CREDITS DATA ABOVE ***');
                            }
                            if (url.includes('/overage_spend_limit')) {
                                debugOutput.appendLine('*** OVERAGE SPEND LIMIT DATA ABOVE ***');
                            }
                        }
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
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
     * Uses schema from apiSchema.js for easy updates when API changes
     *
     * @param {object} apiResponse - Raw API response
     * @param {object} creditsData - Optional prepaid credits data
     * @param {object} overageData - Optional overage spend limit data
     * @returns {object} Processed usage data
     */
    processApiResponse(apiResponse, creditsData = null, overageData = null) {
        try {
            // Extract all fields using schema (see apiSchema.js for field mappings)
            const data = extractFromSchema(apiResponse, USAGE_API_SCHEMA);

            // Process overage data using schema helper
            const monthlyCredits = processOverageData(overageData);

            return {
                // 5-hour session
                usagePercent: data.fiveHour.utilization,
                resetTime: this.calculateResetTime(data.fiveHour.resetsAt),

                // 7-day overall
                usagePercentWeek: data.sevenDay.utilization,
                resetTimeWeek: this.calculateResetTime(data.sevenDay.resetsAt),

                // 7-day per-model (Nov 2025)
                usagePercentSonnet: data.sevenDaySonnet.utilization,
                resetTimeSonnet: this.calculateResetTime(data.sevenDaySonnet.resetsAt),
                usagePercentOpus: data.sevenDayOpus.utilization,
                resetTimeOpus: this.calculateResetTime(data.sevenDayOpus.resetsAt),

                // Extra usage / prepaid credits
                extraUsage: data.extraUsage.value,
                prepaidCredits: creditsData ?? null,
                monthlyCredits: monthlyCredits,

                // Metadata
                timestamp: new Date(),
                rawData: apiResponse,  // Keep raw data for debugging
                schemaVersion: getSchemaInfo().version,  // Track which schema version was used
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
            const debug = isDebugEnabled();
            if (debug) {
                const debugOutput = getDebugChannel();
                debugOutput.appendLine(`\n=== FETCH ATTEMPT (${new Date().toLocaleString()}) ===`);
                debugOutput.appendLine(`API endpoint captured: ${this.apiEndpoint ? 'YES' : 'NO'}`);
                debugOutput.appendLine(`API headers captured: ${this.apiHeaders ? 'YES' : 'NO'}`);
                debugOutput.appendLine(`Credits endpoint captured: ${this.creditsEndpoint ? 'YES' : 'NO'}`);
                debugOutput.appendLine(`Overage endpoint captured: ${this.overageEndpoint ? 'YES' : 'NO'}`);
            }

            if (this.apiEndpoint && this.apiHeaders) {
                try {
                    console.log('Using captured API endpoint for direct access');
                    if (debug) getDebugChannel().appendLine('Attempting direct API fetch...');

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

                    // Log raw API response for debugging (only if debug enabled)
                    if (debug) {
                        const debugOutput = getDebugChannel();
                        debugOutput.appendLine('Direct API fetch SUCCESS!');
                        debugOutput.appendLine(`=== RAW USAGE API RESPONSE ===`);
                        debugOutput.appendLine(JSON.stringify(response, null, 2));
                        debugOutput.appendLine('=== END RAW USAGE API RESPONSE ===');
                    }

                    // Also fetch prepaid credits if endpoint is available
                    let creditsData = null;
                    if (this.creditsEndpoint) {
                        try {
                            creditsData = await this.page.evaluate(async (endpoint, headers, cookieString) => {
                                const resp = await fetch(endpoint, {
                                    method: 'GET',
                                    headers: { ...headers, 'Cookie': cookieString }
                                });
                                if (resp.ok) {
                                    return await resp.json();
                                }
                                return null;
                            }, this.creditsEndpoint, this.apiHeaders, cookieString);

                            if (creditsData && debug) {
                                const debugOutput = getDebugChannel();
                                debugOutput.appendLine('=== PREPAID CREDITS RESPONSE ===');
                                debugOutput.appendLine(JSON.stringify(creditsData, null, 2));
                                debugOutput.appendLine('=== END PREPAID CREDITS RESPONSE ===');
                            }
                        } catch (creditsError) {
                            if (debug) getDebugChannel().appendLine(`Credits fetch error: ${creditsError.message}`);
                        }
                    }

                    // Fetch overage/spend limit data (contains monthly credit usage)
                    let overageData = null;
                    if (this.overageEndpoint) {
                        try {
                            overageData = await this.page.evaluate(async (endpoint, headers, cookieString) => {
                                const resp = await fetch(endpoint, {
                                    method: 'GET',
                                    headers: { ...headers, 'Cookie': cookieString }
                                });
                                if (resp.ok) {
                                    return await resp.json();
                                }
                                return null;
                            }, this.overageEndpoint, this.apiHeaders, cookieString);

                            if (overageData && debug) {
                                const debugOutput = getDebugChannel();
                                debugOutput.appendLine('=== OVERAGE SPEND LIMIT RESPONSE ===');
                                debugOutput.appendLine(JSON.stringify(overageData, null, 2));
                                debugOutput.appendLine('=== END OVERAGE SPEND LIMIT RESPONSE ===');
                            }
                        } catch (overageError) {
                            if (debug) getDebugChannel().appendLine(`Overage fetch error: ${overageError.message}`);
                        }
                    }

                    if (debug) getDebugChannel().appendLine('');

                    // Process API response and return
                    console.log('Successfully fetched data via API');
                    return this.processApiResponse(response, creditsData, overageData);

                } catch (apiError) {
                    console.log('API call failed, falling back to HTML scraping:', apiError.message);
                    if (debug) getDebugChannel().appendLine(`Direct API fetch FAILED: ${apiError.message}`);
                    // Fall through to HTML scraping fallback
                }
            } else {
                if (debug) getDebugChannel().appendLine('Skipping direct API - endpoint or headers not captured yet');
            }

            // Fallback: Extract text content and parse usage data from HTML
            console.log('Using HTML scraping method');
            if (debug) getDebugChannel().appendLine('Falling back to HTML scraping method...');
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

    /**
     * Reset the scraper - close connection and clear all captured endpoints
     * Useful for debugging or recovering from a bad state
     */
    async reset() {
        const debug = isDebugEnabled();
        if (debug) {
            const debugOutput = getDebugChannel();
            debugOutput.appendLine(`\n=== RESET CONNECTION (${new Date().toLocaleString()}) ===`);
        }

        // Close existing connection
        await this.close();

        // Clear captured endpoints
        this.apiEndpoint = null;
        this.apiHeaders = null;
        this.creditsEndpoint = null;
        this.overageEndpoint = null;
        this.capturedEndpoints = [];

        if (debug) {
            const debugOutput = getDebugChannel();
            debugOutput.appendLine('Browser connection closed');
            debugOutput.appendLine('All captured API endpoints cleared');
            debugOutput.appendLine('Ready for fresh connection on next fetch');
        }

        return { success: true, message: 'Connection reset successfully' };
    }

    /**
     * Clear session completely - delete stored browser session data
     * Use this when login fails and you need to start fresh
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async clearSession() {
        const debug = isDebugEnabled();
        if (debug) {
            const debugOutput = getDebugChannel();
            debugOutput.appendLine(`\n=== CLEAR SESSION (${new Date().toLocaleString()}) ===`);
        }

        // First reset the connection
        await this.reset();

        // Then delete the session directory
        try {
            if (fs.existsSync(this.sessionDir)) {
                fs.rmSync(this.sessionDir, { recursive: true, force: true });
                if (debug) {
                    const debugOutput = getDebugChannel();
                    debugOutput.appendLine(`Deleted session directory: ${this.sessionDir}`);
                }
            }
        } catch (error) {
            console.error('Failed to delete session directory:', error);
            if (debug) {
                const debugOutput = getDebugChannel();
                debugOutput.appendLine(`Failed to delete session directory: ${error.message}`);
            }
            return { success: false, message: `Failed to clear session: ${error.message}` };
        }

        if (debug) {
            const debugOutput = getDebugChannel();
            debugOutput.appendLine('Session cleared - next fetch will prompt for fresh login');
        }

        return { success: true, message: 'Session cleared successfully. Next fetch will prompt for login.' };
    }

    /**
     * Get diagnostic information about current state
     * @returns {object} Diagnostic info
     */
    getDiagnostics() {
        const schemaInfo = getSchemaInfo();
        return {
            isInitialized: this.isInitialized,
            isConnectedBrowser: this.isConnectedBrowser,
            hasBrowser: !!this.browser,
            hasPage: !!this.page,
            hasApiEndpoint: !!this.apiEndpoint,
            hasApiHeaders: !!this.apiHeaders,
            hasCreditsEndpoint: !!this.creditsEndpoint,
            hasOverageEndpoint: !!this.overageEndpoint,
            capturedEndpointsCount: this.capturedEndpoints?.length || 0,
            sessionDir: this.sessionDir,
            hasExistingSession: this.hasExistingSession(),
            // Schema info for debugging API changes
            schemaVersion: schemaInfo.version,
            schemaFields: schemaInfo.usageFields,
            schemaEndpoints: schemaInfo.endpoints,
        };
    }
}

module.exports = { ClaudeUsageScraper, getDebugChannel, setDevMode };
