@echo off
rem Double-click to launch the FEArchitect editor. Starts the local server,
rem which opens your browser. Close this window to stop the editor.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node --no-warnings src\server.ts
pause
