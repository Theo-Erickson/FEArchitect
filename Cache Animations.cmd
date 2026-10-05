@echo off
rem Double-click to pre-generate and cache every battle animation GIF so the
rem gallery Animations tab loads instantly. Safe to re-run: it skips what is
rem already cached.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node --no-warnings tools\assetgen\precache.ts
echo.
pause
