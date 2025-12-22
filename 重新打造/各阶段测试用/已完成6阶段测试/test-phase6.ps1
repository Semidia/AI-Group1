# 第六阶段自动化验收：游戏核心决策流程
param(
  [string]$BaseUrl = "http://localhost:3000"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " 第六阶段测试：游戏核心决策流程 + 管理员工具 " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$ErrorActionPreference = "Stop"

function Test-Step {
  param(
    [string]$Title,
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Title" -ForegroundColor Yellow

  try {
    & $Action
    Write-Host "✔ $Title" -ForegroundColor Green
  }
  catch {
    Write-Host "✗ $Title 失败：" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    throw
  }
}

# 1. 健康检查
Test-Step "1.1 检查后端健康状态 ($BaseUrl/health)" {
  $resp = Invoke-WebRequest -Uri "$BaseUrl/health" -UseBasicParsing
  if ($resp.StatusCode -ne 200) {
    throw "Health check failed with status code $($resp.StatusCode)"
  }
}

# 2. 登录 / 注册测试用户
$global:TestToken = $null
Test-Step "2.1 获取测试用户 Token (testuser_phase6)" {
  $loginBody = @{
    username = "testuser_phase6"
    password = "Test1234!"
  } | ConvertTo-Json

  try {
    $loginResp = Invoke-WebRequest -Uri "$BaseUrl/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -UseBasicParsing
  }
  catch {
    Write-Host "登录失败，尝试注册测试用户..." -ForegroundColor DarkYellow
    $registerBody = @{
      username = "testuser_phase6"
      password = "Test1234!"
      email    = "testuser_phase6@example.com"
    } | ConvertTo-Json
    Invoke-WebRequest -Uri "$BaseUrl/api/auth/register" -Method Post -Body $registerBody -ContentType "application/json" -UseBasicParsing | Out-Null
    $loginResp = Invoke-WebRequest -Uri "$BaseUrl/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -UseBasicParsing
  }

  $loginJson = $loginResp.Content | ConvertFrom-Json
  if (-not $loginJson.data -or -not $loginJson.data.token) {
    throw "登录响应中未找到 data.token 字段"
  }
  $global:TestToken = $loginJson.data.token
}

if (-not $global:TestToken) {
  Write-Host "未获取到 token，无法继续" -ForegroundColor Red
  exit 1
}

$authHeaders = @{
  Authorization = "Bearer $($global:TestToken)"
  "Content-Type" = "application/json"
}

# 3. 创建房间并完成主持人配置（借用 Phase5 能力）
$global:TestRoomId = $null
Test-Step "3.1 创建测试房间（用于决策流程）" {
  $roomBody = @{
    name       = "Phase6 Game Room"
    maxPlayers = 4
  } | ConvertTo-Json
  $roomResp = Invoke-WebRequest -Uri "$BaseUrl/api/rooms/create" -Method Post -Body $roomBody -Headers $authHeaders -ContentType "application/json" -UseBasicParsing
  $roomJson = $roomResp.Content | ConvertFrom-Json
  $global:TestRoomId = $roomJson.data.room_id
  if (-not $global:TestRoomId) { throw "创建房间响应中未找到 room_id" }
}

Test-Step "3.2 配置主持人参数（决策时限等）" {
  $body = @{
    totalDecisionEntities = 4
    humanPlayerCount      = 1
    aiPlayerCount         = 3
    decisionTimeLimit     = 3
    timeoutStrategy       = "auto_submit"
  } | ConvertTo-Json
  Invoke-WebRequest -Uri "$BaseUrl/api/rooms/$($global:TestRoomId)/host-config/players" -Method Post -Headers $authHeaders -Body $body -UseBasicParsing | Out-Null

  $rulesBody = @{ gameRules = "Phase6 决策流程测试规则" } | ConvertTo-Json
  Invoke-WebRequest -Uri "$BaseUrl/api/rooms/$($global:TestRoomId)/host-config/rules" -Method Post -Headers $authHeaders -Body $rulesBody -UseBasicParsing | Out-Null

  $validateBody = @{ status = "validated"; message = "ok" } | ConvertTo-Json
  Invoke-WebRequest -Uri "$BaseUrl/api/rooms/$($global:TestRoomId)/host-config/validate" -Method Post -Headers $authHeaders -Body $validateBody -UseBasicParsing | Out-Null

  Invoke-WebRequest -Uri "$BaseUrl/api/rooms/$($global:TestRoomId)/host-config/complete" -Method Post -Headers $authHeaders -UseBasicParsing | Out-Null
}

# 4. 开始游戏，创建 GameSession
$global:SessionId = $null
Test-Step "4.1 开始游戏并创建会话 (POST /api/game/{roomId}/start)" {
  $resp = Invoke-WebRequest -Uri "$BaseUrl/api/game/$($global:TestRoomId)/start" -Method Post -Headers $authHeaders -UseBasicParsing
  $json = $resp.Content | ConvertFrom-Json
  if (-not $json.data -or -not $json.data.sessionId) {
    throw "开始游戏响应中未找到 data.sessionId 字段"
  }
  $global:SessionId = $json.data.sessionId
}

Test-Step "4.2 获取会话信息 (GET /api/game/{sessionId})" {
  $resp = Invoke-WebRequest -Uri "$BaseUrl/api/game/$($global:SessionId)" -Method Get -Headers $authHeaders -UseBasicParsing
  $json = $resp.Content | ConvertFrom-Json
  if ($json.data.status -ne "playing") {
    throw "会话状态不是 playing: $($json.data.status)"
  }
}

# 5. 提交决策并查看状态
Test-Step "5.1 提交本回合决策 (POST /api/game/{sessionId}/decision)" {
  $body = @{
    round      = 1
    actionText = "这是 Phase6 自动化测试的决策内容"
  } | ConvertTo-Json
  Invoke-WebRequest -Uri "$BaseUrl/api/game/$($global:SessionId)/decision" -Method Post -Headers $authHeaders -Body $body -UseBasicParsing | Out-Null
}

Test-Step "5.2 获取第1回合决策状态 (GET /api/game/{sessionId}/round/1/decisions)" {
  $resp = Invoke-WebRequest -Uri "$BaseUrl/api/game/$($global:SessionId)/round/1/decisions" -Method Get -Headers $authHeaders -UseBasicParsing
  $json = $resp.Content | ConvertFrom-Json
  if (-not $json.data.actions -or $json.data.actions.Count -lt 1) {
    throw "未找到任何决策记录"
  }
}

# 6. 管理员工具与在线房间（使用默认开发者账号）
$global:AdminToken = $null
Test-Step "6.1 使用开发者账号登录 (开发者账号/000000)" {
  $loginBody = @{
    username = "开发者账号"
    password = "000000"
  } | ConvertTo-Json

  $loginResp = Invoke-WebRequest -Uri "$BaseUrl/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -UseBasicParsing
  $loginJson = $loginResp.Content | ConvertFrom-Json
  if (-not $loginJson.data -or -not $loginJson.data.token) {
    throw "开发者登录响应中未找到 data.token 字段"
  }
  $global:AdminToken = $loginJson.data.token
}

if (-not $global:AdminToken) {
  throw "未获取到开发者 token"
}

$adminHeaders = @{
  Authorization = "Bearer $($global:AdminToken)"
  "Content-Type" = "application/json"
}

Test-Step "6.2 查询在册用户列表 (GET /api/admin/users)" {
  $resp = Invoke-WebRequest -Uri "$BaseUrl/api/admin/users" -Method Get -Headers $adminHeaders -UseBasicParsing
  $json = $resp.Content | ConvertFrom-Json
  if (-not $json.data.users) {
    throw "在册用户列表为空或响应结构不正确"
  }
}

Test-Step "6.3 查询在线房间列表 (GET /api/admin/rooms)" {
  $resp = Invoke-WebRequest -Uri "$BaseUrl/api/admin/rooms" -Method Get -Headers $adminHeaders -UseBasicParsing
  $json = $resp.Content | ConvertFrom-Json
  if (-not $json.data.rooms) {
    throw "在线房间列表为空或响应结构不正确"
  }
}

Test-Step "6.4 使用管理员接口关闭第六阶段测试房间 (POST /api/admin/rooms/{roomId}/close)" {
  if (-not $global:TestRoomId) {
    throw "TestRoomId 未定义，无法关闭房间"
  }
  $resp = Invoke-WebRequest -Uri "$BaseUrl/api/admin/rooms/$($global:TestRoomId)/close" -Method Post -Headers $adminHeaders -UseBasicParsing
  $json = $resp.Content | ConvertFrom-Json
  if ($json.data.status -ne "closed") {
    throw "房间状态未更新为 closed: $($json.data.status)"
  }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "🎉 第六阶段测试通过（含管理员工具）" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green