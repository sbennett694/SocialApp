@echo off
set "ARGS=%*"
if /I "%~1"=="--check" set "ARGS=-Check"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-launch.ps1" %ARGS%
exit /b %ERRORLEVEL%
