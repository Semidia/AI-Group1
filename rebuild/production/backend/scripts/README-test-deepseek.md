# DeepSeek API 连接测试说明

## 快速开始

### 方法1: 使用 API Key 直接测试（推荐）

```powershell
cd rebuild\production\backend\scripts
.\test-deepseek-api.ps1 -ApiKey "你的DeepSeek_API密钥"
```

### 方法2: 使用房间ID测试

如果你已经配置了房间的 API 设置，可以使用房间ID测试：

```powershell
.\test-deepseek-api.ps1 -RoomId "房间ID"
```

### 方法3: 指定后端地址

如果后端运行在其他地址：

```powershell
.\test-deepseek-api.ps1 -BaseUrl "http://localhost:3000" -ApiKey "你的API密钥"
```

## 测试内容

脚本会执行以下测试：

1. ✅ **后端服务检查** - 验证后端服务是否运行
2. ✅ **API 连接测试** - 发送测试请求到 DeepSeek API
3. ✅ **响应验证** - 检查 API 是否正常响应

## 预期结果

### 成功示例

```
========================================
 DeepSeek API 连接测试 
========================================

1. 检查后端服务状态...
   ✓ 后端服务运行正常

2. 测试 DeepSeek API 连接...
   使用提供的 API Key 进行测试
   正在发送测试请求...
   ✓ DeepSeek API 连接成功！

   详细信息:
   - 端点: https://api.deepseek.com/v1/chat/completions
   - 提供商: deepseek
   - 响应时间: 1234ms
   - 响应内容: 连接成功

   ✓ API 配置正确，可以正常使用！

========================================
 测试完成 
========================================
```

### 失败示例

如果 API Key 无效：

```
   ✗ 测试失败
   错误: The remote server returned an error: (401) Unauthorized.

   错误详情:
   - 状态: error
   - 消息: AI API连接失败
   - 错误类型: authentication
   - 提示: API密钥无效或已过期，请检查Authorization头
```

## 常见错误及解决方案

### 错误1: 后端服务未运行

```
✗ 后端服务未运行，请先启动后端服务
```

**解决方案**: 
```powershell
cd rebuild\production\backend
npm run dev
```

### 错误2: API 密钥无效

```
错误类型: authentication
提示: API密钥无效或已过期，请检查Authorization头
```

**解决方案**: 
- 检查 API Key 是否正确
- 确认 API Key 是否已过期
- 访问 [DeepSeek 官网](https://platform.deepseek.com/) 获取新的 API Key

### 错误3: 无法连接到 API 服务器

```
错误类型: connection
提示: 无法连接到API服务器，请检查endpoint地址和网络连接
```

**解决方案**: 
- 检查网络连接
- 确认 endpoint 地址是否正确: `https://api.deepseek.com/v1/chat/completions`
- 检查防火墙设置

### 错误4: 连接超时

```
错误类型: timeout
提示: 连接超时，请检查网络或增加超时时间
```

**解决方案**: 
- 检查网络连接速度
- 稍后重试
- 检查是否有代理设置

## 获取 DeepSeek API Key

1. 访问 [DeepSeek 平台](https://platform.deepseek.com/)
2. 注册/登录账号
3. 进入 API Keys 页面
4. 创建新的 API Key
5. 复制 API Key（格式类似: `sk-xxxxxxxxxxxxx`）

## 注意事项

- ⚠️ **不要将 API Key 提交到代码仓库**
- ⚠️ **API Key 有使用限制，请合理使用**
- ⚠️ **测试会消耗 API 额度，请谨慎使用**

## 相关文档

- [DeepSeek API 文档](https://platform.deepseek.com/api-docs/)
- [后端环境配置指南](../环境配置指南.md)
- [API 测试端点说明](../../src/routes/test.ts)


