@echo off
chcp 65001 >nul
REM 填充测试数据（双击运行）

REM 切换到后端目录
cd /d "%~dp0..\rebuild\production\backend"

echo ========================================
echo 填充测试数据
echo ========================================
echo.
echo 正在填充测试账号和初始数据...
echo.

REM 运行种子脚本
call npm run seed

echo.
pause

