# 第二阶段测试脚本 (PowerShell)
# 测试用户认证系统

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "第二阶段测试：用户认证系统" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$API_BASE = "http://localhost:3000/api"
$FRONTEND_URL = "http://localhost:5173"

# 检查服务状态
Write-Host "1. 检查服务状态..." -ForegroundColor Yellow

try {
    $healthCheck = Invoke-RestMethod -Uri "$API_BASE/../health" -Method Get -TimeoutSec 5
    Write-Host "   ✓ 后端服务运行正常" -ForegroundColor Green
} catch {
    Write-Host "   ✗ 后端服务未运行，请先启动后端服务" -ForegroundColor Red
    exit 1
}

try {
    $frontendCheck = Invoke-WebRequest -Uri $FRONTEND_URL -Method Get -TimeoutSec 5 -UseBasicParsing
    Write-Host "   ✓ 前端服务运行正常" -ForegroundColor Green
} catch {
    Write-Host "   ⚠ 前端服务未运行（可选）" -ForegroundColor Yellow
}

Write-Host ""

# 测试数据
$testUsername = "testuser_$(Get-Random -Minimum 1000 -Maximum 9999)"
$testEmail = "test_$(Get-Random -Minimum 1000 -Maximum 9999)@example.com"
$testPassword = "password123"
$token = $null

# 测试1: 用户注册
Write-Host "2. 测试用户注册..." -ForegroundColor Yellow
try {
    $registerData = @{
        username = $testUsername
        email = $testEmail
        password = $testPassword
    } | ConvertTo-Json

    $registerResponse = Invoke-RestMethod -Uri "$API_BASE/auth/register" `
        -Method Post `
        -Body $registerData `
        -ContentType "application/json"

    if ($registerResponse.code -eq 201 -and $registerResponse.data.token) {
        $token = $registerResponse.data.token
        Write-Host "   ✓ 注册成功" -ForegroundColor Green
        Write-Host "     用户名: $testUsername" -ForegroundColor Gray
        Write-Host "     邮箱: $testEmail" -ForegroundColor Gray
    } else {
        Write-Host "   ✗ 注册失败: $($registerResponse.message)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ✗ 注册失败: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "     响应: $responseBody" -ForegroundColor Gray
    }
    exit 1
}

Write-Host ""

# 测试2: 用户登录
Write-Host "3. 测试用户登录..." -ForegroundColor Yellow
try {
    $loginData = @{
        username = $testUsername
        password = $testPassword
    } | ConvertTo-Json

    $loginResponse = Invoke-RestMethod -Uri "$API_BASE/auth/login" `
        -Method Post `
        -Body $loginData `
        -ContentType "application/json"

    if ($loginResponse.code -eq 200 -and $loginResponse.data.token) {
        $token = $loginResponse.data.token
        Write-Host "   ✓ 登录成功" -ForegroundColor Green
    } else {
        Write-Host "   ✗ 登录失败: $($loginResponse.message)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ✗ 登录失败: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 测试3: 获取用户信息
Write-Host "4. 测试获取用户信息..." -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $token"
    }

    $userInfoResponse = Invoke-RestMethod -Uri "$API_BASE/user/info" `
        -Method Get `
        -Headers $headers

    if ($userInfoResponse.code -eq 200 -and $userInfoResponse.data) {
        Write-Host "   ✓ 获取用户信息成功" -ForegroundColor Green
        Write-Host "     用户ID: $($userInfoResponse.data.id)" -ForegroundColor Gray
        Write-Host "     用户名: $($userInfoResponse.data.username)" -ForegroundColor Gray
        Write-Host "     邮箱: $($userInfoResponse.data.email)" -ForegroundColor Gray
    } else {
        Write-Host "   ✗ 获取用户信息失败" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ✗ 获取用户信息失败: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 测试4: 更新用户信息
Write-Host "5. 测试更新用户信息..." -ForegroundColor Yellow
try {
    $updateData = @{
        nickname = "测试昵称_$(Get-Random -Minimum 1000 -Maximum 9999)"
    } | ConvertTo-Json

    $updateResponse = Invoke-RestMethod -Uri "$API_BASE/user/info" `
        -Method Put `
        -Body $updateData `
        -ContentType "application/json" `
        -Headers $headers

    if ($updateResponse.code -eq 200) {
        Write-Host "   ✓ 更新用户信息成功" -ForegroundColor Green
        Write-Host "     新昵称: $($updateResponse.data.nickname)" -ForegroundColor Gray
    } else {
        Write-Host "   ✗ 更新用户信息失败" -ForegroundColor Red
    }
} catch {
    Write-Host "   ✗ 更新用户信息失败: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# 测试5: Token刷新
Write-Host "6. 测试Token刷新..." -ForegroundColor Yellow
try {
    $refreshResponse = Invoke-RestMethod -Uri "$API_BASE/auth/refresh" `
        -Method Post `
        -Headers $headers

    if ($refreshResponse.code -eq 200 -and $refreshResponse.data.token) {
        $token = $refreshResponse.data.token
        Write-Host "   ✓ Token刷新成功" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Token刷新失败" -ForegroundColor Red
    }
} catch {
    Write-Host "   ✗ Token刷新失败: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# 测试6: 忘记密码
Write-Host "7. 测试忘记密码..." -ForegroundColor Yellow
try {
    $forgotPasswordData = @{
        email = $testEmail
    } | ConvertTo-Json

    $forgotPasswordResponse = Invoke-RestMethod -Uri "$API_BASE/auth/forgot-password" `
        -Method Post `
        -Body $forgotPasswordData `
        -ContentType "application/json"

    if ($forgotPasswordResponse.code -eq 200) {
        Write-Host "   ✓ 忘记密码请求成功" -ForegroundColor Green
        if ($forgotPasswordResponse.resetToken) {
            Write-Host "     重置Token: $($forgotPasswordResponse.resetToken)" -ForegroundColor Gray
        }
    } else {
        Write-Host "   ✗ 忘记密码请求失败" -ForegroundColor Red
    }
} catch {
    Write-Host "   ✗ 忘记密码请求失败: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# 测试7: 未授权访问
Write-Host "8. 测试未授权访问..." -ForegroundColor Yellow
try {
    $unauthorizedResponse = Invoke-RestMethod -Uri "$API_BASE/user/info" `
        -Method Get `
        -ErrorAction Stop
    Write-Host "   ✗ 未授权访问应该失败" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "   ✓ 未授权访问正确返回401" -ForegroundColor Green
    } else {
        Write-Host "   ⚠ 未授权访问返回: $($_.Exception.Response.StatusCode)" -ForegroundColor Yellow
    }
}

Write-Host ""

# 总结
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "测试完成！" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "测试账号信息:" -ForegroundColor Yellow
Write-Host "  用户名: $testUsername" -ForegroundColor Gray
Write-Host "  邮箱: $testEmail" -ForegroundColor Gray
Write-Host "  密码: $testPassword" -ForegroundColor Gray
Write-Host ""
Write-Host "请在前端界面进行手动测试:" -ForegroundColor Yellow
Write-Host "  1. 访问 $FRONTEND_URL/login 测试登录" -ForegroundColor Gray
Write-Host "  2. 访问 $FRONTEND_URL/register 测试注册" -ForegroundColor Gray
Write-Host "  3. 测试路由守卫和Token过期处理" -ForegroundColor Gray
Write-Host ""


