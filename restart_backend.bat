@echo off
chcp 65001 >nul
setlocal EnableExtensions
set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"
set "REDIS_EXE=D:\Redis-x64-3.0.504\redis-server.exe"
set "LOG_DIR=%ROOT%logs"

:: locate managed node + npm (avoids the Windows Store npm stub)
set "NODE_EXE="
for /d %%d in ("C:\Users\fu\.workbuddy\binaries\node\versions\*") do (
    if exist "%%d\node.exe" if exist "%%d\node_modules\npm\bin\npm-cli.js" set "NODE_EXE=%%d\node.exe"
)
if not defined NODE_EXE (
    echo ERROR: managed node.exe + npm not found under C:\Users\fu\.workbuddy\binaries\node\versions\
    pause
    exit /b 1
)
set "NPM_CLI=%NODE_EXE:\node.exe=%\node_modules\npm\bin\npm-cli.js"

:: logs dir so each service window also writes to a file (readable if a window closes)
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1

echo [1/6] Stopping old backend on :8000 ...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    echo   kill PID %%a
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 >nul

echo [2/6] Stopping old frontend on :3000 ...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo   kill PID %%a
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 >nul

echo [3/6] Ensuring Redis is up ...
netstat -ano 2>nul | findstr ":6379 " | findstr "LISTENING" >nul
if errorlevel 1 (
    if exist "%REDIS_EXE%" (
        echo   Redis not running, starting ...
        start "SmartResume-Redis" "%REDIS_EXE%" --port 6379
    ) else (
        echo   WARNING: Redis not found at %REDIS_EXE% - auth/optimize endpoints will fail.
    )
) else (
    echo   Redis already running.
)
timeout /t 2 >nul

echo [4/6] Starting backend (uvicorn reload) ...
if not exist "%BACKEND_DIR%\.venv\Scripts\python.exe" (
    echo   ERROR: venv not found at %BACKEND_DIR%\.venv\Scripts\python.exe
    pause
    exit /b 1
)
start "SmartResume-Backend" /D "%BACKEND_DIR%" "%BACKEND_DIR%\.venv\Scripts\python.exe" run.py

echo [5/6] Starting frontend (next dev) ...
if not exist "%FRONTEND_DIR%\node_modules" (
    echo   node_modules missing, installing deps (may take a while) ...
    pushd "%FRONTEND_DIR%"
    "%NODE_EXE%" "%NPM_CLI%" install --no-audit --no-fund
    popd
)
start "SmartResume-Frontend" /D "%FRONTEND_DIR%" "%NODE_EXE%" "%NPM_CLI%" run dev

echo [6/6] Verifying ports (polling up to 30s) ...
set "OKB="
set "OKF="
for /l %%t in (1,1,15) do (
    netstat -ano 2>nul | findstr ":8000 " | findstr "LISTENING" >nul && set "OKB=1"
    netstat -ano 2>nul | findstr ":3000 " | findstr "LISTENING" >nul && set "OKF=1"
    if defined OKB if defined OKF goto :done
    timeout /t 2 >nul
)
:done
if defined OKB (echo   [OK]   backend  listening on :8000) else (echo   [FAIL] backend  not listening on :8000)
if defined OKF (echo   [OK]   frontend listening on :3000) else (echo   [FAIL] frontend not listening on :3000)
echo.
echo Done. Backend/Frontend run in their own windows (SmartResume-Backend / SmartResume-Frontend).
echo   Backend : http://127.0.0.1:8000    (docs: /docs)
echo   Frontend: http://localhost:3000
echo.
pause
endlocal
