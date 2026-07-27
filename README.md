# AI-Group1 智能体博弈系统

![Version](https://img.shields.io/badge/version-v2.0.0-blue)
![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Completion](https://img.shields.io/badge/completion-90%25-green)

## 🌟 项目简介
本项目是一个基于 AI 动态推演的博弈系统，支持多人在线协作。系统通过 AI 模型（如 DeepSeek、Gemini 或本地 LLM）生成游戏剧情，玩家输入决策后，AI 实时推演因果关系并影响全球博弈状态。

### 🎮 核心特性
- **AI 动态叙事**：每一局游戏都是唯一的，由 AI 实时生成
- **多人联机**：支持 3+ 玩家实时在线博弈 + 局域网自动发现
- **智能恢复**：AI 中断自动检测和恢复机制
- **Fog of War**：基于置信度的对手情报系统
- **完整帮助**：全页面帮助系统，开发者可编辑
- **主持人工具**：动态时限调整、权限管理、高级视图
- **任务系统**：动态生成的挑战与主支线任务
- **策略分析**：对历史博弈数据进行多维度策略评估
- **全栈技术**：Node.js 后端 + React 前端 + Prisma 数据库

### 🏆 最新功能 (v2.0.0)
- ✅ **游戏核心增强**：7个主要功能改进完成
- ✅ **AI系统优化**：5分钟超时 + 自动重试机制
- ✅ **局域网联机**：UDP广播自动发现游戏服务器
- ✅ **智能恢复系统**：游戏异常自动检测和恢复
- ✅ **Fog of War情报**：置信度驱动的对手信息系统
- ✅ **完整帮助系统**：全页面覆盖 + 开发者编辑功能
- ✅ **UI统一优化**：界面汉化 + 导航增强 + 滚动支持

---

## 🚀 快速启动

### 1. 环境准备
- **Node.js**: >= 18.x
- **Docker**: 用于运行 PostgreSQL 和 Redis (可选，可通过本地环境代替)

### 2. 一键启动 (推荐)
在根目录下直接双击运行：
```powershell
run-dev.bat
```
该脚本会自动：
- 检查环境
- 启动容器 (若有 Docker)
- 安装前后端依赖
- 执行数据库迁移与种子填充 (npm run seed)
- 启动开发服务器

### 3. 说明文档
- **玩家操作手册**：查看 [docs/guides/player_manual.md](./docs/guides/player_manual.md)
- **主持人操作手册**：查看 [docs/guides/host_manual.md](./docs/guides/host_manual.md)
- **开发报告文档**：查看 [docs/reports/README.md](./docs/reports/README.md)
- **多人联机演示指南**：查看 [docs/三人联机演示脚本.md](./docs/三人联机演示脚本.md)
- **快捷功能介绍**：查看 [tools/快捷双击功能介绍.md](./tools/快捷双击功能介绍.md)
- **项目完整报告**：查看 [docs/项目结项与完善成功性报告.md](./docs/项目结项与完善成功性报告.md)

### 4. 仅前端展示
如果只需要展示前端页面，不启动 Docker、PostgreSQL、Redis 或后端服务，直接双击根目录的 `run-frontend.bat`。该入口会开启前端展示模式，跳过登录页，直接进入首页。

启动后访问 `http://localhost:5173`。首页等静态内容可以直接展示；登录、房间、AI 推演等真实交互仍需要后端 API 服务。普通 `npm run dev` 不会开启该模式，仍然保留登录保护。

---

## 🛠 开发规范与结构

### 目录说明
- `rebuild/production/backend`: 后端核心，包含所有 API 和 WebSocket 逻辑。
- `rebuild/production/frontend`: 前端核心，基于 React + AntD + Glassmorphism。
- `tools/`: 各种维护脚本（清理、初始化、数据库检查）。
- `docs/`: 核心文档资产。
- `rebuild/test-phases/`: 15 个阶段的自动化测试脚本。

### 开发规范
- **禁止使用 Emoji** (代码与注释中)。
- **命名规范**：变量/函数使用 `camelCase`。
- **一功能一文件**：严禁过度拆分，保持模块内敛。

---

## 🧪 测试验收
进入 `rebuild/test-phases/` 对应阶段文件夹，运行 `.ps1` 脚本进行验收。
例如验收第 12 阶段（交易系统）：
```powershell
cd rebuild/test-phases/phase12-tests
./test-phase12.ps1
```

---

## 📄 默认账户信息
| 角色 | 用户名 | 密码 | 说明 |
| :--- | :--- | :--- | :--- |
| 开发者 | `developer` | `000000` | 拥有管理员权限 |
| 玩家1 | `testuser1` | `Test1234!` | 预设测试账号 |
| 玩家2 | `testuser2` | `Test1234!` | 预设测试账号 |

---

© 2024 AI-Group1 | 由 Antigravity 强力驱动
