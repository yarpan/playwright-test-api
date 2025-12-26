import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import dotenv from "dotenv";

// Load .env file for Telegram credentials
dotenv.config();

interface TelegramConfig {
  botToken?: string;
  chatId?: string;
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

/**
 * Custom Playwright Reporter that sends test execution results to Telegram
 *
 * Setup:
 * 1. Create a bot via @BotFather on Telegram and get the bot token
 * 2. Get your chat ID by messaging your bot and calling getUpdates API
 * 3. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env file
 * 4. Set enabled: true in playwright.config.ts reporter options
 */
class TelegramReporter implements Reporter {
  private botToken: string;
  private chatId: string;
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

  constructor(options: TelegramConfig = {}) {
    // Credentials from .env file
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || "";
    this.chatId = process.env.TELEGRAM_CHAT_ID || "";

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
      // console.log("[Telegram Reporter] Disabled - set enabled: true in playwright.config.ts");
      return;
    }

    if (!this.isConfigured()) {
      console.log(
        "[Telegram Reporter] Skipped - missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in .env file"
      );
      return;
    }

    const message = this.buildMessage(result);
    await this.sendTelegramMessage(message);
  }

  private isConfigured(): boolean {
    return Boolean(this.botToken && this.chatId);
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

  private getPassRate(): string {
    if (this.stats.total === 0) return "0%";
    const rate = (this.stats.passed / this.stats.total) * 100;
    return `${rate.toFixed(1)}%`;
  }

  private buildMessage(result: FullResult): string {
    const statusText = this.getStatusText(result.status);
    const totalDuration = this.formatDuration(Date.now() - this.startTime);
    const timestamp = new Date().toLocaleString("en-US", {
      timeZone: "UTC",
      dateStyle: "short",
      timeStyle: "short",
    });

    let message = `<b>Test Execution: ${statusText}</b>\n\n`;
    message += `<b>Project:</b> ${this.escapeHtml(this.projectName)}\n`;
    message += `<b>Environment:</b> ${this.escapeHtml(this.baseUrl)}\n`;
    message += `<b>Time:</b> ${this.escapeHtml(timestamp)} UTC\n`;
    message += `<b>Duration:</b> ${totalDuration}\n\n`;

    message += `<b>Results:</b>\n`;
    message += `Total: ${this.stats.total}\n`;
    message += `Passed: ${this.stats.passed}\n`;
    message += `Failed: ${this.stats.failed}\n`;
    message += `Skipped: ${this.stats.skipped}\n`;
    if (this.stats.flaky > 0) {
      message += `Flaky: ${this.stats.flaky}\n`;
    }
    message += `Pass Rate: ${this.getPassRate()}\n`;

    // Add failed tests details (grouped by file)
    if (this.includeFailedTests && this.failedTests.length > 0) {
      message += `\n<b>Failed Tests:</b>\n`;

      // Group failed tests by file
      const testsByFile = new Map<string, string[]>();
      for (const test of this.failedTests) {
        const tests = testsByFile.get(test.file) || [];
        tests.push(test.title);
        testsByFile.set(test.file, tests);
      }

      // Build the output grouped by file
      let testsShown = 0;

      for (const [file, tests] of testsByFile) {
        if (testsShown >= this.maxFailedTestsToShow) break;

        message += `\n📄 <b>${this.escapeHtml(file)}</b>\n`;
        for (const testTitle of tests) {
          if (testsShown >= this.maxFailedTestsToShow) {
            break;
          }
          message += `• ${this.escapeHtml(testTitle)}\n`;
          testsShown++;
        }
      }

      if (this.failedTests.length > this.maxFailedTestsToShow) {
        const remaining = this.failedTests.length - this.maxFailedTestsToShow;
        message += `\n<i>... and ${remaining} more failed tests</i>`;
      }
    }

    return message;
  }

  private escapeHtml(text: string): string {
    // Escape special characters for HTML mode (much simpler than MarkdownV2)
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  private async sendTelegramMessage(message: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error(
          `[Telegram Reporter] Failed to send message - ${JSON.stringify(errorData)}`
        );
      } else {
        console.log("[Telegram Reporter] Notification sent successfully");
      }
    } catch (error) {
      console.error(`[Telegram Reporter] Error sending message - ${error}`);
    }
  }
}

export default TelegramReporter;

