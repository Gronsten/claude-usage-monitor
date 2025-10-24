const vscode = require('vscode');
const { UsageDataProvider } = require('./src/dataProvider');
const { createStatusBarItem, updateStatusBar } = require('./src/statusBar');
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

/**
 * Set up monitoring for Claude Code token usage via JSONL files
 * Monitors ~/.config/claude/projects/*.jsonl for usage data
 * @param {vscode.ExtensionContext} context
 */
async function setupTokenMonitoring(context) {
    console.log('📊 Setting up Claude Code JSONL token monitoring...');

    // Create a diagnostic output channel for monitoring
    const diagnosticChannel = vscode.window.createOutputChannel('Claude Usage - Token Monitor');
    context.subscriptions.push(diagnosticChannel);

    // Initialize the Claude data loader
    claudeDataLoader = new ClaudeDataLoader();

    // Try to find Claude data directory
    const claudeDir = await claudeDataLoader.findClaudeDataDirectory();
    if (!claudeDir) {
        diagnosticChannel.appendLine('⚠️ Claude data directory not found');
        diagnosticChannel.appendLine('Checked locations:');
        claudeDataLoader.claudeConfigPaths.forEach(p => {
            diagnosticChannel.appendLine(`  - ${p}`);
        });
        diagnosticChannel.appendLine('Token monitoring will not be available.');
        return;
    }

    diagnosticChannel.appendLine(`✅ Found Claude data directory: ${claudeDir}`);

    // Initial load of usage data
    await updateTokensFromJsonl(diagnosticChannel);

    // Set up file watcher for JSONL directory
    const fs = require('fs');
    if (fs.existsSync(claudeDir)) {
        jsonlWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(claudeDir, '**/*.jsonl')
        );

        // Watch for file changes
        jsonlWatcher.onDidChange(async () => {
            diagnosticChannel.appendLine('📝 JSONL file changed, updating tokens...');
            await updateTokensFromJsonl(diagnosticChannel);
        });

        // Watch for new files
        jsonlWatcher.onDidCreate(async () => {
            diagnosticChannel.appendLine('📝 New JSONL file created, updating tokens...');
            await updateTokensFromJsonl(diagnosticChannel);
        });

        context.subscriptions.push(jsonlWatcher);
        diagnosticChannel.appendLine('✅ File watcher active for JSONL changes');
    }

    // Also poll every 30 seconds for safety (in case file watcher misses events)
    const pollInterval = setInterval(async () => {
        await updateTokensFromJsonl(diagnosticChannel, true); // Silent mode
    }, 30000);

    context.subscriptions.push({
        dispose: () => clearInterval(pollInterval)
    });

    diagnosticChannel.appendLine('✅ Token monitoring initialized');
    diagnosticChannel.appendLine(`   Polling interval: 30 seconds`);
    diagnosticChannel.appendLine(`   Watching: ${claudeDir}/**/*.jsonl`);
}

/**
 * Update token usage from JSONL data
 * @param {vscode.OutputChannel} diagnosticChannel
 * @param {boolean} silent - If true, don't log every update
 */
async function updateTokensFromJsonl(diagnosticChannel, silent = false) {
    try {
        // Get current session usage (last hour)
        const usage = await claudeDataLoader.getCurrentSessionUsage();

        if (!silent) {
            diagnosticChannel.appendLine(`📊 Current session: ${usage.totalTokens} tokens (${usage.messageCount} messages)`);
            diagnosticChannel.appendLine(`   Input: ${usage.inputTokens}, Output: ${usage.outputTokens}`);
            if (usage.cacheReadTokens > 0) {
                diagnosticChannel.appendLine(`   Cache read: ${usage.cacheReadTokens}, Cache creation: ${usage.cacheCreationTokens}`);
            }
        }

        // Update session tracker with total tokens
        if (sessionTracker && usage.totalTokens > 0) {
            // Ensure a session exists
            let currentSession = await sessionTracker.getCurrentSession();
            if (!currentSession) {
                // Auto-create a session if none exists
                currentSession = await sessionTracker.startSession('Claude Code session (auto-created)');
                if (!silent) {
                    diagnosticChannel.appendLine(`✨ Created new session: ${currentSession.sessionId}`);
                }
            }

            await sessionTracker.updateTokens(usage.totalTokens, 200000); // 200k limit

            // Update status bar
            if (statusBarItem) {
                const sessionData = await sessionTracker.getCurrentSession();
                const activityStats = activityMonitor ? activityMonitor.getStats(dataProvider?.usageData, sessionData) : null;
                updateStatusBar(statusBarItem, dataProvider?.usageData, activityStats, sessionData);
            }
        }
    } catch (error) {
        diagnosticChannel.appendLine(`❌ Error updating tokens: ${error.message}`);
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

    // Monitor for Claude Code token usage updates via JSONL files
    await setupTokenMonitoring(context);

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
