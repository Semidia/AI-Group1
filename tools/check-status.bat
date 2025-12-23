<# 
  System Status Check (Launch from tools/)
#>

@echo off
chcp 65001 >nul

cd /d "%~dp0..\rebuild\production\backend"

echo ========================================
echo 项目运行状态检查
echo ========================================
echo.

call npm run check:status

echo.
pause
