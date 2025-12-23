# How to Check API Connection Status

## Method 1: Use Test API Endpoint (Recommended)

### Test via API

**Test with Room ID:**
```bash
POST http://localhost:3000/api/test/ai
Content-Type: application/json

{
  "roomId": "your-room-id"
}
```

**Test with Direct Configuration:**
```bash
POST http://localhost:3000/api/test/ai
Content-Type: application/json

{
  "apiProvider": "deepseek",
  "apiEndpoint": "https://api.deepseek.com/v1/chat/completions",
  "apiHeaders": {
    "Authorization": "Bearer your-api-key"
  },
  "apiBodyTemplate": {
    "model": "deepseek-chat",
    "messages": [
      {
        "role": "system",
        "content": "You are a professional text-based game host."
      },
      {
        "role": "user",
        "content": "{{prompt}}"
      }
    ],
    "temperature": 0.7
  }
}
```

### Success Response Example
```json
{
  "status": "ok",
  "message": "AI API connection successful",
  "endpoint": "https://api.deepseek.com/v1/chat/completions",
  "provider": "deepseek",
  "response": "Connection successful",
  "duration": "1234ms",
  "timestamp": "2025-12-23T13:00:00.000Z"
}
```

### Failure Response Example
```json
{
  "status": "error",
  "message": "AI API connection failed",
  "endpoint": "https://api.deepseek.com/v1/chat/completions",
  "provider": "deepseek",
  "errorType": "authentication",
  "hint": "API key is invalid or expired, please check Authorization header",
  "duration": "500ms",
  "timestamp": "2025-12-23T13:00:00.000Z"
}
```

## Method 2: View Log Files

### View Full Log
```powershell
# In project root directory
cd rebuild\production\backend
Get-Content logs\combined.log -Tail 50
```

### View Error Log
```powershell
Get-Content logs\error.log -Tail 50
```

### Real-time Log Monitoring (Recommended)
```powershell
# Real-time log viewing, press Ctrl+C to stop
Get-Content logs\combined.log -Wait -Tail 20
```

### View Only AI-related Logs
```powershell
# View all AI-related logs
Select-String -Path logs\combined.log -Pattern "AI|inference|prompt|API" | Select-Object -Last 30
```

## Method 3: Check During Game Play

### Logs When Submitting Inference

When you click "Submit to AI" in the game, the logs should show:

1. **Submit Inference**
```
Submitting to AI for session xxx, round 1
```

2. **Configuration Info**
```
AI Config prepared for session xxx, round 1
endpoint: https://api.deepseek.com/v1/chat/completions
provider: deepseek
hasHeaders: true
hasBodyTemplate: true
```

3. **Start Inference**
```
Starting inference for session xxx, round 1
```

4. **Build Prompt**
```
Building prompt for session xxx, round 1
Built prompt for session xxx, round 1
```

5. **Call API**
```
Calling AI API (attempt 1/3): https://api.deepseek.com/v1/chat/completions
```

6. **Success or Failure**
```
AI inference completed for session xxx, round 1
```
or
```
Inference failed for session xxx, round 1
```

## Method 4: Use PowerShell Script for Real-time Monitoring

Use the monitoring script `monitor-api-logs.ps1`:

```powershell
cd rebuild\production\backend
.\monitor-api-logs.ps1
```

## Method 5: Check Inference Results

### Check Inference Results via API
```bash
GET http://localhost:3000/api/game/:sessionId/round/:round/inference-result
Authorization: Bearer your-token
```

### Response Example
```json
{
  "code": 200,
  "data": {
    "sessionId": "xxx",
    "round": 1,
    "status": "completed",
    "result": {
      "narrative": "Game narrative...",
      "outcomes": [...],
      "events": [...]
    },
    "completedAt": "2025-12-23T13:00:00.000Z"
  }
}
```

## Troubleshooting

### 1. No Logs Appearing
- Check if backend service is running
- Check if log file path is correct
- Check NODE_ENV environment variable (development mode outputs to console)

### 2. Error Logs but Don't Know Why
- Check `logs/error.log` for detailed error information
- Check if API configuration is correct
- Check network connection

### 3. Test Successful but No Output in Game
- Check if decision data is empty
- Check if bodyTemplate format is correct
- View detailed logs during inference process

## Quick Check Commands

```powershell
# 1. View latest AI-related logs
Select-String -Path rebuild\production\backend\logs\combined.log -Pattern "AI|inference" | Select-Object -Last 10

# 2. View recent errors
Get-Content rebuild\production\backend\logs\error.log -Tail 10

# 3. Real-time monitoring (recommended)
Get-Content rebuild\production\backend\logs\combined.log -Wait -Tail 30
```
