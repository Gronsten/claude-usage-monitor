/** @format */

const vscode = require("vscode");
const { ClaudeUsageScraper } = require("./scraper");
const { UsageHistory } = require("./usageHistory");
const { calculateResetClockTime } = require("./utils");

class UsageDataProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this.usageData = null;
    this.sessionData = null;
    this.activityStats = null;
    this.scraper = new ClaudeUsageScraper();
    this.usageHistory = new UsageHistory();
    this.isFirstFetch = true;
  }

  /**
   * Update session data and refresh tree view
   * @param {Object} sessionData - Session data from SessionTracker
   * @param {Object} activityStats - Activity stats from ActivityMonitor
   */
  updateSessionData(sessionData, activityStats = null) {
    this.sessionData = sessionData;
    this.activityStats = activityStats;
    this.refresh();
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
          "",
          vscode.TreeItemCollapsibleState.None,
          "info"
        ),
      ];
    }

    // Format timestamp
    const time = this.usageData.timestamp.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    // Add single-line sparkline for usage activity (16 chars × 3 data points = 48 min)
    const sparklineData = await this.usageHistory.getFiveHourSparkline(
      16,
      3,
      false // Use single-line block characters
    );

    const items = [
      new UsageTreeItem(
        sparklineData,  // Use sparkline as label (no value = no colon)
        "",  // Empty value
        vscode.TreeItemCollapsibleState.None,
        "graph"
      )
    ];

    // --- SESSION STATS ---
    // 5hr usage - thresholds: 90% critical, 75% warning
    let usageLevel = "normal";
    if (this.usageData.usagePercent >= 90) usageLevel = "critical";
    else if (this.usageData.usagePercent >= 75) usageLevel = "warning";

    const resetClockTime = calculateResetClockTime(this.usageData.resetTime);
    items.push(
      new UsageTreeItem(
        "Session (5hr)",
        `${this.usageData.usagePercent}% (resets ${resetClockTime})`,
        vscode.TreeItemCollapsibleState.None,
        usageLevel
      )
    );

    // Session tokens (if available)
    if (this.sessionData && this.sessionData.tokenUsage) {
      const tokenPercent = Math.round(
        (this.sessionData.tokenUsage.current / this.sessionData.tokenUsage.limit) * 100
      );

      let tokenUsageLevel = "normal";
      if (tokenPercent >= 90) tokenUsageLevel = "critical";
      else if (tokenPercent >= 75) tokenUsageLevel = "warning";

      items.push(
        new UsageTreeItem(
          "Tokens",
          `${this.sessionData.tokenUsage.current.toLocaleString()} / ${this.sessionData.tokenUsage.limit.toLocaleString()} (${tokenPercent}%)`,
          vscode.TreeItemCollapsibleState.None,
          tokenUsageLevel
        )
      );
    }

    // --- WEEKLY STATS ---
    if (this.usageData.usagePercentWeek !== undefined) {
      let weeklyLevel = "normal";
      if (this.usageData.usagePercentWeek >= 90) weeklyLevel = "critical";
      else if (this.usageData.usagePercentWeek >= 75) weeklyLevel = "warning";

      const weekResetClock = calculateResetClockTime(this.usageData.resetTimeWeek);
      items.push(
        new UsageTreeItem(
          "Weekly (all)",
          `${this.usageData.usagePercentWeek}% (resets ${weekResetClock})`,
          vscode.TreeItemCollapsibleState.None,
          weeklyLevel
        )
      );
    }

    if (this.usageData.usagePercentSonnet !== null && this.usageData.usagePercentSonnet !== undefined) {
      let sonnetLevel = "normal";
      if (this.usageData.usagePercentSonnet >= 90) sonnetLevel = "critical";
      else if (this.usageData.usagePercentSonnet >= 75) sonnetLevel = "warning";

      items.push(
        new UsageTreeItem(
          "Weekly (Sonnet)",
          `${this.usageData.usagePercentSonnet}%`,
          vscode.TreeItemCollapsibleState.None,
          sonnetLevel
        )
      );
    }

    if (this.usageData.usagePercentOpus !== null && this.usageData.usagePercentOpus !== undefined) {
      let opusLevel = "normal";
      if (this.usageData.usagePercentOpus >= 90) opusLevel = "critical";
      else if (this.usageData.usagePercentOpus >= 75) opusLevel = "warning";

      items.push(
        new UsageTreeItem(
          "Weekly (Opus)",
          `${this.usageData.usagePercentOpus}%`,
          vscode.TreeItemCollapsibleState.None,
          opusLevel
        )
      );
    }

    // --- ACTIVITY STATUS ---
    if (this.activityStats && this.activityStats.description) {
      const statusIcon = this.activityStats.level === 'heavy' ? 'critical' :
                         this.activityStats.level === 'moderate' ? 'warning' : 'normal';
      items.push(
        new UsageTreeItem(
          this.activityStats.description.short,
          this.activityStats.description.quirky,
          vscode.TreeItemCollapsibleState.None,
          statusIcon
        )
      );
    }

    // --- FOOTER ---
    items.push(
      new UsageTreeItem(
        "Updated",
        time,
        vscode.TreeItemCollapsibleState.None,
        "clock"
      )
    );

    return items;
  }

  /**
   * Fetch usage data from Claude.ai
   * Note: This method is resilient - it will succeed even if web scraping fails
   * since session token data is read from local JSON file independently
   */
  async fetchUsage() {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Fetching Claude usage data...",
        cancellable: false,
      },
      async (progress) => {
        let webScrapeFailed = false;
        let webScrapeError = null;

        try {
          progress.report({ increment: 0, message: "Initializing browser..." });

          // Check if we have an existing session for smart headless mode
          const hasSession = this.scraper.hasExistingSession();
          const needsLogin = this.isFirstFetch && !hasSession;

          // Initialize scraper if needed
          // Show browser window only if login is required
          if (!this.scraper.isInitialized) {
            await this.scraper.initialize(!hasSession);
          }

          progress.report({
            increment: 30,
            message: "Checking authentication...",
          });

          // Ensure logged in (only needed first time)
          if (this.isFirstFetch) {
            await this.scraper.ensureLoggedIn();
            this.isFirstFetch = false;
          }

          progress.report({ increment: 60, message: "Fetching usage data..." });

          // Fetch usage data from web scrape
          this.usageData = await this.scraper.fetchUsageData();

          // Save data point to history for sparkline generation
          if (this.usageData) {
            await this.usageHistory.addDataPoint(this.usageData.usagePercent);
          }

          progress.report({ increment: 100, message: "Complete!" });
        } catch (error) {
          // Web scrape failed, but don't fail the entire operation
          // Session token data can still be read from local JSON
          console.error("Web scrape failed:", error);
          webScrapeFailed = true;
          webScrapeError = error;

          // Keep existing usage data if available, or set to null
          if (!this.usageData) {
            this.usageData = null;
          }
        }

        // Always refresh tree view (will show session data even if web scrape failed)
        this.refresh();

        // Only show notification if web scrape failed
        if (webScrapeFailed) {
          vscode.window.showWarningMessage(
            `⚠️ Web scrape failed: ${webScrapeError.message}. Session token data still available.`
          );
        }
        // Success case: silently update status bar (no popup)
      }
    );
  }

  /**
   * Dispose of resources
   */
  dispose() {
    if (this.scraper) {
      this.scraper.close().catch((err) => {
        console.error("Error closing scraper:", err);
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
  constructor(label, value, collapsibleState, iconType = "info") {
    const displayLabel = value ? `${label}: ${value}` : label;
    super(displayLabel, collapsibleState);

    this.tooltip = displayLabel;
    this.description = "";

    // Set icon based on type
    switch (iconType) {
      case "critical":
        this.iconPath = new vscode.ThemeIcon(
          "error",
          new vscode.ThemeColor("errorForeground")
        );
        break;
      case "warning":
        this.iconPath = new vscode.ThemeIcon(
          "warning",
          new vscode.ThemeColor("editorWarning.foreground")
        );
        break;
      case "normal":
        this.iconPath = new vscode.ThemeIcon(
          "check",
          new vscode.ThemeColor("testing.iconPassed")
        );
        break;
      case "time":
        this.iconPath = new vscode.ThemeIcon("clock");
        break;
      case "clock":
        this.iconPath = new vscode.ThemeIcon("history");
        break;
      case "graph":
        this.iconPath = new vscode.ThemeIcon("graph-line");
        break;
      case "info":
        this.iconPath = new vscode.ThemeIcon(
          "info",
          new vscode.ThemeColor("editorInfo.foreground")
        );
        break;
      default:
        this.iconPath = new vscode.ThemeIcon("info");
        break;
    }
  }
}

module.exports = { UsageDataProvider };
