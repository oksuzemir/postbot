<#
.\scripts\start_all.ps1
PowerShell-friendly starter for Windows (PowerShell / PowerShell Core).
This mirrors the POSIX `scripts/start_all.sh` behavior:
 - start Redis via docker compose (if available)
 - build & start worker container
 - start server (host) in background
 - start admin dev server
 - open the admin URL in the default browser
Logs written to .\logs\*
#>
param(
    [int]$ServerWaitSeconds = 45
)

Set-StrictMode -Version Latest
if (-not (Test-Path -Path .\logs)) { New-Item -ItemType Directory -Path .\logs | Out-Null }
if (-not (Test-Path -Path .\out)) { New-Item -ItemType Directory -Path .\out | Out-Null }

function Start-DockerServiceIfAvailable($service) {
    if (Get-Command "docker" -ErrorAction SilentlyContinue) {
        Write-Output "Using docker compose: starting $service..."
        docker compose up -d $service | Out-Null
        return $true
    }
    else {
        Write-Warning "docker not found in PATH. Please start $service manually."
        return $false
    }
}

$startedRedis = Start-DockerServiceIfAvailable -service 'redis'
$startedWorker = $false
if ($startedRedis) {
    Write-Output "Building and starting worker container..."
    docker compose build worker | Out-Null
    docker compose up -d worker | Out-Null
    $startedWorker = $true
}

Write-Output "Installing project dependencies (best-effort)..."
npm install --silent | Out-Null

Write-Output "Starting server (background). Logs -> .\logs\server.log"
$serverLog = Join-Path -Path (Get-Location) -ChildPath 'logs\server.log'
$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = 'npm'
$startInfo.Arguments = 'run dev'
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $startInfo
$proc.Start() | Out-Null

# Asynchronously write stdout/stderr to log file
[void][System.IO.File]::WriteAllText($serverLog, "")
$outWriter = [System.IO.File]::OpenWrite($serverLog)
$sw = New-Object System.IO.StreamWriter($outWriter)
$sw.AutoFlush = $true
[void][System.Threading.Thread]::Pool.QueueUserWorkItem({ param($p) while (-not $p.HasExited) { $line = $p.StandardOutput.ReadLine(); if ($line -ne $null) { $sw.WriteLine($line) } } }, $proc)
[void][System.Threading.Thread]::Pool.QueueUserWorkItem({ param($p) while (-not $p.HasExited) { $line = $p.StandardError.ReadLine(); if ($line -ne $null) { $sw.WriteLine($line) } } }, $proc)

Write-Output "Waiting for server to respond at http://localhost:3000 ..."
$up = $false
for ($i=0; $i -lt $ServerWaitSeconds; $i++) {
    try {
        Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3000/' -TimeoutSec 2 | Out-Null
        $up = $true
        break
    } catch {
        Start-Sleep -Seconds 1
    }
}

if (-not $up) {
    Write-Error "Server did not start within expected time. Check $serverLog"
    exit 4
}

Write-Output "Starting admin dev server (in background). Logs -> .\logs\admin.log"
if (-not $env:VITE_API_BASE) { $env:VITE_API_BASE = 'http://localhost:3000' }
# Start admin dev server with VITE_API_BASE set in the environment so the frontend talks to the backend
Start-Process -FilePath 'npm' -ArgumentList '--prefix','admin','run','dev' -WindowStyle Hidden -NoNewWindow
Write-Output "(exported VITE_API_BASE=$env:VITE_API_BASE for admin dev)"

Start-Sleep -Seconds 2
Write-Output "Opening admin UI at http://localhost:5173"
Start-Process 'http://localhost:5173' -ErrorAction SilentlyContinue

Write-Output "All done. Tail logs in .\logs if you need to debug."
