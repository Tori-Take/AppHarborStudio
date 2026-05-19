@echo off
chcp 65001 >nul 2>&1
title AppHarbor Studio

echo.
echo  ========================================
echo   AppHarbor Studio Launcher
echo  ========================================
echo.
echo   [1] Dev Server   (localhost:3200)
echo   [2] Prod Server  (localhost:3100)  * build + start
echo   [3] Both         (3200 + 3100)
echo   [4] Rebuild Prod (stop, build, start)
echo.

set /p choice="  Select [1-4]: "

if "%choice%"=="1" goto dev
if "%choice%"=="2" goto prod
if "%choice%"=="3" goto both
if "%choice%"=="4" goto rebuild
echo Invalid choice.
pause
exit /b 1

:dev
echo.
echo  Starting dev server on port 3200...
echo  (Ctrl+C to stop)
echo.
npm run dev
goto end

:prod
echo.
echo  Building and starting prod server on port 3100...
echo.
npm run build && npm run start
goto end

:both
echo.
echo  Starting dev server (3200) in background...
start "Studio Dev" cmd /c "npm run dev"
echo  Building prod server (3100)...
npm run build && npm run start
goto end

:rebuild
echo.
echo  Stopping existing prod server on port 3100...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :3100 ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%p /T /F >nul 2>&1
)
echo  Rebuilding...
npm run build && npm run start
goto end

:end
