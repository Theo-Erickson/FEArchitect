@echo off
rem Double-click to print the Tier 1 math preview for the baseline duel.
cd /d "%~dp0"
node --no-warnings mcp\cli.ts preview duel-01
echo.
pause
