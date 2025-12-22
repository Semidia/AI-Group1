# First Four Phases Combined Test Script (PowerShell)
# Order: Phase 1/2 -> Phase 3 -> Phase 4 (WebSocket Minimal Real-time Subsystem)
$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "First Four Phases Combined Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$parentDir  = Split-Path $scriptRoot -Parent

$phase12 = Join-Path $scriptRoot "test-phase1-2.ps1"
# Find phase scripts by name under the parent directory to avoid hard-coding Chinese folder names
$phase3  = Get-ChildItem -Path $parentDir -Recurse -Filter "test-phase3.ps1" | Select-Object -First 1 -ExpandProperty FullName
$phase4  = Get-ChildItem -Path $parentDir -Recurse -Filter "test-phase4.ps1" | Select-Object -First 1 -ExpandProperty FullName

function Invoke-TestScript {
    param(
        [string]$path
    )
    $runner = Get-Command pwsh -ErrorAction SilentlyContinue
    if (-not $runner) {
        $runner = Get-Command powershell -ErrorAction SilentlyContinue
    }
    if (-not $runner) {
        Write-Host "✗ No available PowerShell executable found (pwsh/powershell)." -ForegroundColor Red
        exit 1
    }

    & $runner.Source -NoLogo -NoProfile -ExecutionPolicy Bypass -File $path
    return $LASTEXITCODE
}

function Run-Phase {
    param(
        [string]$label,
        [string]$path
    )

    if (-not (Test-Path $path)) {
        Write-Host "✗ Script not found: $path" -ForegroundColor Red
        exit 1
    }

    Write-Host "=== Starting $label ===" -ForegroundColor Magenta
    $exitCode = Invoke-TestScript -path $path
    if ($exitCode -is [array]) { $exitCode = $exitCode[-1] }
    [int]$exitCodeInt = $exitCode
    if ($exitCodeInt -ne 0) {
        Write-Host "✗ $label failed (exit code $exitCode), subsequent phases aborted" -ForegroundColor Red
        exit $exitCodeInt
    }
    Write-Host "=== Completed $label ===" -ForegroundColor Magenta
    Write-Host ""
}

Run-Phase -label "Phase 1/2 Continuous Test" -path $phase12
Run-Phase -label "Phase 3 Room Basic Flow Test" -path $phase3
Run-Phase -label "Phase 4 WebSocket Minimal Real-time Subsystem" -path $phase4

Write-Host "========================================" -ForegroundColor Green
Write-Host "All first four phases tests passed!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
