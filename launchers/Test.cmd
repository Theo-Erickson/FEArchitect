@echo off
rem Double-click to run the whole test suite.
cd /d "%~dp0.."
node --no-warnings --test
echo.
pause
