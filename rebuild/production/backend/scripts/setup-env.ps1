# 环境配置快速设置脚本
# 用于创建 .env 文件（如果不存在）

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "环境配置快速设置" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$envFile = ".env"
$envExample = ".env.example"

# 检查 .env 文件是否存在
if (Test-Path $envFile) {
    Write-Host "✓ .env 文件已存在，跳过创建" -ForegroundColor Green
    Write-Host ""
    exit 0
}

# 如果 .env.example 存在，询问是否使用它作为模板
if (Test-Path $envExample) {
    Write-Host "✓ 找到 .env.example 模板文件" -ForegroundColor Green
    Write-Host ""
}

# 检查 docker-compose.yml 是否存在
$useDocker = $false
if (Test-Path "docker-compose.yml") {
    $useDocker = $true
    Write-Host "✓ 检测到 docker-compose.yml，将使用 Docker 配置" -ForegroundColor Green
}

Write-Host ""
Write-Host "正在创建 .env 文件..." -ForegroundColor Yellow

# 生成 JWT Secret（随机字符串）
$jwtSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
$jwtRefreshSecret = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })

# 创建 .env 文件内容
# 如果 .env.example 存在，先读取它作为模板
if (Test-Path $envExample) {
    Write-Host "从 .env.example 创建 .env 文件..." -ForegroundColor DarkGray
    $envContent = Get-Content $envExample -Raw
    
    # 替换 JWT Secret（如果模板中有占位符）
    $envContent = $envContent -replace 'JWT_SECRET="your-secret-key-change-this-in-production"', "JWT_SECRET=`"$jwtSecret`""
    $envContent = $envContent -replace 'JWT_REFRESH_SECRET="your-refresh-secret-key-change-this-in-production"', "JWT_REFRESH_SECRET=`"$jwtRefreshSecret`""
}
else {
    # 如果没有 .env.example，使用默认配置
    $envContent = @"
# 数据库配置
DATABASE_URL="postgresql://game_user:game_password@localhost:5432/game_db?schema=public"

# Redis配置
REDIS_URL="redis://localhost:6379"

# 服务器配置
PORT=3000
NODE_ENV=development

# JWT配置（自动生成）
JWT_SECRET="$jwtSecret"
JWT_REFRESH_SECRET="$jwtRefreshSecret"
JWT_EXPIRES_IN="1h"
JWT_REFRESH_EXPIRES_IN="7d"

# 前端URL
FRONTEND_URL="http://localhost:5173"

# 密码重置配置
RESET_PASSWORD_TOKEN_EXPIRES_IN="1h"

# 文件上传配置
UPLOAD_DIR="./uploads"
MAX_FILE_SIZE=5242880

# 管理员账号配置（可选）
ADMIN_USERNAME="developer"
ADMIN_DEFAULT_PASSWORD="000000"
"@
}

# 写入文件
$envContent | Out-File -FilePath $envFile -Encoding utf8 -NoNewline

Write-Host "✓ .env 文件已创建" -ForegroundColor Green
Write-Host ""

# 检查 Docker 容器状态
if ($useDocker) {
    Write-Host "检查 Docker 容器状态..." -ForegroundColor Yellow
    $containers = docker ps -a --format "{{.Names}}" 2>$null
    
    if ($containers -match "game-postgres") {
        $postgresRunning = docker ps --format "{{.Names}}" | Select-String "game-postgres"
        if ($postgresRunning) {
            Write-Host "✓ PostgreSQL 容器运行中" -ForegroundColor Green
        }
        else {
            Write-Host "⚠ PostgreSQL 容器存在但未运行" -ForegroundColor Yellow
            Write-Host "  启动命令: docker-compose up -d postgres" -ForegroundColor Gray
        }
    }
    else {
        Write-Host "⚠ PostgreSQL 容器不存在" -ForegroundColor Yellow
        Write-Host "  启动命令: docker-compose up -d postgres" -ForegroundColor Gray
    }
    
    if ($containers -match "game-redis") {
        $redisRunning = docker ps --format "{{.Names}}" | Select-String "game-redis"
        if ($redisRunning) {
            Write-Host "✓ Redis 容器运行中" -ForegroundColor Green
        }
        else {
            Write-Host "⚠ Redis 容器存在但未运行" -ForegroundColor Yellow
            Write-Host "  启动命令: docker-compose up -d redis" -ForegroundColor Gray
        }
    }
    else {
        Write-Host "⚠ Redis 容器不存在（可选）" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "下一步操作" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. 启动数据库服务（如果使用 Docker）:" -ForegroundColor Yellow
Write-Host "   docker-compose up -d postgres redis" -ForegroundColor Gray
Write-Host ""
Write-Host "2. 运行数据库迁移:" -ForegroundColor Yellow
Write-Host "   npm run prisma:migrate" -ForegroundColor Gray
Write-Host ""
Write-Host "3. 验证配置:" -ForegroundColor Yellow
Write-Host "   npm run check:db" -ForegroundColor Gray
Write-Host ""
Write-Host "4. 重新运行测试:" -ForegroundColor Yellow
Write-Host "   cd ../../各阶段测试用/第一阶段+第二阶段连续测试" -ForegroundColor Gray
Write-Host "   .\test-phase1-2.ps1" -ForegroundColor Gray
Write-Host ""

