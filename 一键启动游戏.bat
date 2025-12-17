@echo off
chcp 65001
cls
echo ========================================================
echo       正在全自动配置《凡墙皆是门》运行环境
echo ========================================================
echo.

:: 1. Check Python
echo [Step 1] Checking Python...
python --version
if errorlevel 1 goto NoPython

:: 2. Check Node
echo [Step 2] Checking Node.js...
call npm --version
if errorlevel 1 goto NoNode

:: 3. Backend Setup
echo [Step 3] Setting up Backend...
cd 后端
if not exist "requirements.txt" goto BackendError
:: Try installing quietly, but show error if fails
echo   (Installing dependencies if needed...)
python -m pip install -r requirements.txt
if errorlevel 1 echo [WARN] Pip install reported errors, trying to proceed...

echo   (Starting Backend Server in new window...)
start "Backend Server" cmd /k "python main.py"
cd ..

:: 4. Frontend Setup
echo [Step 4] Setting up Frontend...
cd 前端
if not exist "package.json" goto FrontendError

if not exist "node_modules" (
    echo   (Found no node_modules, running npm install...)
    call npm install
)

echo   (Starting Frontend Server in new window...)
start "Frontend Server" cmd /k "npm run dev"

:: 5. Launch Browser
echo [Step 5] Launching Browser...
echo Waiting 5 seconds for servers to start...
timeout /t 5

start http://localhost:5173

echo.
echo ========================================================
echo                  启动完成 (Success)
echo ========================================================
echo.
echo  - 后端窗口已开启
echo  - 前端窗口已开启
echo  - 浏览器正在打开 http://localhost:5173
echo.
echo 按任意键退出本窗口...
pause
exit

:NoPython
echo.
echo [ERROR] 严重错误：未找到 Python 命令！
echo 请安装 Python 3.10+ 并确保勾选 "Add to PATH"。
pause
exit

:NoNode
echo.
echo [ERROR] 严重错误：未找到 npm 命令！
echo 请安装 Node.js (LTS 版本)。
pause
exit

:BackendError
echo.
echo [ERROR] 找不到后端目录或 requirements.txt！
pause
exit

:FrontendError
echo.
echo [ERROR] 找不到前端目录或 package.json！
pause
exit
