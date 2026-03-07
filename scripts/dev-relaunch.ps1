param(
  [switch]$Check,
  [switch]$Reseed
)

$ErrorActionPreference = "Stop"

$rootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$launchScript = Join-Path $PSScriptRoot "dev-launch.ps1"

if ($Check) {
  if (-not (Test-Path $launchScript)) {
    Write-Host "[dev-relaunch] Missing scripts\dev-launch.ps1"
    exit 1
  }
  Write-Host "[dev-relaunch] Check passed."
  exit 0
}

$stateDir = Join-Path $PSScriptRoot ".devstate"
$backendPidFile = Join-Path $stateDir "backend.pid"
$mobilePidFile = Join-Path $stateDir "mobile.pid"

if (-not (Test-Path $stateDir)) {
  New-Item -Path $stateDir -ItemType Directory -Force | Out-Null
}

function Read-PidFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return $null }
  $raw = (Get-Content -Path $Path -Raw).Trim()
  if (-not $raw) { return $null }
  $pidValue = 0
  if ([int]::TryParse($raw, [ref]$pidValue)) { return $pidValue }
  return $null
}

function Stop-PidIfRunning {
  param([int]$ProcessId, [string]$Label)
  if (-not $ProcessId) { return }
  try {
    $proc = Get-Process -Id $ProcessId -ErrorAction Stop
    Write-Host "[dev-relaunch] Killing $Label PID $ProcessId..."
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  } catch {
    Write-Host "[dev-relaunch] $Label PID $ProcessId was not running."
  }
}

function Stop-ListenersOnPort {
  param([int]$Port, [string]$Label)

  $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

  if (-not $listeners) {
    Write-Host "[dev-relaunch] Port $Port already free ($Label)."
    return
  }

  foreach ($procId in $listeners) {
    try {
      Stop-Process -Id $procId -Force -ErrorAction Stop
      Write-Host "[dev-relaunch] Killed $Label listener on port $Port (PID $procId)."
    } catch {
      Write-Host "[dev-relaunch] Could not kill $Label listener PID $procId on port $Port."
    }
  }
}

Write-Host "[dev-relaunch] Stopping previous backend/mobile processes..."

$backendPid = Read-PidFile -Path $backendPidFile
$mobilePid = Read-PidFile -Path $mobilePidFile

Stop-PidIfRunning -ProcessId $backendPid -Label "backend"
Stop-PidIfRunning -ProcessId $mobilePid -Label "mobile"

Write-Host "[dev-relaunch] Cleaning up fallback windows (if any)..."
Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowTitle -like "SocialApp Backend*" -or $_.MainWindowTitle -like "SocialApp Mobile*" } |
  ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }

Write-Host "[dev-relaunch] Ensuring backend/mobile dev ports are free..."
Stop-ListenersOnPort -Port 3001 -Label "backend"
Stop-ListenersOnPort -Port 8081 -Label "mobile"

Remove-Item -Path $backendPidFile -ErrorAction SilentlyContinue
Remove-Item -Path $mobilePidFile -ErrorAction SilentlyContinue

Write-Host "[dev-relaunch] Relaunching backend + mobile..."
& $launchScript
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if ($Reseed) {
  Start-Sleep -Seconds 3
  Write-Host "[dev-relaunch] Running dev reseed against local API..."
  & npm --prefix "$rootDir\backend" run dev:reseed
}

Write-Host "[dev-relaunch] Relaunch complete."
