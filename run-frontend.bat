@echo off
chcp 65001 >nul 2>&1
title AI-Group1 Frontend Showcase

cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\run-frontend.ps1"

set EXIT_CODE=%ERRORLEVEL%
if not %EXIT_CODE% EQU 0 (
    echo.
    echo Frontend launcher failed with exit code %EXIT_CODE%.
    pause
)

exit /b %EXIT_CODE%
