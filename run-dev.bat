@echo off
chcp 65001 >nul
title AI-Group1 一键启动器

REM 确定项目根目录的绝对路径，处理可能存在的空格
set "BATCH_DIR=%~dp0"
set "CORE_SCRIPT=%BATCH_DIR%tools\run-dev.ps1"

echo ========================================
echo 开发环境启动脚本 (环境一致性自检)
echo ========================================
echo.

REM 简单存在性检查
if not exist "%CORE_SCRIPT%" (
    echo [错误] 找不到核心启动脚本！
    echo 期待路径: "%CORE_SCRIPT%"
    echo.
    pause
    exit /b 1
)

echo [1/3] 正在调起核心逻辑...

REM 优先尝试 pwsh (PowerShell 7)，因为其对中文编码支持更佳
where pwsh >nul 2>&1
if %ERRORLEVEL% equ 0 (
    pwsh.exe -NoProfile -ExecutionPolicy Bypass -File "%CORE_SCRIPT%"
) else (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%CORE_SCRIPT%"
)

if %ERRORLEVEL% neq 0 (
    echo.
    echo [错误] 执行过程中发生异常，请检查控制台输出 (Error Code: %ERRORLEVEL%)
    echo.
    pause
)
