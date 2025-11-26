const vscode = require('vscode');
const { UsageDataProvider } = require('./src/dataProvider');
const { createStatusBarItem, updateStatusBar, startSpinner, stopSpinner } = require('./src/statusBar');
const { ActivityMonitor } = require('./src/activityMonitor');
const { SessionTracker } = require('./src/sessionTracker');
const { ClaudeDataLoader } = require('./src/claudeDataLoader');

let statusBarItem;
let dataProvider;
let autoRefreshTimer;
let activityMonitor;
let sessionTracker;
let claudeDataLoader;
let jsonlWatcher;

// Track if we're running in development mode
let runningInDevMode = false;

// Helper to check if debug mode is enabled (config setting OR dev mode)
function isDebugMode(context) {
    if (context?.extensionMode === vscode.ExtensionMode.Development) return true;
    if (runningInDevMode) return true;
    const config = vscode.workspace.getConfiguration('claudeUsage');
    return config.get('debug', false);
}

// Lazy-created diagnostic channel for token monitoring
let tokenDiagnosticChannel = null;
function getTokenDiagnosticChannel() {
    if (!tokenDiagnosticChannel) {
        tokenDiagnosticChannel = vscode.window.createOutputChannel('Claude Usage - Token Monitor');
    }
    return tokenDiagnosticChannel;
}

/**
 * Debug logger - only logs when debug mode is enabled
 * @param {string} message - Message to log
 */
function debugLog(message) {
    if (runningInDevMode || vscode.workspace.getConfiguration('claudeUsage').get('debug', false)) {
        getTokenDiagnosticChannel().appendLine(message);
    }
}

/**
 * Set up monitoring for Claude Code token usage via JSONL files
 * Monitors ~/.config/claude/projects/*.jsonl for usage data
 * @param {vscode.ExtensionContext} context
 */
async function setupTokenMonitoring(context) {
    // Register diagnostic channel for disposal if it gets created
    context.subscriptions.push({
        dispose: () => {
            if (tokenDiagnosticChannel) {
                tokenDiagnosticChannel.dispose();
                tokenDiagnosticChannel = null;
            }
        }
    });

    // Get current workspace path for project-specific token tracking
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || null;
    if (workspacePath) {
        debugLog(`📂 Workspace path: ${workspacePath}`);
    } else {
        debugLog('⚠️ No workspace folder open - will use global token search');
    }

    // Initialize the Claude data loader with workspace path
    claudeDataLoader = new ClaudeDataLoader(workspacePath);

    // Try to find Claude data directory
    const claudeDir = await claudeDataLoader.findClaudeDataDirectory();
    if (!claudeDir) {
        debugLog('⚠️ Claude data directory not found');
        debugLog('Checked locations:');
        claudeDataLoader.claudeConfigPaths.forEach(p => debugLog(`  - ${p}`));
        debugLog('Token monitoring will not be available.');
        return;
    }

    debugLog(`✅ Found Claude data directory: ${claudeDir}`);

    // Determine which directory to watch (project-specific or global)
    const projectDir = await claudeDataLoader.getProjectDataDirectory();
    const watchDir = projectDir || claudeDir;
    const watchPattern = projectDir ? '*.jsonl' : '**/*.jsonl';

    if (projectDir) {
        debugLog(`📂 Watching project-specific directory: ${projectDir}`);
    } else {
        debugLog(`📂 Watching global directory: ${claudeDir}`);
    }

    // Initial load of usage data
    await updateTokensFromJsonl(false);

    // Set up file watcher for JSONL directory
    const fs = require('fs');
    if (fs.existsSync(watchDir)) {
        jsonlWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(watchDir, watchPattern)
        );

        // Watch for file changes
        jsonlWatcher.onDidChange(async () => {
            debugLog('📝 JSONL file changed, updating tokens...');
            await updateTokensFromJsonl(false);
        });

        // Watch for new files
        jsonlWatcher.onDidCreate(async () => {
            debugLog('📝 New JSONL file created, updating tokens...');
            await updateTokensFromJsonl(false);
        });

        context.subscriptions.push(jsonlWatcher);
        debugLog('✅ File watcher active for JSONL changes');
    }

    // No polling needed - file watcher handles real-time updates
    // and the main auto-refresh (default 5 min) handles periodic checks
    debugLog('✅ Token monitoring initialized');
    debugLog(`   Watching: ${watchDir}/${watchPattern}`);
}

/**
 * Update token usage from JSONL data
 * @param {boolean} silent - If true, don't log updates (used for polling)
 */
