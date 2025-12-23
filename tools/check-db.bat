@echo off
chcp 65001 >nul
REM 数据库连接诊断工具 (Launch from tools/)

cd /d "%~dp0..\rebuild\production\backend"

echo ========================================
echo 数据库连接诊断工具
echo ========================================
echo.

call npm run check:db

echo.
pause
