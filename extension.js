const vscode = require('vscode');
const { UsageDataProvider } = require('./src/dataProvider');
const { createStatusBarItem, updateStatusBar } = require('./src/statusBar');
const { ActivityMonitor } = require('./src/activityMonitor');
const { SessionTracker } = require('./src/sessionTracker');

let statusBarItem;
let dataProvider;
let autoRefreshTimer;
let activityMonitor;
let sessionTracker;

/**
 * EXPERIMENTAL: Set up monitoring for Claude Code token usage
 * Attempts to capture token usage from various VS Code output channels
 * @param {vscode.ExtensionContext} context
 */
function setupTokenMonitoring(context) {
    console.log('🧪 [EXPERIMENTAL] Setting up token monitoring...');

    // Create a diagnostic output channel for monitoring
    const diagnosticChannel = vscode.window.createOutputChannel('Claude Usage - Token Monitor');
    context.subscriptions.push(diagnosticChannel);

    // Method 1: Monitor terminal output
    // NOTE: onDidWriteTerminalData is a proposed API and causes activation failure
    // Commenting out for now - will explore alternative approaches
    // context.subscriptions.push(
    //     vscode.window.onDidWriteTerminalData(async (event) => {
    //         const text = event.data;
    //         diagnosticChannel.appendLine(`[Terminal] ${text.substring(0, 200)}`);
    //         await parseAndUpdateTokens(text, 'Terminal');
    //     })
    // );

    // Method 2: Monitor text document changes (if Claude Code writes to files)
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async (event) => {
            const text = event.document.getText();

            // Only check if document might contain Claude output
            if (text.includes('system_warning') || text.includes('Token usage:')) {
                diagnosticChannel.appendLine(`[Document] ${event.document.fileName}`);
                await parseAndUpdateTokens(text, 'Document');
            }
        })
    );

    // Method 3: Register a command that can be called externally
    context.subscriptions.push(
        vscode.commands.registerCommand('claude-usage.updateTokens', async (current, limit) => {
            // If called from Command Palette (no arguments), prompt for input
            if (current === undefined || limit === undefined) {
                const tokenInput = await vscode.window.showInputBox({
                    prompt: 'Enter current token usage (e.g., 87500)',
                    placeHolder: '87500',
                    validateInput: (value) => {
                        return isNaN(parseInt(value)) ? 'Must be a number' : null;
                    }
                });

                if (!tokenInput) {
                    return; // User cancelled
                }

                current = parseInt(tokenInput);
                limit = 200000; // Default limit
            }

            diagnosticChannel.appendLine(`[Command] Received: ${current}/${limit}`);
            if (sessionTracker && typeof current === 'number' && typeof limit === 'number') {
                await sessionTracker.updateTokens(current, limit);

                // Update status bar if available
                if (dataProvider && statusBarItem && activityMonitor) {
                    const sessionData = await sessionTracker.getCurrentSession();
                    const activityStats = activityMonitor.getStats(dataProvider.usageData, sessionData);
                    const { updateStatusBar } = require('./src/statusBar');
                    updateStatusBar(statusBarItem, dataProvider.usageData, activityStats, sessionData);
                }

                diagnosticChannel.appendLine(`[Command] ✅ Tokens updated to ${current}/${limit}`);
                vscode.window.showInformationMessage(`✅ Tokens updated: ${current}/${limit} (${Math.round(current/limit*100)}%)`);
            }
        })
    );

    diagnosticChannel.appendLine('✅ Token monitoring initialized');
    diagnosticChannel.appendLine('Try running: code --command claude-usage.updateTokens 12345 200000');

    // EXPERIMENTAL: Try to access Claude Code extension API
    const claudeCodeExt = vscode.extensions.getExtension('anthropic.claude-code');
    if (claudeCodeExt) {
        diagnosticChannel.appendLine('✅ Found Claude Code extension');
        diagnosticChannel.appendLine(`   Version: ${claudeCodeExt.packageJSON.version}`);
        diagnosticChannel.appendLine(`   Active: ${claudeCodeExt.isActive}`);

        if (claudeCodeExt.isActive && claudeCodeExt.exports) {
            diagnosticChannel.appendLine(`   Exports available: ${Object.keys(claudeCodeExt.exports).join(', ')}`);
        } else {
            diagnosticChannel.appendLine('   No exports available or extension not active yet');
        }
    } else {
        diagnosticChannel.appendLine('❌ Claude Code extension not found');
    }

    // EXPERIMENTAL: Intercept console output to capture token warnings
    setupConsoleInterception(diagnosticChannel);
}

