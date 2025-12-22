<# 
  Simple dev launcher for backend + frontend
  Pure ASCII to avoid encoding / parsing issues on some PowerShell setups.
#>

param()

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DEV LAUNCHER: backend + frontend" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Locate backend/frontend directories (script is in project root, backend/frontend are in rebuild\production)
$ScriptDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendPath  = Join-Path $ScriptDir "rebuild\production\backend"
$FrontendPath = Join-Path $ScriptDir "rebuild\production\frontend"

if (-not (Test-Path $BackendPath) -or -not (Test-Path $FrontendPath)) {
    Write-Host "ERROR: backend or frontend folder not found." -ForegroundColor Red
    Write-Host "Expected paths:" -ForegroundColor Red
    Write-Host "  Backend:  $BackendPath" -ForegroundColor Red
    Write-Host "  Frontend: $FrontendPath" -ForegroundColor Red
    exit 1
}

Write-Host "Script directory : $ScriptDir" -ForegroundColor DarkGray
Write-Host "Backend directory: $BackendPath" -ForegroundColor DarkGray
Write-Host "Frontend directory: $FrontendPath" -ForegroundColor DarkGray
Write-Host ""

function Test-CommandExists {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-InDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [scriptblock]$ScriptBlock
    )

    Push-Location $Path
    try {
        & $ScriptBlock
    }
    finally {
        Pop-Location
    }
}

### 1. Check Node.js
Write-Host "[1/5] Checking Node.js..." -ForegroundColor Yellow
if (-not (Test-CommandExists -Name "node")) {
    Write-Host "ERROR: Node.js not found. Please install Node.js (>= 18)." -ForegroundColor Red
    exit 1
} else {
    $nodeVersion = node -v
    Write-Host "Node.js version: $nodeVersion" -ForegroundColor Green
}
Write-Host ""

### 2. Start Docker services (Postgres + Redis) if possible
Write-Host "[2/5] Starting Docker services (if available)..." -ForegroundColor Yellow
if (Test-Path (Join-Path $BackendPath "docker-compose.yml")) {
    if (-not (Test-CommandExists -Name "docker")) {
        Write-Host "Docker not found. Please make sure DB and Redis are running manually." -ForegroundColor Yellow
    } else {
        Invoke-InDirectory -Path $BackendPath -ScriptBlock {
            $composeCmd = $null

            & docker compose version *> $null
            if ($LASTEXITCODE -eq 0) {
                $composeCmd = "docker compose"
            } elseif (Get-Command "docker-compose" -ErrorAction SilentlyContinue) {
                $composeCmd = "docker-compose"
            }

            if (-not $composeCmd) {
                Write-Host "Cannot find 'docker compose' or 'docker-compose'. Please start DB/Redis manually." -ForegroundColor Yellow
            } else {
                Write-Host "Running: $composeCmd up -d" -ForegroundColor DarkGray
                iex "$composeCmd up -d"
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "Docker containers started (Postgres + Redis)." -ForegroundColor Green
                } else {
                    Write-Host "WARNING: Docker containers may not have started correctly, please check docker-compose output." -ForegroundColor Yellow
                }
            }
        }
    }
} else {
    Write-Host "backend/docker-compose.yml not found, skip Docker step." -ForegroundColor Yellow
}
Write-Host ""

### 3. Backend env + dependencies + migrations
Write-Host "[3/7] Backend env / deps / migrations..." -ForegroundColor Yellow

Invoke-InDirectory -Path $BackendPath -ScriptBlock {
    # 3.1 Ensure .env exists
    $envFile = Join-Path (Get-Location) ".env"
    if (-not (Test-Path $envFile)) {
        $setupScript = Join-Path (Get-Location) "scripts\setup-env.ps1"
        if (Test-Path $setupScript) {
            Write-Host "backend .env not found. Running scripts\setup-env.ps1 ..." -ForegroundColor Yellow
            powershell -ExecutionPolicy Bypass -File $setupScript
        } else {
            Write-Host "backend .env not found and scripts\setup-env.ps1 missing. Please create backend\.env manually." -ForegroundColor Yellow
        }
    } else {
        Write-Host "backend .env already exists. Skip env generation." -ForegroundColor Green
    }

    # 3.2 Install backend dependencies
    if (-not (Test-Path "node_modules")) {
        Write-Host "backend node_modules not found, running npm install ..." -ForegroundColor Yellow
        npm install
    } else {
        Write-Host "backend node_modules exists. Skip npm install." -ForegroundColor Green
    }

    # 3.3 Run Prisma migrations
    Write-Host "Running: npm run prisma:migrate" -ForegroundColor Yellow
    npm run prisma:migrate
}
Write-Host ""

