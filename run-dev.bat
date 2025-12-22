@echo off
REM 一键启动前后端（通过 PowerShell 调用 run-dev.ps1）

REM 切换到当前批处理所在目录（项目根目录）
cd /d "%~dp0"

REM 使用 PowerShell 执行脚本，自动绕过执行策略限制
powershell -NoProfile -ExecutionPolicy Bypass -File ".\run-dev.ps1"

pause

