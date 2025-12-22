# 第三阶段测试脚本 (PowerShell)
# 目标：房间系统基础流（创建/列表/加入/离开）

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "第三阶段测试：房间系统基础" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$API_BASE = "http://localhost:3000/api"

# 0. 健康检查
Write-Host "0. 健康检查..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$API_BASE/../health" -Method Get -TimeoutSec 5
    Write-Host "   ✓ 后端健康检查通过" -ForegroundColor Green
} catch {
    Write-Host "   ✗ 后端未启动，请先运行 backend" -ForegroundColor Red
    Write-Host "     启动命令：cd 重新打造/正式搭建/backend && npm run dev" -ForegroundColor Gray
    exit 1
}

Write-Host ""

# 准备测试数据
$user1 = "room_tester_$(Get-Random -Minimum 1000 -Maximum 9999)"
$user2 = "room_tester_b_$(Get-Random -Minimum 1000 -Maximum 9999)"
$password = "password123"
$email1 = "$user1@example.com"
$email2 = "$user2@example.com"
$token1 = $null
$token2 = $null
$roomId = $null

function Register-User {
    param($username, $email)
    $body = @{ username = $username; email = $email; password = $password } | ConvertTo-Json
    return Invoke-RestMethod -Uri "$API_BASE/auth/register" -Method Post -Body $body -ContentType "application/json"
}

function Login-User {
    param($username)
    $body = @{ username = $username; password = $password } | ConvertTo-Json
    return Invoke-RestMethod -Uri "$API_BASE/auth/login" -Method Post -Body $body -ContentType "application/json"
}

# 1. 注册用户A
Write-Host "1. 注册用户A..." -ForegroundColor Yellow
try {
    $resp = Register-User $user1 $email1
    if ($resp.data.token) {
        $token1 = $resp.data.token
        Write-Host "   ✓ 注册成功: $user1" -ForegroundColor Green
    } else { throw "注册响应缺少token" }
} catch {
    Write-Host "   ✗ 用户A注册失败: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 2. 注册用户B
Write-Host "2. 注册用户B..." -ForegroundColor Yellow
try {
    $resp = Register-User $user2 $email2
    if ($resp.data.token) {
        $token2 = $resp.data.token
        Write-Host "   ✓ 注册成功: $user2" -ForegroundColor Green
    } else { throw "注册响应缺少token" }
} catch {
    Write-Host "   ✗ 用户B注册失败: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 3. 登录用户A（房主）
Write-Host "3. 登录用户A..." -ForegroundColor Yellow
try {
    $resp = Login-User $user1
    $token1 = $resp.data.token
    Write-Host "   ✓ 登录成功: $user1" -ForegroundColor Green
} catch {
    Write-Host "   ✗ 用户A登录失败: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 4. 登录用户B（加入者）
Write-Host "4. 登录用户B..." -ForegroundColor Yellow
try {
    $resp = Login-User $user2
    $token2 = $resp.data.token
    Write-Host "   ✓ 登录成功: $user2" -ForegroundColor Green
} catch {
    Write-Host "   ✗ 用户B登录失败: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 5. 用户A 创建房间
Write-Host "5. 创建房间..." -ForegroundColor Yellow
try {
    $headersA = @{ "Authorization" = "Bearer $token1" }
    $body = @{
        name = "测试房间_$(Get-Random -Minimum 1000 -Maximum 9999)"
        max_players = 4
        game_mode = "competitive"
    } | ConvertTo-Json

    $resp = Invoke-RestMethod -Uri "$API_BASE/rooms/create" -Method Post -Headers $headersA -Body $body -ContentType "application/json"
    $roomId = $resp.data.room_id
    if (-not $roomId) { throw "响应未返回 room_id" }
    Write-Host "   ✓ 房间创建成功: $roomId" -ForegroundColor Green
} catch {
    Write-Host "   ✗ 创建房间失败: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 6. 获取房间列表
Write-Host "6. 获取房间列表..." -ForegroundColor Yellow
try {
    $resp = Invoke-RestMethod -Uri "$API_BASE/rooms/list" -Method Get
    $total = $resp.data.total
    Write-Host "   ✓ 房间列表返回，总数: $total" -ForegroundColor Green
} catch {
    Write-Host "   ✗ 获取房间列表失败: $($_.Exception.Message)" -ForegroundColor Red
}

# 7. 用户B 加入房间
Write-Host "7. 用户B 加入房间..." -ForegroundColor Yellow
try {
    $headersB = @{ "Authorization" = "Bearer $token2" }
    $resp = Invoke-RestMethod -Uri "$API_BASE/rooms/$roomId/join" -Method Post -Headers $headersB -ContentType "application/json"
    Write-Host "   ✓ 加入成功" -ForegroundColor Green
} catch {
    Write-Host "   ✗ 加入房间失败: $($_.Exception.Message)" -ForegroundColor Red
}

# 8. 用户B 离开房间
Write-Host "8. 用户B 离开房间..." -ForegroundColor Yellow
try {
    $headersB = @{ "Authorization" = "Bearer $token2" }
    $resp = Invoke-RestMethod -Uri "$API_BASE/rooms/$roomId/leave" -Method Post -Headers $headersB -ContentType "application/json"
    Write-Host "   ✓ 离开成功" -ForegroundColor Green
} catch {
    Write-Host "   ✗ 离开房间失败: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "测试完成" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "用户A: $user1 | 用户B: $user2 | 房间ID: $roomId" -ForegroundColor Gray

