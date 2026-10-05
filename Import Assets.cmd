@echo off
rem Double-click to import FE asset data and portraits from your clean ROM(s).
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node --no-warnings tools\assetgen\import.ts
echo.
pause