/**
 * EXPERIMENTAL: Intercept console output to capture token usage warnings
 * @param {vscode.OutputChannel} diagnosticChannel
 */
function setupConsoleInterception(diagnosticChannel) {
    diagnosticChannel.appendLine('🔬 Setting up console interception...');

    // Store original console methods
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    // Counter for captured messages
    let captureCount = 0;

    // Intercept console.warn (most likely for warnings)
    console.warn = function(...args) {
        const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');

        // Check for token usage pattern
        if (message.includes('Token usage:') || message.includes('system_warning')) {
            captureCount++;
            diagnosticChannel.appendLine(`🎯 [console.warn #${captureCount}] ${message.substring(0, 200)}`);
            parseAndUpdateTokens(message, 'Console.warn').catch(err => {
                diagnosticChannel.appendLine(`⚠️ Error parsing: ${err.message}`);
            });
        }

        return originalWarn.apply(console, args);
    };

    // Intercept console.log
    console.log = function(...args) {
        const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');

        if (message.includes('Token usage:') || message.includes('system_warning')) {
            captureCount++;
            diagnosticChannel.appendLine(`🎯 [console.log #${captureCount}] ${message.substring(0, 200)}`);
            parseAndUpdateTokens(message, 'Console.log').catch(err => {
                diagnosticChannel.appendLine(`⚠️ Error parsing: ${err.message}`);
            });
        }

        return originalLog.apply(console, args);
    };

    // Intercept console.error
    console.error = function(...args) {
        const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');

        if (message.includes('Token usage:') || message.includes('system_warning')) {
            captureCount++;
            diagnosticChannel.appendLine(`🎯 [console.error #${captureCount}] ${message.substring(0, 200)}`);
            parseAndUpdateTokens(message, 'Console.error').catch(err => {
                diagnosticChannel.appendLine(`⚠️ Error parsing: ${err.message}`);
            });
        }

        return originalError.apply(console, args);
    };

    diagnosticChannel.appendLine('✅ Console interception active');
    diagnosticChannel.appendLine('   Monitoring: console.log, console.warn, console.error');
    diagnosticChannel.appendLine('   Pattern: "Token usage:" or "system_warning"');
}

/**
 * Parse text for token usage and update if found
 * @param {string} text - Text to parse
 * @param {string} source - Source of the text (for logging)
 */
