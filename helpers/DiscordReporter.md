# Discord Test Notifications Setup

Step-by-step guide to configure Discord notifications for Playwright test results.

---

## Step 1: Create a Discord Webhook

1. Open Discord app (desktop or browser)
2. Go to the server where you want to receive notifications
3. Right-click on the channel → **Edit Channel** (or click the gear icon)
4. Navigate to **Integrations** in the left sidebar
5. Click **Webhooks**
6. Click **New Webhook**
7. Give it a name (e.g., `QA Test Reporter`)
8. Optionally set a custom avatar
9. Click **Copy Webhook URL** - it looks like this:
   ```
   https://discord.com/api/webhooks/1234567890123456789/abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ
   ```
10. **Save this URL** - you'll need it in Step 2

---

## Step 2: Configure .env File

1. Open or create `.env` file in the project root (`kommodity-qa/.env`)
2. Add this line with your webhook URL:

```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/1234567890123456789/abcdefghijklmnopqrstuvwxyz1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ
```

Replace the value with your actual webhook URL.

---

## Step 3: Enable Notifications

Open `playwright.config.ts` and add the Discord reporter:

```typescript
reporter: [
  ['html'],
  ['./helpers/DiscordReporter.ts', {
    enabled: true, // Set to true to enable Discord notifications
    includeFailedTests: true,
    maxFailedTestsToShow: 5
  }]
]
```

---

## Step 4: Run Tests

Run your tests as usual:

```bash
npx playwright test --project=tests-ai
```

When tests complete, you'll receive a Discord message with the results in a rich embed format.

---

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `false` | Enable/disable Discord notifications |
| `includeFailedTests` | `true` | Include failed test details in message |
| `maxFailedTestsToShow` | `5` | Maximum number of failed tests to list |
| `webhookUrl` | - | Can also be set directly instead of using .env |

---

## Using Multiple Reporters

You can use both Telegram and Discord reporters together:

```typescript
reporter: [
  ['html'],
  ['./helpers/TelegramReporter.ts', {
    enabled: true,
    includeFailedTests: true,
    maxFailedTestsToShow: 5
  }],
  ['./helpers/DiscordReporter.ts', {
    enabled: true,
    includeFailedTests: true,
    maxFailedTestsToShow: 5
  }]
]
```

---

## Troubleshooting

### "Skipped - missing DISCORD_WEBHOOK_URL"
- Check that `.env` file exists in project root
- Verify `DISCORD_WEBHOOK_URL` is set
- Make sure there are no extra spaces or quotes around the value

### "Failed to send message - Status: 400"
- Verify your webhook URL is correct and complete
- Check that the webhook hasn't been deleted from the Discord channel

### "Failed to send message - Status: 404"
- The webhook URL may be invalid or the webhook was deleted
- Create a new webhook and update the `.env` file

### Not receiving messages
- Make sure you're looking in the correct channel
- Check that the webhook wasn't moved to a different channel
- Verify `enabled: true` is set in the config

### Message appears truncated
- Discord has a 1024 character limit for embed field values
- Reduce `maxFailedTestsToShow` or the reporter will auto-truncate

---

## Example Notification

The Discord notification appears as a rich embed with:

```
┌─────────────────────────────────────────────┐
│ ❌ Test Execution: FAILED                   │
├─────────────────────────────────────────────┤
│ 📦 Project          🌐 Environment          │
│ tests-ai            https://app.example.com │
│                                             │
│ ⏱️ Duration                                 │
│ 2m 45s                                      │
│                                             │
│ 📊 Results                                  │
│ Total: 25                                   │
│ Passed: 22 ✅                               │
│ Failed: 2 ❌                                │
│ Skipped: 0 ⏭️                               │
│ Flaky: 1 🔄                                 │
│ Pass Rate: 88.0%                            │
│                                             │
│ ❌ Failed Tests                             │
│ 📄 order.spec.ts                            │
│ • Buyer can create order                    │
│ • Buyer can update order                    │
│                                             │
│ 📄 listing.spec.ts                          │
│ • Staff can search listing                  │
│                                             │
│ ... and 2 more failed tests                 │
├─────────────────────────────────────────────┤
│ Playwright Test Reporter    Today at 10:30  │
└─────────────────────────────────────────────┘
```

**Notes:**
- Failed tests are grouped by spec file
- Flaky tests (passed after retry) are tracked separately
- If more than `maxFailedTestsToShow` tests fail, remaining count is shown

The embed color changes based on status:
- 🟢 Green - All tests passed
- 🔴 Red - Tests failed
- 🟠 Orange - Timed out
- 🟣 Purple - Interrupted

---

## Webhook Security

⚠️ **Keep your webhook URL private!**

- Never commit the `.env` file to version control
- Add `.env` to your `.gitignore` file
- Anyone with the webhook URL can post messages to your channel

If your webhook URL is exposed:
1. Go to Discord channel settings → Integrations → Webhooks
2. Delete the compromised webhook
3. Create a new webhook
4. Update your `.env` file with the new URL

