const vscode = require('vscode');
const { UsageDataProvider } = require('./src/dataProvider');
const { createStatusBarItem, updateStatusBar } = require('./src/statusBar');
const { ActivityMonitor } = require('./src/activityMonitor');

let statusBarItem;
let dataProvider;
let autoRefreshTimer;
let activityMonitor;

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
                const activityStats = activityMonitor ? activityMonitor.getStats() : null;
                updateStatusBar(statusBarItem, dataProvider.usageData, activityStats);
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
                const activityStats = activityMonitor ? activityMonitor.getStats() : null;
                updateStatusBar(statusBarItem, dataProvider.usageData, activityStats);
            } catch (error) {
                console.error('Failed to fetch usage on startup:', error);
            }
        }, 2000); // Wait 2 seconds after activation
    }

    // Set up dynamic activity-based auto-refresh
    const enableActivityBasedRefresh = config.get('activityBasedRefresh', true);

    if (enableActivityBasedRefresh) {
        // Start with initial interval check
        scheduleNextRefresh();
    } else {
        // Fall back to static interval if user disabled activity-based refresh
        const autoRefreshMinutes = config.get('autoRefreshMinutes', 15);
        if (autoRefreshMinutes > 0) {
            autoRefreshTimer = setInterval(async () => {
                try {
                    await dataProvider.fetchUsage();
                    const activityStats = activityMonitor ? activityMonitor.getStats() : null;
                    updateStatusBar(statusBarItem, dataProvider.usageData, activityStats);
                } catch (error) {
                    console.error('Failed to auto-refresh usage:', error);
                }
            }, autoRefreshMinutes * 60 * 1000);
        }
    }

    /**
     * Schedule next refresh based on current activity level
     */
    function scheduleNextRefresh() {
        // Clear any existing timer
        if (autoRefreshTimer) {
            clearTimeout(autoRefreshTimer);
            autoRefreshTimer = null;
        }

        // Get recommended interval based on activity
        const intervalMinutes = activityMonitor.getRecommendedRefreshInterval();
        const stats = activityMonitor.getStats();

        console.log(`Next refresh in ${intervalMinutes} minutes (Activity: ${stats.level}, Edits: ${stats.editCount})`);

        // Schedule next refresh
        autoRefreshTimer = setTimeout(async () => {
            try {
                await dataProvider.fetchUsage();
                const activityStats = activityMonitor ? activityMonitor.getStats() : null;
                updateStatusBar(statusBarItem, dataProvider.usageData, activityStats);

                // Schedule next refresh after this one completes
                scheduleNextRefresh();
            } catch (error) {
                console.error('Failed to auto-refresh usage:', error);
                // Try again with same interval on error
                scheduleNextRefresh();
            }
        }, intervalMinutes * 60 * 1000);
    }

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('claudeUsage.activityBasedRefresh') ||
                e.affectsConfiguration('claudeUsage.autoRefreshMinutes')) {

                // Clear existing timer
                if (autoRefreshTimer) {
                    clearInterval(autoRefreshTimer);
                    clearTimeout(autoRefreshTimer);
                    autoRefreshTimer = null;
                }

                // Restart with new configuration
                const newConfig = vscode.workspace.getConfiguration('claudeUsage');
                const enableActivityBased = newConfig.get('activityBasedRefresh', true);

                if (enableActivityBased) {
                    scheduleNextRefresh();
                } else {
                    const newAutoRefresh = newConfig.get('autoRefreshMinutes', 15);
                    if (newAutoRefresh > 0) {
                        autoRefreshTimer = setInterval(async () => {
                            try {
                                await dataProvider.fetchUsage();
                                const activityStats = activityMonitor ? activityMonitor.getStats() : null;
                                updateStatusBar(statusBarItem, dataProvider.usageData, activityStats);
                            } catch (error) {
                                console.error('Failed to auto-refresh usage:', error);
                            }
                        }, newAutoRefresh * 60 * 1000);
                    }
                }
            }
        })
    );
}

function deactivate() {
    // Clean up auto-refresh timer
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
