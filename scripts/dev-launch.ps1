param(
  [switch]$Check
)

$ErrorActionPreference = "Stop"

$rootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendPackage = Join-Path $rootDir "backend\package.json"
$mobilePackage = Join-Path $rootDir "mobile\package.json"

if ($Check) {
  if (-not (Test-Path $backendPackage)) {
    Write-Host "[dev-launch] Missing backend\package.json"
    exit 1
  }
  if (-not (Test-Path $mobilePackage)) {
    Write-Host "[dev-launch] Missing mobile\package.json"
    exit 1
  }
  Write-Host "[dev-launch] Check passed."
  exit 0
}

$stateDir = Join-Path $PSScriptRoot ".devstate"
$backendPidFile = Join-Path $stateDir "backend.pid"
$mobilePidFile = Join-Path $stateDir "mobile.pid"

if (-not (Test-Path $stateDir)) {
  New-Item -Path $stateDir -ItemType Directory -Force | Out-Null
}

function Test-ProcessAlive {
  param([int]$ProcessId)
  try {
    Get-Process -Id $ProcessId -ErrorAction Stop | Out-Null
    return $true
  } catch {
    return $false
  }
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

function Write-PidFile {
  param([string]$Path, [int]$ProcessId)
  Set-Content -Path $Path -Value $ProcessId -Encoding ascii
}

function Start-DevWindow {
  param(
    [string]$Title,
    [string]$WorkingDirectory,
    [string]$Command
  )

  $proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/k", "title $Title && cd /d `"$WorkingDirectory`" && $Command" -PassThru
  return $proc.Id
}

$backendPort = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
$knownBackendPid = Read-PidFile -Path $backendPidFile

if ($backendPort) {
  Write-Host "[dev-launch] Port 3001 already in use by PID $($backendPort.OwningProcess). Skipping backend launch to avoid duplicates."
  Write-Host "[dev-launch] Use \"npm run dev:relaunch\" to force a clean restart."
} elseif ($knownBackendPid -and (Test-ProcessAlive -ProcessId $knownBackendPid)) {
  Write-Host "[dev-launch] Backend process from dev workflow already running (PID $knownBackendPid). Skipping duplicate launch."
} else {
  Write-Host "[dev-launch] Starting backend local API in a new terminal window..."
  $newBackendPid = Start-DevWindow -Title "SocialApp Backend" -WorkingDirectory (Join-Path $rootDir "backend") -Command "npm run local-api"
  Write-PidFile -Path $backendPidFile -ProcessId $newBackendPid
}

$knownMobilePid = Read-PidFile -Path $mobilePidFile
if ($knownMobilePid -and (Test-ProcessAlive -ProcessId $knownMobilePid)) {
  Write-Host "[dev-launch] Mobile process from dev workflow already running (PID $knownMobilePid). Skipping duplicate mobile launch."
} else {
  Write-Host "[dev-launch] Starting mobile Expo dev server in a new terminal window..."
  $newMobilePid = Start-DevWindow -Title "SocialApp Mobile" -WorkingDirectory (Join-Path $rootDir "mobile") -Command "npm run start"
  Write-PidFile -Path $mobilePidFile -ProcessId $newMobilePid
}

Write-Host "[dev-launch] Launch complete."
Write-Host '[dev-launch] Use "npm run dev:relaunch" for clean restart handling.'
