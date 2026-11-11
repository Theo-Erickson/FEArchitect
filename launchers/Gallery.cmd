@echo off
rem Double-click to open the FE asset gallery in your browser.
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node --no-warnings gallery\server.ts
pause
