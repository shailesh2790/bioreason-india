# BioReason tunnel watcher — keeps cloudflared alive and syncs URL changes to Vercel
#
# What it does:
#   1. Ensures FastAPI is running on :8000 (starts it if not)
#   2. Ensures cloudflared is running, restarts it if it dies
#   3. Captures the trycloudflare.com URL from cloudflared logs
#   4. If the URL changed since last run, updates Vercel FASTAPI_URL and redeploys
#   5. Loops every 30 seconds
#
# Run on Windows boot via Task Scheduler — see scripts/install-tunnel-task.ps1

$ErrorActionPreference = "Continue"
$ProjectDir   = "c:\MLProject\bioreason"
$PythonExe    = "C:\Users\Shailesh\anaconda3\python.exe"
$Cloudflared  = "C:\Users\Shailesh\AppData\Local\cloudflared\cloudflared.exe"
$TunnelLog    = "$env:TEMP\cloudflared.log"
$FastApiLog   = "$env:TEMP\bioreason-fastapi.log"
$WatcherLog   = "$env:TEMP\bioreason-watcher.log"
$UrlCacheFile = "$env:TEMP\bioreason-tunnel-url.txt"
$ProjectAlias = "bioreason-india.vercel.app"

function Write-Log {
  param($msg)
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "[$ts] $msg" | Tee-Object -FilePath $WatcherLog -Append
}

function Test-FastApi {
  # Returns $true if FastAPI process is responding, regardless of Neo4j health.
  # Neo4j being down makes status "degraded" — that's NOT a FastAPI problem; don't restart.
  try {
    $r = Invoke-RestMethod "http://localhost:8000/health" -TimeoutSec 4 -ErrorAction Stop
    return ($r.status -eq "ok") -or ($r.status -eq "degraded")
  } catch { return $false }
}

function Test-Neo4j {
  # Just checks if Neo4j Bolt port is reachable. We don't try to start it —
  # the user manages Neo4j Desktop. This is informational only.
  try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $iar = $tcp.BeginConnect("127.0.0.1", 7687, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(1500, $false)
    if ($ok) { $tcp.EndConnect($iar); $tcp.Close(); return $true }
    $tcp.Close(); return $false
  } catch { return $false }
}

function Start-FastApi {
  Write-Log "Starting FastAPI..."
  Start-Process -FilePath "cmd.exe" `
    -ArgumentList "/c cd /d $ProjectDir && $PythonExe -m uvicorn api.reason:app --port 8000 > $FastApiLog 2>&1" `
    -WindowStyle Hidden
  Start-Sleep -Seconds 8
}

function Test-Cloudflared {
  $procs = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue
  return $null -ne $procs
}

function Test-TunnelLive {
  # Probes the cached tunnel URL. Returns $true only if it currently serves /health.
  # cloudflared's process can be alive while the Cloudflare session is dead
  # (e.g., after laptop sleep). Without this probe we'd loop forever on a stale URL.
  param([string]$Url)
  if (-not $Url) { return $false }
  try {
    $r = Invoke-WebRequest "$Url/health" -TimeoutSec 6 -UseBasicParsing -ErrorAction Stop
    return ($r.StatusCode -eq 200) -and ($r.Content -match '"status"')
  } catch { return $false }
}

function Restart-Cloudflared {
  Write-Log "Killing stale cloudflared (tunnel session dead)..."
  Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  # Clear the log so Get-TunnelUrl will see the FRESH URL, not the stale one
  Remove-Item $TunnelLog -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Start-Cloudflared
}

function Start-Cloudflared {
  Write-Log "Starting cloudflared quick tunnel..."
  Remove-Item $TunnelLog -ErrorAction SilentlyContinue
  Start-Process -FilePath $Cloudflared `
    -ArgumentList "tunnel --url http://localhost:8000 --logfile $TunnelLog" `
    -WindowStyle Hidden
  Start-Sleep -Seconds 12
}

function Get-TunnelUrl {
  $content = Get-Content $TunnelLog -Raw -ErrorAction SilentlyContinue
  if (-not $content) { return $null }
  $m = [regex]::Match($content, 'https://[a-z0-9-]+\.trycloudflare\.com')
  if ($m.Success) { return $m.Value }
  return $null
}

function Sync-VercelUrl {
  param([string]$NewUrl)
  $cached = Get-Content $UrlCacheFile -ErrorAction SilentlyContinue
  if ($cached -eq $NewUrl) {
    Write-Log "URL unchanged ($NewUrl) - skipping Vercel sync"
    return
  }
  Write-Log "URL changed: $cached -> $NewUrl. Updating Vercel..."
  Push-Location $ProjectDir
  try {
    vercel env rm FASTAPI_URL production --yes 2>&1 | Out-Null
    $NewUrl | vercel env add FASTAPI_URL production 2>&1 | Out-Null
    $deploy = vercel --prod 2>&1
    $depUrl = ($deploy | Select-String "bioreason-[a-z0-9]+-shailesh2790s-projects\.vercel\.app" |
               Select-Object -First 1).Matches.Value
    if ($depUrl) {
      vercel alias $depUrl $ProjectAlias 2>&1 | Out-Null
      Write-Log "Vercel updated: $depUrl -> $ProjectAlias"
    } else {
      Write-Log "WARNING: Could not extract deployment URL from vercel output"
    }
    $NewUrl | Out-File $UrlCacheFile -NoNewline -Encoding ascii
  } finally {
    Pop-Location
  }
}

# ── Main loop ─────────────────────────────────────────────────────────────
Write-Log "BioReason tunnel watcher started (PID $PID)"

while ($true) {
  $neo4jUp  = Test-Neo4j
  $apiUp    = Test-FastApi
  $procUp   = Test-Cloudflared

  if (-not $neo4jUp) { Write-Log "Neo4j: DOWN (port 7687 unreachable) - please start Neo4j Desktop" }
  if (-not $apiUp)   { Start-FastApi }
  if (-not $procUp)  { Start-Cloudflared }

  $url = Get-TunnelUrl
  if ($url) {
    if ($apiUp -and -not (Test-TunnelLive -Url $url)) {
      Write-Log "Tunnel URL $url is unreachable - cycling cloudflared"
      Restart-Cloudflared
      Start-Sleep -Seconds 8
      $url = Get-TunnelUrl
    }
    if ($url) {
      Sync-VercelUrl -NewUrl $url
    }
  } else {
    Write-Log "No tunnel URL captured yet"
  }

  Start-Sleep -Seconds 30
}
