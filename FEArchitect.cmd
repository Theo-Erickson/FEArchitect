@echo off
rem Double-click to open the FEArchitect hub: a control panel in your browser that
rem lists every tool, explains when to use it, and starts it for you. The single
rem tool launchers live in the launchers\ folder if you prefer them.
rem Leave this window open while you work; closing it stops tools started from the hub.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node --no-warnings hub\server.ts
pause
