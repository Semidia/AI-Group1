@echo off
chcp 65001 >nul
REM 启动本本地数据库 (Docker)

cd /d "%~dp0..\rebuild\production\backend"

echo ========================================
echo 正在通过 Docker 启动数据库服务...
echo ========================================

docker-compose up -d

echo.
echo 提示: 如果启动失败，请确保 Docker Desktop 已运行。
pause