async function parseAndUpdateTokens(text, source) {
    // Pattern: "Token usage: 78512/200000; 121488 remaining"
    const match = text.match(/Token usage:\s*(\d+)\/(\d+);\s*(\d+)\s*remaining/i);

    if (match && sessionTracker) {
        const current = parseInt(match[1]);
        const limit = parseInt(match[2]);

        console.log(`🎯 [${source}] Detected token usage: ${current}/${limit}`);

        await sessionTracker.updateTokens(current, limit);

        // Update status bar if components are available
        if (dataProvider && statusBarItem && activityMonitor) {
            const sessionData = await sessionTracker.getCurrentSession();
            const activityStats = activityMonitor.getStats(dataProvider.usageData, sessionData);
            const { updateStatusBar } = require('./src/statusBar');
            updateStatusBar(statusBarItem, dataProvider.usageData, activityStats, sessionData);
        }
    }
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    console.log('Claude Usage Monitor is now active!');

    // Create status bar item
    statusBarItem = createStatusBarItem(context);

    // Initialize data provider
    dataProvider = new UsageDataProvider();

    // Initialize activity monitor
    activityMonitor = new ActivityMonitor();
    activityMonitor.startMonitoring(context);

    // Initialize session tracker
    sessionTracker = new SessionTracker();

    // EXPERIMENTAL: Monitor for Claude Code token usage updates
    setupTokenMonitoring(context);

    // Helper function to update status bar with all data
    async function updateStatusBarWithAllData() {
        const sessionData = sessionTracker ? await sessionTracker.getCurrentSession() : null;
        const activityStats = activityMonitor ? activityMonitor.getStats(dataProvider.usageData, sessionData) : null;
        updateStatusBar(statusBarItem, dataProvider.usageData, activityStats, sessionData);
    }

    // Register tree data provider
    const treeView = vscode.window.createTreeView('claude-usage-view', {
        treeDataProvider: dataProvider
    });
    context.subscriptions.push(treeView);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('claude-usage.fetchNow', async () => {
            try {
                await dataProvider.fetchUsage();
                await updateStatusBarWithAllData();
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to fetch Claude usage: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('claude-usage.openSettings', async () => {
            await vscode.env.openExternal(vscode.Uri.parse('https://claude.ai/settings'));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('claude-usage.startNewSession', async () => {
            try {
                // Prompt user for optional session description
                const description = await vscode.window.showInputBox({
                    prompt: 'Enter a description for this Claude Code session (optional)',
                    placeHolder: 'e.g., Implementing user authentication feature',
                    value: 'Claude Code development session'
                });

                // User cancelled the input
                if (description === undefined) {
                    return;
                }

                // Start new session
                const newSession = await sessionTracker.startSession(description);

                // Update status bar to show new session
                await updateStatusBarWithAllData();

                vscode.window.showInformationMessage(
                    `✅ New session started: ${newSession.sessionId}`,
                    { modal: false }
                );
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to start new session: ${error.message}`);
            }
        })
    );

    // Get configuration
    const config = vscode.workspace.getConfiguration('claudeUsage');

    // Fetch on startup if configured
    if (config.get('fetchOnStartup', true)) {
        setTimeout(async () => {
            try {
                await dataProvider.fetchUsage();
                await updateStatusBarWithAllData();
            } catch (error) {
                console.error('Failed to fetch usage on startup:', error);
            }
        }, 2000); // Wait 2 seconds after activation
    }

    // Set up fixed 5-minute interval for usage checks
    const autoRefreshMinutes = config.get('autoRefreshMinutes', 5);
    if (autoRefreshMinutes > 0) {
        autoRefreshTimer = setInterval(async () => {
            try {
                await dataProvider.fetchUsage();
                await updateStatusBarWithAllData();
            } catch (error) {
                console.error('Failed to auto-refresh usage:', error);
            }
        }, autoRefreshMinutes * 60 * 1000);

        console.log(`Auto-refresh enabled: checking usage every ${autoRefreshMinutes} minutes`);
    }

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('claudeUsage.autoRefreshMinutes')) {
                // Clear existing timer
                if (autoRefreshTimer) {
                    clearInterval(autoRefreshTimer);
                    autoRefreshTimer = null;
                }

                // Restart with new configuration
                const newConfig = vscode.workspace.getConfiguration('claudeUsage');
                const newAutoRefresh = newConfig.get('autoRefreshMinutes', 5);

                if (newAutoRefresh > 0) {
                    autoRefreshTimer = setInterval(async () => {
                        try {
                            await dataProvider.fetchUsage();
                            await updateStatusBarWithAllData();
                        } catch (error) {
                            console.error('Failed to auto-refresh usage:', error);
                        }
                    }, newAutoRefresh * 60 * 1000);

                    console.log(`Auto-refresh interval updated to ${newAutoRefresh} minutes`);
                }
            }
        })
    );
}

async function deactivate() {
    // Clean up timer
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }

    // Close scraper browser if open
    if (dataProvider && dataProvider.scraper) {
        try {
            await dataProvider.scraper.close();
        } catch (err) {
            console.error('Error closing scraper:', err);
        }
    }
}

module.exports = {
    activate,
    deactivate
};
