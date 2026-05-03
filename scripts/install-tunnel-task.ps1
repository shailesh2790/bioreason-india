# Install the BioReason tunnel watcher as a Windows Scheduled Task
# Run this ONCE as Administrator. It registers a task that runs at user login.
#
# After install:
#   - Reboot or run `Start-ScheduledTask -TaskName "BioReason-Tunnel"` to start now
#   - Watcher log: %TEMP%\bioreason-watcher.log
#   - To uninstall: Unregister-ScheduledTask -TaskName "BioReason-Tunnel" -Confirm:$false

$TaskName    = "BioReason-Tunnel"
$ScriptPath  = "c:\MLProject\bioreason\scripts\bioreason-tunnel.ps1"

# Action: run the watcher hidden, with execution policy bypass
$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`""

# Trigger: at logon of current user
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# Settings: keep running, restart on failure
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 99 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Days 0)

# Run as current user, no admin needed once registered
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

# Remove if already registered
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Keeps BioReason FastAPI + cloudflared tunnel alive; syncs URL changes to Vercel"

Write-Host ""
Write-Host "Installed scheduled task: $TaskName"
Write-Host "It will start automatically at next login."
Write-Host ""
Write-Host "Start it now:        Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Stop it:             Stop-ScheduledTask  -TaskName '$TaskName'"
Write-Host "Watcher log:         Get-Content `$env:TEMP\bioreason-watcher.log -Tail 30 -Wait"
Write-Host "Uninstall:           Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
