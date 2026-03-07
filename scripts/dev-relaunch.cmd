@echo off
set "ARGS=%*"
if /I "%~1"=="--check" set "ARGS=-Check"
if /I "%~1"=="--reseed" set "ARGS=-Reseed"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-relaunch.ps1" %ARGS%
exit /b %ERRORLEVEL%
