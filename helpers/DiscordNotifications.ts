import dotenv from "dotenv";

// Load .env file for Discord credentials
dotenv.config();

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface DiscordEmbed {
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

export interface DiscordWebhookPayload {
  content?: string;
  embeds: DiscordEmbed[];
}

export interface NotificationOptions {
  title: string;
  description?: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  color?: number;
  footer?: string;
  timestamp?: string;
  webhookUrl?: string;
}

export interface TaskNotificationOptions {
  taskName: string;
  status: "completed" | "failed" | "in_progress" | "cancelled";
  duration?: number; // in milliseconds
  details?: string;
  filesCreated?: string[];
  errors?: string[];
  webhookUrl?: string;
}

// ============================================================================
// Core Discord Notification Service
// ============================================================================

/**
 * Reusable Discord notification service
 * Handles sending messages to Discord webhooks
 */
class DiscordNotificationService {
  private defaultWebhookUrl: string;

  constructor(webhookUrl?: string) {
    this.defaultWebhookUrl =
      webhookUrl || process.env.DISCORD_WEBHOOK_URL || "";
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(webhookUrl?: string): boolean {
    const url = webhookUrl || this.defaultWebhookUrl;
    return Boolean(url);
  }

  /**
   * Send a Discord notification with embed
   */
  async sendNotification(options: NotificationOptions): Promise<boolean> {
    const webhookUrl = options.webhookUrl || this.defaultWebhookUrl;

    if (!this.isConfigured(webhookUrl)) {
      console.warn(
        "[Discord Notification] Skipped - missing webhook URL"
      );
      return false;
    }

    const payload = this.buildPayload(options);
    return await this.sendDiscordMessage(webhookUrl, payload);
  }

  /**
   * Send a simple text message (without embed)
   */
  async sendMessage(
    content: string,
    webhookUrl?: string
  ): Promise<boolean> {
    const url = webhookUrl || this.defaultWebhookUrl;

    if (!this.isConfigured(url)) {
      console.warn(
        "[Discord Notification] Skipped - missing webhook URL"
      );
      return false;
    }

    const payload: DiscordWebhookPayload = {
      content: content,
      embeds: [],
    };

    return await this.sendDiscordMessage(url, payload);
  }

  /**
   * Build Discord webhook payload from options
   */
  private buildPayload(options: NotificationOptions): DiscordWebhookPayload {
    const embed: DiscordEmbed = {
      title: options.title,
      description: options.description,
      color: options.color ?? 0x3498db, // Default blue
      fields: options.fields || [],
      footer: options.footer
        ? { text: options.footer }
        : { text: "Task Notification" },
      timestamp: options.timestamp || new Date().toISOString(),
    };

    return {
      embeds: [embed],
    };
  }

  /**
   * Send message to Discord webhook
   */
  private async sendDiscordMessage(
    webhookUrl: string,
    payload: DiscordWebhookPayload
  ): Promise<boolean> {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[Discord Notification] Failed to send - Status: ${response.status}, Error: ${errorText}`
        );
        return false;
      }

      console.log("[Discord Notification] Sent successfully");
      return true;
    } catch (error) {
      console.error(`[Discord Notification] Error - ${error}`);
      return false;
    }
  }
}

// ============================================================================
// Task Notification Helper
// ============================================================================

/**
 * Helper class for sending task completion notifications
 * Useful for notifying when long-running tasks (like test generation) complete
 */
export class TaskNotificationHelper {
  private notificationService: DiscordNotificationService;
  private defaultTaskWebhookUrl: string;

  constructor(notificationService?: DiscordNotificationService) {
    // Use task-specific webhook URL, fallback to general webhook URL
    this.defaultTaskWebhookUrl =
      process.env.DISCORD_TASK_WEBHOOK_URL ||
      process.env.DISCORD_WEBHOOK_URL ||
      "";

    this.notificationService =
      notificationService ||
      new DiscordNotificationService(this.defaultTaskWebhookUrl);
  }

  /**
   * Send a notification when a task completes
   */
  async notifyTaskCompletion(
    options: TaskNotificationOptions
  ): Promise<boolean> {
    const { status, taskName, duration, details, filesCreated, errors } =
      options;

    const statusConfig = this.getStatusConfig(status);
    const durationText = duration
      ? this.formatDuration(duration)
      : undefined;

    const fields: NotificationOptions["fields"] = [];

    if (durationText) {
      fields.push({
        name: "⏱️ Duration",
        value: durationText,
        inline: true,
      });
    }

    if (details) {
      fields.push({
        name: "📝 Details",
        value: details,
        inline: false,
      });
    }

    if (filesCreated && filesCreated.length > 0) {
      const filesList = filesCreated
        .slice(0, 10)
        .map((file) => `• \`${file}\``)
        .join("\n");
      const moreFiles =
        filesCreated.length > 10
          ? `\n_... and ${filesCreated.length - 10} more files_`
          : "";

      fields.push({
        name: `📁 Files Created (${filesCreated.length})`,
        value: filesList + moreFiles,
        inline: false,
      });
    }

    if (errors && errors.length > 0) {
      const errorsList = errors
        .slice(0, 5)
        .map((error, idx) => `${idx + 1}. ${error}`)
        .join("\n");
      const moreErrors =
        errors.length > 5 ? `\n_... and ${errors.length - 5} more errors_` : "";

      fields.push({
        name: `❌ Errors (${errors.length})`,
        value: errorsList + moreErrors,
        inline: false,
      });
    }

    const notificationOptions: NotificationOptions = {
      title: `${statusConfig.emoji} Task: ${taskName}`,
      description: statusConfig.description,
      color: statusConfig.color,
      fields: fields,
      footer: "AI Assistant Task Notification",
      webhookUrl: options.webhookUrl,
    };

    return await this.notificationService.sendNotification(notificationOptions);
  }

  /**
   * Send a simple success notification
   */
  async notifySuccess(
    taskName: string,
    message?: string,
    webhookUrl?: string
  ): Promise<boolean> {
    return await this.notifyTaskCompletion({
      taskName,
      status: "completed",
      details: message,
      webhookUrl,
    });
  }

  /**
   * Send a simple failure notification
   */
  async notifyFailure(
    taskName: string,
    error: string,
    webhookUrl?: string
  ): Promise<boolean> {
    return await this.notifyTaskCompletion({
      taskName,
      status: "failed",
      errors: [error],
      webhookUrl,
    });
  }

  /**
   * Get status configuration (emoji, color, description)
   */
  private getStatusConfig(status: TaskNotificationOptions["status"]): {
    emoji: string;
    color: number;
    description: string;
  } {
    switch (status) {
      case "completed":
        return {
          emoji: "✅",
          color: 0x2ecc71, // Green
          description: "Task completed successfully",
        };
      case "failed":
        return {
          emoji: "❌",
          color: 0xe74c3c, // Red
          description: "Task failed",
        };
      case "in_progress":
        return {
          emoji: "🔄",
          color: 0x3498db, // Blue
          description: "Task in progress",
        };
      case "cancelled":
        return {
          emoji: "⚠️",
          color: 0xf39c12, // Orange
          description: "Task cancelled",
        };
      default:
        return {
          emoji: "❓",
          color: 0x95a5a6, // Gray
          description: "Task status unknown",
        };
    }
  }

  /**
   * Format duration in milliseconds to human-readable string
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  }
}

// ============================================================================
// Exports
// ============================================================================

// Export singleton instance for convenience
export const taskNotificationHelper = new TaskNotificationHelper();

// Export service class for advanced usage
export { DiscordNotificationService };

// ============================================================================
// CLI Script
// ============================================================================

/**
 * CLI script to send Discord notifications for task completion
 * 
 * Usage:
 *   ts-node helpers/notifications/DiscordNotifications.ts "Task Name" --status completed --duration 300000
 *   ts-node helpers/notifications/DiscordNotifications.ts "Create Tests" --status completed --details "Created 10 test files"
 *   ts-node helpers/notifications/DiscordNotifications.ts "Test Generation" --status failed --error "Something went wrong"
 */

// Only run CLI if this file is executed directly (not imported)
// Check if running as script (not imported as module)
const isMainModule = 
  typeof require !== 'undefined' && require.main === module ||
  import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.includes('DiscordNotifications');

if (isMainModule) {
  interface CliArgs {
    taskName: string;
    status: "completed" | "failed" | "in_progress" | "cancelled";
    duration?: number;
    details?: string;
    files?: string[];
    errors?: string[];
  }

  function parseArgs(): CliArgs {
    const args = process.argv.slice(2);
    const result: Partial<CliArgs> = {
      files: [],
      errors: [],
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const nextArg = args[i + 1];

      switch (arg) {
        case "--status":
        case "-s":
          if (nextArg && ["completed", "failed", "in_progress", "cancelled"].includes(nextArg)) {
            result.status = nextArg as CliArgs["status"];
            i++;
          }
          break;
        case "--duration":
        case "-d":
          if (nextArg) {
            result.duration = parseInt(nextArg, 10);
            i++;
          }
          break;
        case "--details":
          if (nextArg) {
            result.details = nextArg;
            i++;
          }
          break;
        case "--file":
        case "-f":
          if (nextArg) {
            result.files?.push(nextArg);
            i++;
          }
          break;
        case "--error":
        case "-e":
          if (nextArg) {
            result.errors?.push(nextArg);
            i++;
          }
          break;
        default:
          if (!result.taskName && !arg.startsWith("--")) {
            result.taskName = arg;
          }
      }
    }

    if (!result.taskName) {
      console.error("Error: Task name is required");
      process.exit(1);
    }

    if (!result.status) {
      result.status = "completed"; // Default to completed
    }

    return result as CliArgs;
  }

  async function main() {
    const args = parseArgs();

    const success = await taskNotificationHelper.notifyTaskCompletion({
      taskName: args.taskName,
      status: args.status,
      duration: args.duration,
      details: args.details,
      filesCreated: args.files && args.files.length > 0 ? args.files : undefined,
      errors: args.errors && args.errors.length > 0 ? args.errors : undefined,
    });

    process.exit(success ? 0 : 1);
  }

  main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
