# Discord Notification Script for PowerShell
# Usage: .\helpers\notify-discord.ps1 -Title "Task Name" -Status "completed" -Details "Description"

param(
    [Parameter(Mandatory=$true)]
    [string]$Title,
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("completed", "failed", "in_progress", "cancelled")]
    [string]$Status = "completed",
    
    [Parameter(Mandatory=$false)]
    [string]$Details = "",
    
    [Parameter(Mandatory=$false)]
    [string]$WebhookUrl = ""
)

# Load .env file if exists
$envFile = Join-Path $PSScriptRoot "../.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]*?)\s*=\s*(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim().Trim('"').Trim("'")
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

# Get webhook URL (param > task webhook > general webhook)
if (-not $WebhookUrl) {
    $WebhookUrl = $env:DISCORD_TASK_WEBHOOK_URL
}
if (-not $WebhookUrl) {
    $WebhookUrl = $env:DISCORD_WEBHOOK_URL
}

if (-not $WebhookUrl) {
    Write-Host "[Discord] Skipped - no webhook URL configured" -ForegroundColor Yellow
    exit 0
}

# Status configuration
$statusConfig = @{
    "completed" = @{ emoji = "✅"; color = 3066993; desc = "Task completed successfully" }
    "failed" = @{ emoji = "❌"; color = 15158332; desc = "Task failed" }
    "in_progress" = @{ emoji = "🔄"; color = 3447003; desc = "Task in progress" }
    "cancelled" = @{ emoji = "⚠️"; color = 15844367; desc = "Task cancelled" }
}

$config = $statusConfig[$Status]

# Build payload
$fields = @()
if ($Details) {
    $fields += @{
        name = "📝 Details"
        value = $Details
        inline = $false
    }
}

$payload = @{
    embeds = @(
        @{
            title = "$($config.emoji) Task: $Title"
            description = $config.desc
            color = $config.color
            fields = $fields
            footer = @{ text = "AI Assistant Task Notification" }
            timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $null = Invoke-RestMethod -Uri $WebhookUrl -Method Post -Body $payload -ContentType "application/json" -TimeoutSec 10
    Write-Host "[Discord] Notification sent" -ForegroundColor Green
} catch {
    Write-Host "[Discord] Failed: $_" -ForegroundColor Red
}

