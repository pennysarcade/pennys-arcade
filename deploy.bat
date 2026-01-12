@echo off
cd /d "%~dp0"
echo Deploying to Railway...
railway up
echo.
echo Deploy triggered! Check Railway dashboard for build status.
pause