### 3.5 Wait for database to be ready
Write-Host "[4/7] Waiting for database to be ready..." -ForegroundColor Yellow
$script:maxRetries = 30
$script:retryCount = 0
$script:dbReady = $false

Invoke-InDirectory -Path $BackendPath -ScriptBlock {
    while ($script:retryCount -lt $script:maxRetries -and -not $script:dbReady) {
        try {
            $result = npm run check:db 2>&1 | Out-String
            if ($LASTEXITCODE -eq 0) {
                $script:dbReady = $true
                Write-Host "Database is ready!" -ForegroundColor Green
            } else {
                $script:retryCount++
                Write-Host "Waiting for database... ($($script:retryCount)/$($script:maxRetries))" -ForegroundColor DarkGray
                Start-Sleep -Seconds 2
            }
        } catch {
            $script:retryCount++
            Write-Host "Waiting for database... ($($script:retryCount)/$($script:maxRetries))" -ForegroundColor DarkGray
            Start-Sleep -Seconds 2
        }
    }
    
    if (-not $script:dbReady) {
        Write-Host "WARNING: Database may not be ready. Continuing anyway..." -ForegroundColor Yellow
    }
}
Write-Host ""

### 3.6 Seed database with test data
Write-Host "[5/7] Seeding database with test data..." -ForegroundColor Yellow
Invoke-InDirectory -Path $BackendPath -ScriptBlock {
    Write-Host "Running: npm run seed" -ForegroundColor Yellow
    npm run seed
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Database seeded successfully!" -ForegroundColor Green
    } else {
        Write-Host "WARNING: Database seeding may have failed. Check output above." -ForegroundColor Yellow
    }
}
Write-Host ""

### 4. Frontend dependencies
Write-Host "[6/7] Frontend dependencies..." -ForegroundColor Yellow
Invoke-InDirectory -Path $FrontendPath -ScriptBlock {
    if (-not (Test-Path "node_modules")) {
        Write-Host "frontend node_modules not found, running npm install ..." -ForegroundColor Yellow
        npm install
    } else {
        Write-Host "frontend node_modules exists. Skip npm install." -ForegroundColor Green
    }
}
Write-Host ""

### 5. Start dev servers
Write-Host "[7/7] Starting backend and frontend dev servers..." -ForegroundColor Yellow

Start-Process powershell -WorkingDirectory $BackendPath -ArgumentList @("-NoExit", "-Command", "npm run dev") | Out-Null
Write-Host "Backend dev server started in new PowerShell window (port 3000 by default)." -ForegroundColor Green

Start-Process powershell -WorkingDirectory $FrontendPath -ArgumentList @("-NoExit", "-Command", "npm run dev") | Out-Null
Write-Host "Frontend dev server started in new PowerShell window (port 5173 by default)." -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DONE. Check the new PowerShell windows for backend/frontend logs." -ForegroundColor Cyan
Write-Host "Backend:  http://localhost:3000" -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host "" -ForegroundColor Cyan
Write-Host "Default Accounts:" -ForegroundColor Yellow
Write-Host "  Developer Account: developer / 000000" -ForegroundColor Gray
Write-Host "  Test User 1:       testuser1 / Test1234!" -ForegroundColor Gray
Write-Host "  Test User 2:       testuser2 / Test1234!" -ForegroundColor Gray
Write-Host "  Test User 3:       testuser3 / Test1234!" -ForegroundColor Gray
Write-Host "  Demo Player:       demo_player / demo123" -ForegroundColor Gray
Write-Host "" -ForegroundColor Cyan
Write-Host "Developer Code: wskfz (for admin panels)" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan


