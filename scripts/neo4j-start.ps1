# Start the BioReason Neo4j database (Neo4j Desktop's bioreason instance).
#
# This is the actual database the watcher and FastAPI talk to. We bypass the
# Neo4j Desktop GUI and run neo4j.bat console directly with the bundled JRE.
#
# Run via Scheduled Task at logon (see scripts/install-neo4j-task.ps1).
# Watcher script (bioreason-tunnel.ps1) detects it via TCP probe on :7687.

$ErrorActionPreference = "Continue"

# Bundled JRE that ships with Neo4j Desktop 2 (Java 21 required for Neo4j 2026.x)
$JavaHome = "C:\Program Files\Neo4j Desktop 2\resources\offline\runtime\zulu21.48.17-ca-jre21.0.10-win_x64"

# The actual Neo4j database directory (the one with your 4.3M edges)
$Neo4jHome = "C:\Users\Shailesh\.Neo4jDesktop2\Data\dbmss\dbms-51fbd029-b0a0-46bb-a9a9-eee26ed970b4"
$Neo4jBat  = "$Neo4jHome\bin\neo4j.bat"

$LogFile = "$env:TEMP\bioreason-neo4j.log"

# Sanity checks
if (-not (Test-Path $JavaHome)) {
  Write-Error "JAVA_HOME not found at $JavaHome"
  exit 1
}
if (-not (Test-Path $Neo4jBat)) {
  Write-Error "neo4j.bat not found at $Neo4jBat"
  exit 1
}

# Set environment for this process
$env:JAVA_HOME = $JavaHome
$env:NEO4J_HOME = $Neo4jHome
$env:Path = "$JavaHome\bin;$env:Path"

# If Neo4j is already serving :7687, don't double-start
try {
  $tcp = New-Object System.Net.Sockets.TcpClient
  $iar = $tcp.BeginConnect("127.0.0.1", 7687, $null, $null)
  $ok = $iar.AsyncWaitHandle.WaitOne(1500, $false)
  if ($ok) {
    $tcp.EndConnect($iar); $tcp.Close()
    "[$([DateTime]::Now)] Neo4j already running on :7687 - exiting" | Out-File $LogFile -Append
    exit 0
  }
  $tcp.Close()
} catch {}

"[$([DateTime]::Now)] Starting Neo4j console with JAVA_HOME=$JavaHome" | Out-File $LogFile -Append

# Run neo4j.bat console — blocks for the lifetime of the database
& $Neo4jBat console 2>&1 | Tee-Object -FilePath $LogFile -Append
