$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
$FrontendPath = Join-Path $RootDir 'rebuild\production\frontend'

Write-Host '========================================' -ForegroundColor Cyan
Write-Host 'AI-Group1 Frontend Showcase' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

if (-not (Test-Path -LiteralPath (Join-Path $FrontendPath 'package.json'))) {
    Write-Host 'ERROR: frontend package.json was not found.' -ForegroundColor Red
    Write-Host "Expected path: $FrontendPath" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'ERROR: Node.js was not found. Node.js 18 or newer is required.' -ForegroundColor Red
    exit 1
}

$nodeVersion = node -v
Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
Write-Host "Frontend: $FrontendPath" -ForegroundColor DarkGray
Write-Host ''

$envFile = Join-Path $FrontendPath '.env'
$requiredSettings = @(
    'VITE_API_BASE_URL=http://localhost:3000/api',
    'VITE_WS_URL=http://localhost:3000',
    'VITE_APP_TITLE=AI Interactive Game',
    'VITE_APP_VERSION=1.0.0',
    'VITE_ENABLE_DEVTOOLS=true',
    'VITE_ENABLE_MOCK=false',
    'VITE_FRONTEND_SHOWCASE=true'
)
if (-not (Test-Path -LiteralPath $envFile)) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($envFile, ($requiredSettings -join [Environment]::NewLine) + [Environment]::NewLine, $utf8NoBom)
    Write-Host 'Created frontend .env for localhost API configuration.' -ForegroundColor Green
} else {
    $envLines = @(Get-Content -LiteralPath $envFile)
    foreach ($setting in $requiredSettings) {
        $key = $setting.Split('=')[0]
        $settingIndex = -1
        for ($index = 0; $index -lt $envLines.Count; $index++) {
            if ($envLines[$index] -match ('^' + [regex]::Escape($key) + '=')) {
                $settingIndex = $index
                break
            }
        }
        if ($settingIndex -ge 0) {
            $envLines[$settingIndex] = $setting
        } else {
            $envLines += $setting
        }
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($envFile, ($envLines -join [Environment]::NewLine) + [Environment]::NewLine, $utf8NoBom)
    Write-Host 'Frontend .env is configured for showcase mode. Login is bypassed for this launcher.' -ForegroundColor Green
}

Push-Location $FrontendPath
try {
    if (-not (Test-Path -LiteralPath 'node_modules')) {
        Write-Host 'Installing frontend dependencies...' -ForegroundColor Yellow
        npm ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) {
            throw "npm ci failed with exit code $LASTEXITCODE."
        }
    } else {
        Write-Host 'Frontend dependencies are already installed.' -ForegroundColor Green
    }

    Write-Host ''
    Write-Host 'Frontend URL: http://localhost:5173' -ForegroundColor Green
    Write-Host 'Showcase mode is enabled. The login page is bypassed for this launcher.' -ForegroundColor Green
    Write-Host 'This entry starts the frontend only. Backend features need the API service.' -ForegroundColor Yellow
    Write-Host 'Press Ctrl+C to stop the frontend.' -ForegroundColor DarkGray
    Write-Host ''

    npm run dev -- --host 0.0.0.0
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
