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
  try {
    $r = Invoke-RestMethod "http://localhost:8000/health" -TimeoutSec 4 -ErrorAction Stop
    return $r.status -eq "ok"
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
  if (-not (Test-FastApi))     { Start-FastApi }
  if (-not (Test-Cloudflared)) { Start-Cloudflared }

  $url = Get-TunnelUrl
  if ($url) {
    Sync-VercelUrl -NewUrl $url
  } else {
    Write-Log "No tunnel URL captured yet"
  }

  Start-Sleep -Seconds 30
}
