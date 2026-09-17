@echo off
chcp 65001 >nul
setlocal EnableExtensions
set "ROOT=%~dp0"

echo Stopping Smart Resume services (no restart) ...

echo [1/3] Stopping frontend on :3000 ...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo   kill PID %%a
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 >nul

echo [2/3] Stopping backend on :8000 ...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    echo   kill PID %%a
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 >nul

echo [3/3] Stopping Redis on :6379 ...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":6379 " ^| findstr "LISTENING"') do (
    echo   kill PID %%a
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 >nul

echo Done. All three services stopped.
echo   :3000 free - %ROOT%frontend dev server stopped
echo   :8000 free - backend API stopped
echo   :6379 free - Redis stopped
endlocal
