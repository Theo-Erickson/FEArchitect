@echo off
rem Double-click to run the headless fight math for the baseline duel.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node --no-warnings src\preview.ts encounters\duel-01.json
echo.
pause
