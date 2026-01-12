@echo off
title Penny's Arcade

echo.
echo   ========================================
echo        PENNY'S ARCADE - Starting...
echo   ========================================
echo.

cd /d "%~dp0"

:: Kill any existing processes on our ports
echo Clearing previous instances...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo Done.
echo.

:: Install/update dependencies
echo Checking dependencies...
call npm install --silent
echo.

:: Start the dev server in background and open Chrome after a short delay
echo Starting servers...
echo   - Frontend: http://localhost:5173
echo   - Backend:  http://localhost:3001
echo.
echo Press Ctrl+C to stop the servers.
echo.

:: Open Chrome after 3 seconds (gives server time to start)
start "" cmd /c "timeout /t 3 /nobreak >nul && start chrome http://localhost:5173"

:: Run the dev server (this will keep the window open)
npm run dev
