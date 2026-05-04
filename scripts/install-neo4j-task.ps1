# Install the BioReason Neo4j auto-start as a Windows Scheduled Task.
# Runs at user logon. No admin elevation needed.
#
# After install:
#   - Reboot OR run `Start-ScheduledTask -TaskName "BioReason-Neo4j"` to start now
#   - Database log: %TEMP%\bioreason-neo4j.log
#   - Watcher log:  %TEMP%\bioreason-watcher.log
#   - Uninstall:    Unregister-ScheduledTask -TaskName "BioReason-Neo4j" -Confirm:$false

$TaskName   = "BioReason-Neo4j"
$ScriptPath = "c:\MLProject\bioreason\scripts\neo4j-start.ps1"

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`""

# Trigger: at user logon. We chain a short delay so the system is ready.
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$trigger.Delay = "PT15S"

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 5 `
  -RestartInterval (New-TimeSpan -Minutes 2) `
  -ExecutionTimeLimit (New-TimeSpan -Days 0)

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

# Remove if already registered
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Auto-starts the BioReason Neo4j database at user logon (replaces manual Neo4j Desktop click-Start)"

Write-Host ""
Write-Host "Installed scheduled task: $TaskName"
Write-Host "It will auto-start Neo4j 15 seconds after every user logon."
Write-Host ""
Write-Host "Start it now:        Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Stop it:             Stop-ScheduledTask  -TaskName '$TaskName'"
Write-Host "Database log:        Get-Content `$env:TEMP\bioreason-neo4j.log -Tail 30 -Wait"
Write-Host "Uninstall:           Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
