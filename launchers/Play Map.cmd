@echo off
rem Double-click to open the map skirmish view. Starts the server if needed.
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node --no-warnings src\server.ts /src/game/index.html
pause
