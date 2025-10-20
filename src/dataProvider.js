const vscode = require('vscode');
const { ClaudeUsageScraper } = require('./scraper');

class UsageDataProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.usageData = null;
        this.scraper = new ClaudeUsageScraper();
        this.isFirstFetch = true;
    }

    /**
     * Refresh the tree view
     */
    refresh() {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Get tree item representation
     * @param {UsageTreeItem} element
     * @returns {vscode.TreeItem}
     */
    getTreeItem(element) {
        return element;
    }

    /**
     * Get children for tree view
     * @param {UsageTreeItem} element
     * @returns {Promise<UsageTreeItem[]>}
     */
    async getChildren(element) {
        if (!this.usageData) {
            return [
                new UsageTreeItem(
                    'Click status bar or run "Fetch Claude Usage Now" command',
                    '',
                    vscode.TreeItemCollapsibleState.None,
                    'info'
                )
            ];
        }

        // Format timestamp
        const time = this.usageData.timestamp.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        // Determine usage level for icon
        let usageLevel = 'normal';
        if (this.usageData.usagePercent >= 90) {
            usageLevel = 'critical';
        } else if (this.usageData.usagePercent >= 80) {
            usageLevel = 'warning';
        }

        return [
            new UsageTreeItem(
                'Usage',
                `${this.usageData.usagePercent}%`,
                vscode.TreeItemCollapsibleState.None,
                usageLevel
            ),
            new UsageTreeItem(
                'Resets in',
                this.usageData.resetTime,
                vscode.TreeItemCollapsibleState.None,
                'time'
            ),
            new UsageTreeItem(
                'Last updated',
                time,
                vscode.TreeItemCollapsibleState.None,
                'clock'
            )
        ];
    }

    /**
     * Fetch usage data from Claude.ai
     */
    async fetchUsage() {
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Fetching Claude usage data...',
                cancellable: false
            },
            async (progress) => {
                try {
                    progress.report({ increment: 0, message: 'Initializing browser...' });

                    // Check if we have an existing session for smart headless mode
                    const hasSession = this.scraper.hasExistingSession();
                    const needsLogin = this.isFirstFetch && !hasSession;

                    // Initialize scraper if needed
                    // Show browser window only if login is required
                    if (!this.scraper.isInitialized) {
                        await this.scraper.initialize(!hasSession);
                    }

                    progress.report({ increment: 30, message: 'Checking authentication...' });

                    // Ensure logged in (only needed first time)
                    if (this.isFirstFetch) {
                        await this.scraper.ensureLoggedIn();
                        this.isFirstFetch = false;
                    }

                    progress.report({ increment: 60, message: 'Fetching usage data...' });

                    // Fetch usage data
                    this.usageData = await this.scraper.fetchUsageData();

                    progress.report({ increment: 100, message: 'Complete!' });

                    // Refresh tree view
                    this.refresh();

                    // Show success message
                    const usageIcon = this.usageData.usagePercent >= 80 ? '⚠️' : '✅';
                    vscode.window.showInformationMessage(
                        `${usageIcon} Claude Usage: ${this.usageData.usagePercent}% | Resets in: ${this.usageData.resetTime}`
                    );

                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to fetch Claude usage: ${error.message}`);
                    throw error;
                }
            }
        );
    }

    /**
     * Dispose of resources
     */
    dispose() {
        if (this.scraper) {
            this.scraper.close().catch(err => {
                console.error('Error closing scraper:', err);
            });
        }
    }
}

/**
 * Tree item for usage data display
 */
class UsageTreeItem extends vscode.TreeItem {
    /**
     * @param {string} label
     * @param {string} value
     * @param {vscode.TreeItemCollapsibleState} collapsibleState
     * @param {string} iconType
     */
    constructor(label, value, collapsibleState, iconType = 'info') {
        const displayLabel = value ? `${label}: ${value}` : label;
        super(displayLabel, collapsibleState);

        this.tooltip = displayLabel;
        this.description = '';

        // Set icon based on type
        switch (iconType) {
            case 'critical':
                this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
                break;
            case 'warning':
                this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('editorWarning.foreground'));
                break;
            case 'normal':
                this.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
                break;
            case 'time':
                this.iconPath = new vscode.ThemeIcon('clock');
                break;
            case 'clock':
                this.iconPath = new vscode.ThemeIcon('history');
                break;
            case 'info':
            default:
                this.iconPath = new vscode.ThemeIcon('info');
                break;
        }
    }
}

module.exports = { UsageDataProvider };
