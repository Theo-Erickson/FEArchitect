@echo off
rem Double-click to build the FE8 terrain tiles for the map viewers. Put
rem "Feaws Tileset Collection.zip" at the repo root first (or drop the zip on this
rem file). Needs the FE8 ROM, the FEBuilder CLI and Generate Maps. Safe to re-run.
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node --no-warnings tools\assetgen\tilesets.ts %1
echo.
pause
