# Docker 生产环境部署指南

## 目录
- [前置要求](#前置要求)
- [快速开始](#快速开始)
- [详细配置](#详细配置)
- [部署步骤](#部署步骤)
- [维护和监控](#维护和监控)
- [故障排查](#故障排查)

## 前置要求

### 1. 服务器要求
- **操作系统**: Linux (推荐 Ubuntu 20.04+ 或 CentOS 8+)
- **CPU**: 至少 2 核
- **内存**: 至少 4GB RAM
- **磁盘**: 至少 20GB 可用空间
- **网络**: 公网 IP 和域名（可选，但推荐）

### 2. 软件要求
- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **Git**: 用于拉取代码

### 3. 安装 Docker 和 Docker Compose

#### Ubuntu/Debian
```bash
# 更新包索引
sudo apt-get update

# 安装依赖
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# 添加 Docker 官方 GPG 密钥
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# 设置仓库
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 安装 Docker Engine 和 Docker Compose
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 验证安装
docker --version
docker compose version
```

#### CentOS/RHEL
```bash
# 安装依赖
sudo yum install -y yum-utils

# 添加 Docker 仓库
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# 安装 Docker Engine 和 Docker Compose
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 启动 Docker
sudo systemctl start docker
sudo systemctl enable docker

# 验证安装
docker --version
docker compose version
```

## 快速开始

### 1. 克隆项目
```bash
git clone <your-repo-url>
cd 重新打造/正式搭建
```

### 2. 配置环境变量
```bash
# 复制环境变量模板
cp env.prod.example .env.prod

# 编辑环境变量（使用你喜欢的编辑器）
nano .env.prod
# 或
vim .env.prod
```

**重要**: 必须修改以下配置：
- `POSTGRES_PASSWORD`: 强密码
- `REDIS_PASSWORD`: 强密码
- `JWT_SECRET`: 使用 `openssl rand -base64 32` 生成
- `JWT_REFRESH_SECRET`: 使用 `openssl rand -base64 32` 生成
- `AI_API_KEY`: 你的 AI API 密钥
- `FRONTEND_URL`: 你的域名（如果有）

### 3. 构建和启动服务
```bash
# 构建镜像
docker compose -f docker-compose.prod.yml --env-file .env.prod build

# 启动所有服务（使用环境变量文件）
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 查看服务状态
docker compose -f docker-compose.prod.yml ps

# 查看日志
docker compose -f docker-compose.prod.yml logs -f
```

**注意**: 每次使用 docker compose 命令时都需要添加 `--env-file .env.prod` 参数，或者将 `.env.prod` 重命名为 `.env`（Docker Compose 会自动读取 `.env` 文件）。

### 4. 运行数据库迁移
```bash
# 进入后端容器
docker compose -f docker-compose.prod.yml exec backend sh

# 在容器内运行迁移
npm run prisma:migrate

# 退出容器
exit
```

### 5. 验证部署
```bash
# 检查健康状态
curl http://localhost/health
curl http://localhost:3000/health

# 检查服务状态
docker compose -f docker-compose.prod.yml ps
```

## 详细配置

### 环境变量说明

#### 数据库配置
- `POSTGRES_USER`: PostgreSQL 用户名（默认: game_user）
- `POSTGRES_PASSWORD`: PostgreSQL 密码（**必须修改**）
- `POSTGRES_DB`: 数据库名（默认: game_db）
- `POSTGRES_PORT`: PostgreSQL 端口（默认: 5432）

#### Redis 配置
- `REDIS_PASSWORD`: Redis 密码（**必须修改**）
- `REDIS_PORT`: Redis 端口（默认: 6379）

#### 应用配置
- `NODE_ENV`: 环境（production）
- `PORT`: 后端端口（默认: 3000）
- `FRONTEND_URL`: 前端 URL（用于 CORS）

#### JWT 配置
- `JWT_SECRET`: JWT 签名密钥（**必须修改，至少32字符**）
- `JWT_REFRESH_SECRET`: 刷新令牌密钥（**必须修改，至少32字符**）

#### AI API 配置
- `AI_API_KEY`: AI 服务 API 密钥
- `AI_API_URL`: AI 服务 API 地址

### 端口说明

- **80**: Nginx（前端和反向代理）
- **443**: HTTPS（如果配置了 SSL）
- **3000**: 后端 API（内部使用，不对外暴露）
- **5432**: PostgreSQL（内部使用，不对外暴露）
- **6379**: Redis（内部使用，不对外暴露）

### 数据持久化

所有数据存储在 Docker volumes 中：
- `postgres_data`: PostgreSQL 数据
- `redis_data`: Redis 数据
- `backend_logs`: 后端日志
- `frontend_logs`: Nginx 日志

**重要**: 定期备份 volumes！

## 部署步骤

### 完整部署流程

```bash
# 1. 准备服务器
# - 安装 Docker 和 Docker Compose
# - 配置防火墙（开放 80, 443 端口）
# - 配置域名 DNS（可选）

# 2. 克隆代码
git clone <your-repo-url>
cd 重新打造/正式搭建

# 3. 配置环境变量
cp env.prod.example .env.prod
# 编辑 .env.prod

# 4. 构建镜像
docker compose -f docker-compose.prod.yml --env-file .env.prod build

# 5. 启动服务
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 6. 运行数据库迁移
docker compose -f docker-compose.prod.yml exec backend npm run prisma:migrate

# 7. 验证部署
curl http://localhost/health
```

### 更新部署

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建镜像
docker compose -f docker-compose.prod.yml --env-file .env.prod build

# 3. 停止旧服务
docker compose -f docker-compose.prod.yml down

# 4. 启动新服务
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 5. 运行数据库迁移（如果有）
docker compose -f docker-compose.prod.yml exec backend npm run prisma:migrate
```

## 维护和监控

### 查看日志

```bash
# 查看所有服务日志
docker compose -f docker-compose.prod.yml logs -f

# 查看特定服务日志
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend
docker compose -f docker-compose.prod.yml logs -f postgres
docker compose -f docker-compose.prod.yml logs -f redis
```

### 服务管理

```bash
# 启动服务
docker compose -f docker-compose.prod.yml start

# 停止服务
docker compose -f docker-compose.prod.yml stop

# 重启服务
docker compose -f docker-compose.prod.yml restart

# 停止并删除容器（数据保留）
docker compose -f docker-compose.prod.yml down

# 停止并删除容器和 volumes（**危险：会删除数据**）
docker compose -f docker-compose.prod.yml down -v
```

### 备份数据

```bash
# 备份 PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U game_user game_db > backup_$(date +%Y%m%d_%H%M%S).sql

# 备份 Redis
docker compose -f docker-compose.prod.yml exec redis redis-cli --rdb /data/dump.rdb
docker compose -f docker-compose.prod.yml cp redis:/data/dump.rdb ./redis_backup_$(date +%Y%m%d_%H%M%S).rdb
```

### 恢复数据

```bash
# 恢复 PostgreSQL
cat backup_20240101_120000.sql | docker compose -f docker-compose.prod.yml exec -T postgres psql -U game_user game_db

# 恢复 Redis
docker compose -f docker-compose.prod.yml cp ./redis_backup_20240101_120000.rdb redis:/data/dump.rdb
docker compose -f docker-compose.prod.yml restart redis
```

## 故障排查

### 常见问题

#### 1. 服务无法启动
```bash
# 检查日志
docker compose -f docker-compose.prod.yml logs

# 检查服务状态
docker compose -f docker-compose.prod.yml ps

# 检查容器资源使用
docker stats
```

#### 2. 数据库连接失败
```bash
# 检查数据库是否运行
docker compose -f docker-compose.prod.yml ps postgres

# 检查数据库日志
docker compose -f docker-compose.prod.yml logs postgres

# 测试数据库连接
docker compose -f docker-compose.prod.yml exec backend npm run prisma:studio
```

#### 3. Redis 连接失败
```bash
# 检查 Redis 是否运行
docker compose -f docker-compose.prod.yml ps redis

# 测试 Redis 连接
docker compose -f docker-compose.prod.yml exec redis redis-cli ping
```

#### 4. 端口被占用
```bash
# 检查端口占用
netstat -tulpn | grep :80
netstat -tulpn | grep :3000

# 修改 docker-compose.prod.yml 中的端口映射
```

#### 5. 内存不足
```bash
# 检查内存使用
free -h
docker stats

# 调整 docker-compose.prod.yml 中的资源限制
```

### 健康检查

```bash
# 检查所有服务健康状态
docker compose -f docker-compose.prod.yml ps

# 手动健康检查
curl http://localhost/health
curl http://localhost:3000/health
```

### 性能优化

1. **调整资源限制**: 根据服务器配置修改 `docker-compose.prod.yml` 中的 `deploy.resources`
2. **启用缓存**: 确保 Redis 正常工作
3. **数据库优化**: 根据实际使用情况调整 PostgreSQL 配置
4. **Nginx 优化**: 调整 worker_processes 和 worker_connections

## SSL/HTTPS 配置（可选但推荐）

### 使用 Let's Encrypt

1. 安装 Certbot
2. 获取 SSL 证书
3. 修改 `nginx/conf.d/app.conf`，取消 HTTPS 服务器配置的注释
4. 将证书挂载到容器中

### 使用自签名证书（仅测试）

```bash
# 生成自签名证书
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout nginx/ssl/key.pem \
  -out nginx/ssl/cert.pem

# 在 docker-compose.prod.yml 中挂载证书目录
```

## 安全建议

1. **修改默认密码**: 确保所有密码都是强密码
2. **使用 HTTPS**: 在生产环境必须使用 HTTPS
3. **限制端口**: 只开放必要的端口（80, 443）
4. **定期更新**: 定期更新 Docker 镜像和系统
5. **备份数据**: 定期备份数据库和重要数据
6. **监控日志**: 定期检查日志，发现异常

## 下一步

- [ ] 配置 SSL/HTTPS
- [ ] 设置监控系统（Prometheus + Grafana）
- [ ] 配置日志收集系统
- [ ] 设置自动备份
- [ ] 配置 CI/CD 流程

---

**文档版本**: v1.0  
**最后更新**: 2024年  
**维护者**: 开发团队

