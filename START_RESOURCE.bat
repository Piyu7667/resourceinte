@echo off
setlocal
cd /d "%~dp0"

title RE:SOURCE - One Click Start

echo ==============================================
echo          RE:SOURCE - ONE CLICK START
 echo ==============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not in PATH.
  echo Install Node.js LTS, restart Windows, and run this file again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo First run: installing project dependencies...
  echo This may take a few minutes. Please wait.
  echo.
  call npm install --legacy-peer-deps
  if errorlevel 1 (
    echo.
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

set NODE_ENV=development
set PORT=3000

echo.
echo Starting RE:SOURCE...
echo Keep this window open while using the application.
echo.

start "RE:SOURCE Browser" cmd /c "timeout /t 4 /nobreak >nul & start "" http://127.0.0.1:3000/"

call npm run dev

pause
