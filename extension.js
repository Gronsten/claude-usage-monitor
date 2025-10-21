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
    // Reset session tokens to zero for fresh start on next activation
    if (sessionTracker) {
        try {
            await sessionTracker.resetSessionTokens();
        } catch (error) {
            console.error('Error resetting session tokens:', error);
        }
    }

    // Clean up timer
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }

    // Close scraper browser if open
    if (dataProvider && dataProvider.scraper) {
        dataProvider.scraper.close().catch(err => {
            console.error('Error closing scraper:', err);
        });
    }
}

module.exports = {
    activate,
    deactivate
};
