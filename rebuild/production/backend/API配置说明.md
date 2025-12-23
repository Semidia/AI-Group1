# API配置说明

## bodyTemplate 正确格式

### DeepSeek API 配置示例

**正确的格式：**
```json
{
  "model": "deepseek-chat",
  "messages": [
    {
      "role": "system",
      "content": "你是一个专业的文字交互游戏主持人。"
    },
    {
      "role": "user",
      "content": "{{prompt}}"
    }
  ],
  "temperature": 0.7
}
```

**错误的格式（不要使用）：**
```json
{
  "model": "deepseek",
  {prompt}    // ❌ 格式错误：缺少 messages 字段，占位符位置不对
    {
      "role": "system",
      "content": "你是一个专业的文字交互游戏主持人。"
    }
  ],
  "temperature": 0.7
}
```

### OpenAI API 配置示例

```json
{
  "model": "gpt-3.5-turbo",
  "messages": [
    {
      "role": "system",
      "content": "你是一个游戏推演引擎，根据玩家的决策和游戏规则，生成游戏剧情和结果。"
    },
    {
      "role": "user",
      "content": "{{prompt}}"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 2000
}
```

### 关键点

1. **必须包含 `messages` 字段**：这是一个数组，包含对话消息
2. **占位符位置**：`{{prompt}}` 必须放在某个 message 的 `content` 字段中
3. **JSON 格式**：必须是有效的 JSON 格式
4. **占位符格式**：使用 `{{prompt}}` 或 `{{PROMPT}}`（不区分大小写）

### 占位符替换说明

系统会自动将 `{{prompt}}` 或 `{{PROMPT}}` 替换为实际的游戏推演 prompt，包括：
- 游戏规则
- 活跃事件
- 玩家决策
- 推演要求

### 验证配置

配置保存后，可以使用测试接口验证：
```
POST /api/test/ai
{
  "roomId": "your-room-id"
}
```

### 常见错误

1. **缺少 messages 字段**：会导致 API 调用失败
2. **占位符位置错误**：占位符必须在某个 message 的 content 中
3. **JSON 格式错误**：会导致配置无法解析
4. **占位符格式错误**：必须使用 `{{prompt}}` 格式，不能使用 `{prompt}` 或其他格式

