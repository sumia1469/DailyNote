@echo off
setlocal
chcp 65001 >nul
set "DAILYNOTE_ROOT=%~dp0"
if exist "%DAILYNOTE_ROOT%Start_DailyNote.bat" goto create
set /p "DAILYNOTE_ROOT=DailyNote 압축을 푼 폴더 경로를 입력하세요: "
set "DAILYNOTE_ROOT=%DAILYNOTE_ROOT:"=%"
:create
if not exist "%DAILYNOTE_ROOT%\Start_DailyNote.bat" (
  echo Start_DailyNote.bat가 있는 폴더를 지정해 주세요.
  pause
  exit /b 1
)
if not exist "%DAILYNOTE_ROOT%\runtime\node.exe" (
  echo runtime 폴더까지 포함된 전체 압축파일이 필요합니다.
  pause
  exit /b 1
)
cscript //nologo "%DAILYNOTE_ROOT%\public\portable\create-shortcut.vbs" "%DAILYNOTE_ROOT%"
if errorlevel 1 (
  echo 바로가기 생성이 차단되었습니다. Start_DailyNote.bat를 직접 실행할 수 있습니다.
) else (
  echo 바탕화면에 DailyNote 바로가기를 만들었습니다.
)
pause
endlocal
