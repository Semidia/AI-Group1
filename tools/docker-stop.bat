@echo off
chcp 65001 >nul
REM 停止本地数据库 (Docker)

cd /d "%~dp0..\rebuild\production\backend"

echo ========================================
echo 正在停止 Docker 数据库服务...
echo ========================================

docker-compose stop

echo.
pause
