@echo off
rem Double-click to render FE8 chapter maps into the gallery cache. Safe to re-run:
rem it skips chapters already rendered.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node --no-warnings tools\assetgen\mapgen.ts
echo.
pause
