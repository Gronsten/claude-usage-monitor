const vscode = require('vscode');
const { UsageDataProvider } = require('./src/dataProvider');
const { createStatusBarItem, updateStatusBar } = require('./src/statusBar');

let statusBarItem;
let dataProvider;
let autoRefreshTimer;

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    console.log('Claude Usage Monitor is now active!');

    // Create status bar item
    statusBarItem = createStatusBarItem(context);

    // Initialize data provider
    dataProvider = new UsageDataProvider();

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
                updateStatusBar(statusBarItem, dataProvider.usageData);
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
    if (config.get('fetchOnStartup', false)) {
        setTimeout(async () => {
            try {
                await dataProvider.fetchUsage();
                updateStatusBar(statusBarItem, dataProvider.usageData);
            } catch (error) {
                console.error('Failed to fetch usage on startup:', error);
            }
        }, 2000); // Wait 2 seconds after activation
    }

    // Set up auto-refresh if configured
    const autoRefreshMinutes = config.get('autoRefreshMinutes', 0);
    if (autoRefreshMinutes > 0) {
        autoRefreshTimer = setInterval(async () => {
            try {
                await dataProvider.fetchUsage();
                updateStatusBar(statusBarItem, dataProvider.usageData);
            } catch (error) {
                console.error('Failed to auto-refresh usage:', error);
            }
        }, autoRefreshMinutes * 60 * 1000);
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

                // Set up new timer if configured
                const newAutoRefresh = vscode.workspace.getConfiguration('claudeUsage').get('autoRefreshMinutes', 0);
                if (newAutoRefresh > 0) {
                    autoRefreshTimer = setInterval(async () => {
                        try {
                            await dataProvider.fetchUsage();
                            updateStatusBar(statusBarItem, dataProvider.usageData);
                        } catch (error) {
                            console.error('Failed to auto-refresh usage:', error);
                        }
                    }, newAutoRefresh * 60 * 1000);
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
