# Docker 生产环境配置说明

## 📁 已创建的文件

### 核心配置文件

1. **`docker-compose.prod.yml`** - 生产环境 Docker Compose 编排文件
   - 包含所有服务定义（PostgreSQL、Redis、后端、前端、Nginx）
   - 配置了健康检查、资源限制、网络隔离
   - 数据持久化配置

2. **`backend/Dockerfile`** - 后端 Dockerfile（已优化）
   - 多阶段构建（减小镜像体积）
   - 非 root 用户运行（安全）
   - 健康检查配置
   - 使用 dumb-init 处理信号

3. **`frontend/Dockerfile`** - 前端 Dockerfile（新建）
   - 多阶段构建（Node.js 构建 + Nginx 服务）
   - 静态文件优化
   - 健康检查配置

4. **`nginx/nginx.conf`** - Nginx 主配置文件
   - 基本配置
   - Gzip 压缩
   - 日志格式

5. **`nginx/conf.d/app.conf`** - Nginx 应用配置
   - 反向代理配置
   - WebSocket 支持（Socket.io）
   - 静态文件服务
   - 缓存配置

6. **`env.prod.example`** - 生产环境变量模板
   - 所有必需的环境变量
   - 包含注释说明

7. **`backend/.dockerignore`** - 后端构建忽略文件
8. **`frontend/.dockerignore`** - 前端构建忽略文件

9. **`DOCKER部署指南.md`** - 完整的部署文档

## 🚀 快速开始

### 1. 配置环境变量

```bash
# 复制模板
cp env.prod.example .env.prod

# 编辑并填写实际值（必须修改密码和密钥）
nano .env.prod
```

**必须修改的配置**：
- `POSTGRES_PASSWORD` - 数据库密码
- `REDIS_PASSWORD` - Redis 密码
- `JWT_SECRET` - 使用 `openssl rand -base64 32` 生成
- `JWT_REFRESH_SECRET` - 使用 `openssl rand -base64 32` 生成
- `AI_API_KEY` - AI 服务 API 密钥

### 2. 构建和启动

```bash
# 构建镜像
docker compose -f docker-compose.prod.yml --env-file .env.prod build

# 启动服务
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 查看状态
docker compose -f docker-compose.prod.yml ps

# 查看日志
docker compose -f docker-compose.prod.yml logs -f
```

### 3. 运行数据库迁移

```bash
docker compose -f docker-compose.prod.yml exec backend npm run prisma:migrate
```

### 4. 验证部署

```bash
# 健康检查
curl http://localhost/health
curl http://localhost:3000/health
```

## 📊 服务架构

```
用户请求
    ↓
Nginx (80/443) - 反向代理、静态文件服务
    ↓
├─→ 前端静态文件 (/)
├─→ 后端 API (/api)
└─→ WebSocket (/socket.io)
    ↓
后端服务 (3000)
    ↓
├─→ PostgreSQL (5432)
└─→ Redis (6379)
```

## 🔧 常用命令

### 服务管理

```bash
# 启动
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 停止
docker compose -f docker-compose.prod.yml stop

# 重启
docker compose -f docker-compose.prod.yml restart

# 停止并删除容器（数据保留）
docker compose -f docker-compose.prod.yml down

# 查看日志
docker compose -f docker-compose.prod.yml logs -f [service_name]
```

### 数据备份

```bash
# 备份 PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U game_user game_db > backup.sql

# 备份 Redis
docker compose -f docker-compose.prod.yml exec redis redis-cli SAVE
```

## 🔒 安全特性

1. ✅ 非 root 用户运行容器
2. ✅ 网络隔离（独立 Docker 网络）
3. ✅ 资源限制（CPU、内存）
4. ✅ 健康检查
5. ✅ 数据持久化（volumes）
6. ✅ 环境变量管理（敏感信息不硬编码）

## 📝 注意事项

1. **环境变量文件**: 使用 `--env-file .env.prod` 参数，或重命名为 `.env`
2. **端口冲突**: 确保 80、443、3000、5432、6379 端口未被占用
3. **数据备份**: 定期备份 PostgreSQL 和 Redis 数据
4. **SSL/HTTPS**: 生产环境建议配置 SSL 证书（参考部署指南）
5. **监控**: 建议配置监控系统（Prometheus + Grafana）

## 📚 更多信息

详细部署说明请参考：**`DOCKER部署指南.md`**

## 🎯 下一步

- [ ] 配置 SSL/HTTPS
- [ ] 设置监控系统
- [ ] 配置自动备份
- [ ] 设置 CI/CD 流程

---

**配置完成时间**: 2024年  
**配置版本**: v1.0