async function updateTokensFromJsonl(silent = false) {
    try {
        // Get current session usage (from project-specific or global directory)
        const usage = await claudeDataLoader.getCurrentSessionUsage();

        if (!silent) {
            if (usage.isActive) {
                debugLog(`📊 Active session: ${usage.totalTokens.toLocaleString()} tokens (${usage.messageCount} messages)`);
                debugLog(`   Cache read: ${usage.cacheReadTokens.toLocaleString()}, Cache creation: ${usage.cacheCreationTokens.toLocaleString()}`);
            } else {
                debugLog(`⏸️  No active session detected (no recent JSONL activity)`);
            }
        }

        // Update status bar based on session activity
        if (statusBarItem) {
            if (usage.isActive && usage.totalTokens > 0) {
                // Active session - update with current tokens
                if (sessionTracker) {
                    let currentSession = await sessionTracker.getCurrentSession();
                    if (!currentSession) {
                        currentSession = await sessionTracker.startSession('Claude Code session (auto-created)');
                        debugLog(`✨ Created new session: ${currentSession.sessionId}`);
                    }
                    await sessionTracker.updateTokens(usage.totalTokens, 200000);
                }

                const sessionData = await sessionTracker.getCurrentSession();
                const activityStats = activityMonitor ? activityMonitor.getStats(dataProvider?.usageData, sessionData) : null;
                updateStatusBar(statusBarItem, dataProvider?.usageData, activityStats, sessionData);

                if (dataProvider) {
                    dataProvider.updateSessionData(sessionData, activityStats);
                }
            } else {
                // No active session - clear token display (pass null for sessionData)
                const activityStats = activityMonitor ? activityMonitor.getStats(dataProvider?.usageData, null) : null;
                updateStatusBar(statusBarItem, dataProvider?.usageData, activityStats, null);

                if (dataProvider) {
                    dataProvider.updateSessionData(null, activityStats);
                }
            }
        }
    } catch (error) {
        debugLog(`❌ Error updating tokens: ${error.message}`);
    }
}

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    // Enable debug mode if running in Extension Development Host (F5)
    const { setDevMode } = require('./src/scraper');
    if (context.extensionMode === vscode.ExtensionMode.Development) {
        runningInDevMode = true;
        setDevMode(true);
    }

    // Create status bar item
    statusBarItem = createStatusBarItem(context);

    // Initialize data provider
    dataProvider = new UsageDataProvider();

    // Initialize activity monitor
    activityMonitor = new ActivityMonitor();
    activityMonitor.startMonitoring(context);

    // Initialize session tracker
    sessionTracker = new SessionTracker();

    // Monitor for Claude Code token usage updates via JSONL files
    await setupTokenMonitoring(context);

    // Helper function to update status bar and tree view with all data
    async function updateStatusBarWithAllData() {
        const sessionData = sessionTracker ? await sessionTracker.getCurrentSession() : null;
        const activityStats = activityMonitor ? activityMonitor.getStats(dataProvider.usageData, sessionData) : null;
        updateStatusBar(statusBarItem, dataProvider.usageData, activityStats, sessionData);

        // Update tree view with session data and activity stats
        dataProvider.updateSessionData(sessionData, activityStats);
    }

    // Register tree data provider
    const treeView = vscode.window.createTreeView('claude-usage-view', {
        treeDataProvider: dataProvider
    });
    context.subscriptions.push(treeView);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('claude-usage.fetchNow', async () => {
            let webError = null;
            let tokenError = null;
            try {
                startSpinner();
                const result = await dataProvider.fetchUsage();
                webError = result.webError;

                // Check if token data is available
                const sessionData = sessionTracker ? await sessionTracker.getCurrentSession() : null;
                if (!sessionData || !sessionData.tokenUsage) {
                    tokenError = new Error('No token data available');
                }

                await updateStatusBarWithAllData();
            } catch (error) {
                webError = webError || error;
                vscode.window.showErrorMessage(`Failed to fetch Claude usage: ${error.message}`);
            } finally {
                stopSpinner(webError, tokenError);
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

    // Show Debug Output command
    context.subscriptions.push(
        vscode.commands.registerCommand('claude-usage.showDebug', async () => {
            const { getDebugChannel } = require('./src/scraper');
            const debugChannel = getDebugChannel();

            // Add diagnostic info
            debugChannel.appendLine(`\n=== DIAGNOSTICS (${new Date().toLocaleString()}) ===`);

            if (dataProvider && dataProvider.scraper) {
                const diag = dataProvider.scraper.getDiagnostics();
                debugChannel.appendLine('Scraper State:');
                debugChannel.appendLine(`  Initialized: ${diag.isInitialized}`);
                debugChannel.appendLine(`  Connected Browser: ${diag.isConnectedBrowser}`);
                debugChannel.appendLine(`  Has Browser: ${diag.hasBrowser}`);
                debugChannel.appendLine(`  Has Page: ${diag.hasPage}`);
                debugChannel.appendLine(`  Has API Endpoint: ${diag.hasApiEndpoint}`);
                debugChannel.appendLine(`  Has API Headers: ${diag.hasApiHeaders}`);
                debugChannel.appendLine(`  Has Credits Endpoint: ${diag.hasCreditsEndpoint}`);
                debugChannel.appendLine(`  Has Overage Endpoint: ${diag.hasOverageEndpoint}`);
                debugChannel.appendLine(`  Captured Endpoints: ${diag.capturedEndpointsCount}`);
                debugChannel.appendLine(`  Session Dir: ${diag.sessionDir}`);
                debugChannel.appendLine(`  Has Existing Session: ${diag.hasExistingSession}`);
            } else {
                debugChannel.appendLine('Scraper not initialized');
            }

            // Show usage data state
            debugChannel.appendLine('');
            debugChannel.appendLine('Usage Data State:');
            if (dataProvider && dataProvider.usageData) {
                debugChannel.appendLine(`  Last Updated: ${dataProvider.usageData.timestamp}`);
                debugChannel.appendLine(`  5hr Usage: ${dataProvider.usageData.usagePercent}%`);
                debugChannel.appendLine(`  Weekly Usage: ${dataProvider.usageData.usagePercentWeek}%`);
                debugChannel.appendLine(`  Has Monthly Credits: ${!!dataProvider.usageData.monthlyCredits}`);
            } else {
                debugChannel.appendLine('  No usage data available');
            }

            debugChannel.appendLine('=== END DIAGNOSTICS ===');
            debugChannel.show(true);
        })
    );

    // Reset Connection command
    context.subscriptions.push(
        vscode.commands.registerCommand('claude-usage.resetConnection', async () => {
            try {
                if (dataProvider && dataProvider.scraper) {
                    const result = await dataProvider.scraper.reset();
                    // Reset first fetch flag so it re-authenticates
                    dataProvider.isFirstFetch = true;
                    vscode.window.showInformationMessage(result.message);
                } else {
                    vscode.window.showWarningMessage('Scraper not initialized');
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Reset failed: ${error.message}`);
            }
        })
    );

    // Clear Session command - deletes stored browser session for fresh login
    context.subscriptions.push(
        vscode.commands.registerCommand('claude-usage.clearSession', async () => {
            try {
                if (dataProvider && dataProvider.scraper) {
                    const confirm = await vscode.window.showWarningMessage(
                        'This will delete your saved browser session. You will need to log in to Claude.ai again. Continue?',
                        { modal: true },
                        'Yes, Clear Session'
                    );
                    if (confirm === 'Yes, Clear Session') {
                        const result = await dataProvider.scraper.clearSession();
                        dataProvider.isFirstFetch = true;
                        vscode.window.showInformationMessage(result.message);
                    }
                } else {
                    vscode.window.showWarningMessage('Scraper not initialized');
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Clear session failed: ${error.message}`);
            }
        })
    );

    // Get configuration
    const config = vscode.workspace.getConfiguration('claudeUsage');

    // Fetch on startup if configured
    if (config.get('fetchOnStartup', true)) {
        setTimeout(async () => {
            let webError = null;
            let tokenError = null;
            try {
                startSpinner();
                const result = await dataProvider.fetchUsage();
                webError = result.webError;

                // Check if token data is available
                const sessionData = sessionTracker ? await sessionTracker.getCurrentSession() : null;
                if (!sessionData || !sessionData.tokenUsage) {
                    tokenError = new Error('No token data available');
                }

                await updateStatusBarWithAllData();
            } catch (error) {
                webError = webError || error;
                console.error('Failed to fetch usage on startup:', error);
            } finally {
                stopSpinner(webError, tokenError);
            }
        }, 2000); // Wait 2 seconds after activation
    }

    // Set up auto-refresh interval for usage checks
    let autoRefreshMinutes = config.get('autoRefreshMinutes', 5);
    // Validate and clamp to 1-60 minute range
    autoRefreshMinutes = Math.max(1, Math.min(60, autoRefreshMinutes));

    if (autoRefreshMinutes > 0) {
        autoRefreshTimer = setInterval(async () => {
            let webError = null;
            let tokenError = null;
            try {
                startSpinner();
                const result = await dataProvider.fetchUsage();
                webError = result.webError;

                // Check if token data is available
                const sessionData = sessionTracker ? await sessionTracker.getCurrentSession() : null;
                if (!sessionData || !sessionData.tokenUsage) {
                    tokenError = new Error('No token data available');
                }

                await updateStatusBarWithAllData();
            } catch (error) {
                webError = webError || error;
                console.error('Failed to auto-refresh usage:', error);
            } finally {
                stopSpinner(webError, tokenError);
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
                let newAutoRefresh = newConfig.get('autoRefreshMinutes', 5);
                // Validate and clamp to 1-60 minute range
                newAutoRefresh = Math.max(1, Math.min(60, newAutoRefresh));

                if (newAutoRefresh > 0) {
                    autoRefreshTimer = setInterval(async () => {
                        let webError = null;
                        let tokenError = null;
                        try {
                            startSpinner();
                            const result = await dataProvider.fetchUsage();
                            webError = result.webError;

                            // Check if token data is available
                            const sessionData = sessionTracker ? await sessionTracker.getCurrentSession() : null;
                            if (!sessionData || !sessionData.tokenUsage) {
                                tokenError = new Error('No token data available');
                            }

                            await updateStatusBarWithAllData();
                        } catch (error) {
                            webError = webError || error;
                            console.error('Failed to auto-refresh usage:', error);
                        } finally {
                            stopSpinner(webError, tokenError);
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
