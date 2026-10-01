@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title DailyNote Local Server
if not exist "%~dp0runtime\node.exe" (
  echo 포터블 런타임이 없습니다. 전체 Windows 압축파일을 다시 풀어 주세요.
  pause
  exit /b 1
)
set "NODE_OPTIONS="
set "PORT="
"%~dp0runtime\node.exe" "%~dp0scripts\portable-start.cjs"
if errorlevel 1 pause
endlocal
