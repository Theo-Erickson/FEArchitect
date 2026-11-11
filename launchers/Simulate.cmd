@echo off
rem Double-click to run the baseline grid skirmish headlessly and print the log.
cd /d "%~dp0.."
node --no-warnings mcp\cli.ts simulate skirmish-01
echo.
pause
