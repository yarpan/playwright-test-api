# Telegram Test Notifications Setup

Step-by-step guide to configure Telegram notifications for Playwright test results.

---

## Step 1: Create a Telegram Bot

1. Open Telegram app (mobile or desktop)
2. Search for `@BotFather` in the search bar
3. Start a chat with BotFather by clicking "Start"
4. Send the command: `/newbot`
5. BotFather will ask for a name - enter any name (e.g., `QA Test Reporter`)
6. BotFather will ask for a username - must end with `bot` (e.g., `kommodity_qa_bot`)
7. BotFather will reply with your **bot token** - looks like this:
   ```
   TOKENPART1:TOKENPART2
   ```
8. **Copy and save this token** - you'll need it in Step 3

---

## Step 2: Get Your Chat ID

1. In Telegram, search for your newly created bot by its username
2. Start a chat with your bot by clicking "Start"
3. Send any message to the bot (e.g., `hello`)
4. Open this URL in your browser (replace `YOUR_BOT_TOKEN` with your actual token):
   ```
   https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
   ```
   
   Example:
   ```
   https://api.telegram.org/bot7123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw/getUpdates
   ```

5. Look for `"chat":{"id":` in the response - the number is your **chat ID**:
   ```json
   "chat": {
     "id": 123456789,
     "first_name": "Your Name",
     ...
   }
   ```
6. **Copy this chat ID number** - you'll need it in Step 3

### Alternative: Use a Group Chat

If you want notifications in a group:
1. Create a new Telegram group
2. Add your bot to the group
3. Send a message in the group mentioning the bot
4. Use the same getUpdates URL - the chat ID will be negative (e.g., `-987654321`)

---

## Step 3: Configure .env File

1. Open or create `.env` file in the project root (`kommodity-qa/.env`)
2. Add these two lines with your values:

```env
TELEGRAM_BOT_TOKEN=7123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw
TELEGRAM_CHAT_ID=123456789
```

Replace the values with your actual bot token and chat ID.

---

## Step 4: Enable Notifications

Open `playwright.config.ts` and change `enabled: false` to `enabled: true`:

```typescript
['./helpers/TelegramReporter.ts', {
  enabled: true, // Set to true to enable Telegram notifications
  includeFailedTests: true,
  maxFailedTestsToShow: 5
}]
```

---

## Step 5: Run Tests

Run your tests as usual:

```bash
npx playwright test --project=tests-ai
```

When tests complete, you'll receive a Telegram message with the results.

---

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `false` | Enable/disable Telegram notifications |
| `includeFailedTests` | `true` | Include failed test details in message |
| `maxFailedTestsToShow` | `5` | Maximum number of failed tests to list |

---

## Troubleshooting

### "Skipped - missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID"
- Check that `.env` file exists in project root
- Verify both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set
- Make sure there are no extra spaces or quotes around values

### "Failed to send message"
- Verify your bot token is correct
- Make sure you've started a chat with your bot (sent at least one message)
- Check that the chat ID is correct

### Not receiving messages in group
- Make sure the bot is added to the group
- Use the negative chat ID for groups (e.g., `-987654321`)
- Send a message in the group after adding the bot, then check getUpdates again

---

## Example Notification

```
Test Execution: PASSED

Project: tests-ai
Environment: https://app.edge-dev.ensilio.com
Time: 12/6/24, 10:30 AM UTC
Duration: 2m 45s

Results:
Total: 25
Passed: 23
Failed: 2
Skipped: 0
Pass Rate: 92.0%

Failed Tests:

1. Buyer can create order
   File: order.spec.ts
   Error: Expected element to be visible...
```

