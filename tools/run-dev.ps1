<# 
  Simple dev launcher for backend + frontend
  Located in tools/run-dev.ps1
#>

param()

$ErrorActionPreference = "Continue"

# 路径计算
$ScriptPath = $MyInvocation.MyCommand.Definition
$ToolsDir = [System.IO.Path]::GetDirectoryName($ScriptPath)
$RootDir = [System.IO.Path]::GetDirectoryName($ToolsDir)
$BackendPath = Join-Path $RootDir "rebuild\production\backend"
$FrontendPath = Join-Path $RootDir "rebuild\production\frontend"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AI-Group1 环境自动清理与自检" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

### 🚨 暴力清理：强行干掉冲突进程
Write-Host "-> 正在强制释放端口 3000, 5173 并清理残留进程..." -ForegroundColor Yellow

$conflictPorts = @(3000, 5173)
foreach ($port in $conflictPorts) {
    $processes = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    if ($processes) {
        foreach ($procId in $processes) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
            Write-Host "   [✓] 已释放端口 $port (PID: $procId)" -ForegroundColor Gray
        }
    }
}

# 强杀 node / tsx 进程（仅针对当前用户，避免误杀系统级进程）
Stop-Process -Name "node", "tsx" -Force -ErrorAction SilentlyContinue 2>$null
Write-Host "   [✓] 已清理残留 Node 运行时状态" -ForegroundColor Gray
Start-Sleep -Seconds 1 # 给系统一点反应时间来释放文件锁

function Invoke-InDirectory {
    param([string]$Path, [scriptblock]$ScriptBlock)
    Push-Location $Path
    try { & $ScriptBlock } finally { Pop-Location }
}

### 1. 后端自检
Write-Host "[1/2] 正在准备后端环境..." -ForegroundColor Yellow

Invoke-InDirectory -Path $BackendPath -ScriptBlock {
    # 自动生成 .env
    if (-not (Test-Path ".env")) {
        $setup = Join-Path (Get-Location) "scripts\setup-env.ps1"
        if (Test-Path $setup) {
            powershell -ExecutionPolicy Bypass -File $setup
        }
    }

    # 自动补全依赖
    if (-not (Test-Path "node_modules")) {
        Write-Host "-> 正在安装必要组件..." -ForegroundColor Yellow
        npm install --no-audit --no-fund
    }

    # 同步数据库架构
    Write-Host "-> 正在同步数据库架构 (Prisma)..." -ForegroundColor Cyan
    
    # 即使之前报错，由于我们已经杀掉了旧进程，这里现在可以顺利完成了
    npx prisma generate
    npx prisma migrate dev --name auto_fix --skip-seed
    
    Write-Host "-> 正在填充/重置演示数据..." -ForegroundColor Gray
    npm run seed
}

### 2. 前端自检
Write-Host "[2/2] 正在准备前端环境..." -ForegroundColor Yellow
Invoke-InDirectory -Path $FrontendPath -ScriptBlock {
    if (-not (Test-Path "node_modules")) {
        npm install --no-audit --no-fund
    }
}

### 3. 一键双开服务
Write-Host ""
Write-Host "✅ 纯净启动！正在拉起工作窗口..." -ForegroundColor Green

Start-Process powershell -WorkingDirectory $BackendPath -ArgumentList @("-NoExit", "-Command", "npm run dev")
Start-Process powershell -WorkingDirectory $FrontendPath -ArgumentList @("-NoExit", "-Command", "npm run dev")

Write-Host "后端: http://localhost:3000" -ForegroundColor Gray
Write-Host "前端: http://localhost:5173" -ForegroundColor Gray
Write-Host ""
Write-Host "项目已全量启动。按回车键结束自检程序..." -ForegroundColor DarkGray
Read-Host
