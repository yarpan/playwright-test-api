import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import dotenv from "dotenv";

// Load .env file for Discord credentials
dotenv.config();

interface DiscordConfig {
  webhookUrl?: string;
  enabled?: boolean;
  includeFailedTests?: boolean;
  maxFailedTestsToShow?: number;
}

interface TestStats {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  duration: number;
}

interface FailedTest {
  title: string;
  file: string;
  error: string;
}

interface DiscordEmbed {
  title: string;
  description?: string;
  color: number;
  fields: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer?: {
    text: string;
  };
  timestamp?: string;
}

interface DiscordWebhookPayload {
  content?: string;
  embeds: DiscordEmbed[];
}

/**
 * Custom Playwright Reporter that sends test execution results to Discord
 *
 * This reporter is standalone and can be copied to any project.
 * It only depends on @playwright/test/reporter and dotenv.
 *
 * Setup:
 * 1. Create a Discord webhook in your channel settings
 * 2. Set DISCORD_WEBHOOK_URL in .env file
 * 3. Set enabled: true in playwright.config.ts reporter options
 */
class DiscordReporter implements Reporter {
  private webhookUrl: string;
  private enabled: boolean;
  private includeFailedTests: boolean;
  private maxFailedTestsToShow: number;

  private stats: TestStats = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    flaky: 0,
    duration: 0,
  };
  private failedTests: FailedTest[] = [];
  private startTime: number = 0;
  private projectName: string = "";
  private baseUrl: string = "";

  constructor(options: DiscordConfig = {}) {
    // Credentials from .env file or options
    this.webhookUrl = options.webhookUrl || process.env.DISCORD_WEBHOOK_URL || "";

    // Options from playwright.config.ts
    this.enabled = options.enabled ?? false;
    this.includeFailedTests = options.includeFailedTests ?? true;
    this.maxFailedTestsToShow = options.maxFailedTestsToShow ?? 5;
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.startTime = Date.now();
    this.baseUrl = config.projects[0]?.use?.baseURL || process.env.BASE_URL || "";

    // Get the project name from the first running project
    const runningProject = config.projects.find((p) => p.testDir);
    this.projectName = runningProject?.name || "Playwright Tests";
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.stats.total++;
    this.stats.duration += result.duration;

    switch (result.status) {
      case "passed":
        this.stats.passed++;
        break;
      case "failed":
      case "timedOut":
        this.stats.failed++;
        this.failedTests.push({
          title: test.title,
          file: test.location.file.split(/[\\/]/).pop() || test.location.file,
          error: this.extractErrorMessage(result),
        });
        break;
      case "skipped":
        this.stats.skipped++;
        break;
    }

    // Track flaky tests (passed after retry)
    if (result.status === "passed" && result.retry > 0) {
      this.stats.flaky++;
    }
  }

  async onEnd(result: FullResult): Promise<void> {
    if (!this.enabled) {
      return;
    }

    if (!this.isConfigured()) {
      console.log(
        "[Discord Reporter] Skipped - missing DISCORD_WEBHOOK_URL in .env file"
      );
      return;
    }

    const payload = this.buildPayload(result);
    await this.sendDiscordMessage(payload);
  }

  private isConfigured(): boolean {
    return Boolean(this.webhookUrl);
  }

  private extractErrorMessage(result: TestResult): string {
    if (result.errors.length === 0) return "Unknown error";

    const error = result.errors[0];
    const message = error.message || "";

    // Truncate long error messages
    const maxLength = 150;
    if (message.length > maxLength) {
      return message.substring(0, maxLength) + "...";
    }
    return message;
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  }

  private getStatusEmoji(status: FullResult["status"]): string {
    switch (status) {
      case "passed":
        return "✅";
      case "failed":
        return "❌";
      case "timedout":
        return "⏱️";
      case "interrupted":
        return "⚠️";
      default:
        return "❓";
    }
  }

  private getStatusText(status: FullResult["status"]): string {
    switch (status) {
      case "passed":
        return "PASSED";
      case "failed":
        return "FAILED";
      case "timedout":
        return "TIMED OUT";
      case "interrupted":
        return "INTERRUPTED";
      default:
        return "UNKNOWN";
    }
  }

  private getEmbedColor(status: FullResult["status"]): number {
    switch (status) {
      case "passed":
        return 0x2ecc71; // Green
      case "failed":
        return 0xe74c3c; // Red
      case "timedout":
        return 0xf39c12; // Orange
      case "interrupted":
        return 0x9b59b6; // Purple
      default:
        return 0x95a5a6; // Gray
    }
  }

  private getPassRate(): string {
    if (this.stats.total === 0) return "0%";
    const rate = (this.stats.passed / this.stats.total) * 100;
    return `${rate.toFixed(1)}%`;
  }

  private buildPayload(result: FullResult): DiscordWebhookPayload {
    const statusEmoji = this.getStatusEmoji(result.status);
    const statusText = this.getStatusText(result.status);
    const totalDuration = this.formatDuration(Date.now() - this.startTime);
    const embedColor = this.getEmbedColor(result.status);

    const fields: DiscordEmbed["fields"] = [
      {
        name: "📦 Project",
        value: this.projectName,
        inline: true,
      },
      {
        name: "🌐 Environment",
        value: this.baseUrl || "N/A",
        inline: true,
      },
      {
        name: "⏱️ Duration",
        value: totalDuration,
        inline: true,
      },
      {
        name: "📊 Results",
        value: [
          `**Total:** ${this.stats.total}`,
          `**Passed:** ${this.stats.passed} ✅`,
          `**Failed:** ${this.stats.failed} ❌`,
          `**Skipped:** ${this.stats.skipped} ⏭️`,
          this.stats.flaky > 0 ? `**Flaky:** ${this.stats.flaky} 🔄` : null,
          `**Pass Rate:** ${this.getPassRate()}`,
        ]
          .filter(Boolean)
          .join("\n"),
        inline: false,
      },
    ];

    // Add failed tests details (grouped by file)
    if (this.includeFailedTests && this.failedTests.length > 0) {
      // Group failed tests by file
      const testsByFile = new Map<string, string[]>();
      for (const test of this.failedTests) {
        const tests = testsByFile.get(test.file) || [];
        tests.push(test.title);
        testsByFile.set(test.file, tests);
      }

      // Build the output grouped by file
      let failedTestsValue = "";
      let testsShown = 0;

      for (const [file, tests] of testsByFile) {
        if (testsShown >= this.maxFailedTestsToShow) break;

        failedTestsValue += `📄 **${file}**\n`;
        for (const testTitle of tests) {
          if (testsShown >= this.maxFailedTestsToShow) {
            break;
          }
          failedTestsValue += `• ${testTitle}\n`;
          testsShown++;
        }
        failedTestsValue += "\n";
      }

      if (this.failedTests.length > this.maxFailedTestsToShow) {
        const remaining = this.failedTests.length - this.maxFailedTestsToShow;
        failedTestsValue += `_... and ${remaining} more failed tests_`;
      }

      // Discord embed field value has 1024 character limit
      if (failedTestsValue.length > 1024) {
        failedTestsValue = failedTestsValue.substring(0, 1020) + "...";
      }

      fields.push({
        name: "❌ Failed Tests",
        value: failedTestsValue.trim(),
        inline: false,
      });
    }

    const embed: DiscordEmbed = {
      title: `${statusEmoji} Test Execution: ${statusText}`,
      color: embedColor,
      fields: fields,
      footer: {
        text: "Playwright Test Reporter",
      },
      timestamp: new Date().toISOString(),
    };

    return {
      embeds: [embed],
    };
  }

  private async sendDiscordMessage(payload: DiscordWebhookPayload): Promise<void> {
    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[Discord Reporter] Failed to send message - Status: ${response.status}, Error: ${errorText}`
        );
      } else {
        console.log("[Discord Reporter] Notification sent successfully");
      }
      
      // Small delay to allow Windows async handles to close properly
      // Fixes: "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" error
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`[Discord Reporter] Error sending message - ${error}`);
    }
  }
}

export default DiscordReporter;

