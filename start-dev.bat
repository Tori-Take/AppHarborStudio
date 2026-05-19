@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo.
echo  ========================================
echo   AppHarbor Studio Launcher
echo  ========================================
echo.
echo   [1] Dev    port 3200  (hot reload / coding)
echo   [2] Prod   port 3100  (fast / demo) * build required
echo   [3] Both   3200 + 3100
echo.

set /p choice="  Select [1-3]: "

if "%choice%"=="1" goto dev
if "%choice%"=="2" goto prod
if "%choice%"=="3" goto both
echo Invalid choice.
pause
exit /b 1

:dev
echo.
echo  Starting dev server on localhost:3200 ...
start "Studio Dev :3200" cmd /k "chcp 65001 >nul && cd /d %~dp0 && npm run dev"
timeout /t 8 /nobreak >nul
start "" "http://localhost:3200"
goto end

:prod
echo.
echo  Killing existing process on port 3100 (if any) ...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :3100 ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%p /T /F >nul 2>&1
)
echo  Building Studio ...
call npm run build
if errorlevel 1 (
    echo.
    echo  [ERROR] Build failed. Fix errors and retry.
    pause
    exit /b 1
)
echo.
echo  Starting prod server on localhost:3100 ...
start "Studio Prod :3100" cmd /k "chcp 65001 >nul && cd /d %~dp0 && npm run start"
timeout /t 4 /nobreak >nul
start "" "http://localhost:3100"
goto end

:both
echo.
echo  Starting dev server on localhost:3200 ...
start "Studio Dev :3200" cmd /k "chcp 65001 >nul && cd /d %~dp0 && npm run dev"
echo.
echo  Killing existing process on port 3100 (if any) ...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :3100 ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%p /T /F >nul 2>&1
)
echo  Building Studio for prod ...
call npm run build
if errorlevel 1 (
    echo.
    echo  [ERROR] Build failed. Dev server (3200) is still running.
    pause
    exit /b 1
)
echo.
echo  Starting prod server on localhost:3100 ...
start "Studio Prod :3100" cmd /k "chcp 65001 >nul && cd /d %~dp0 && npm run start"
timeout /t 4 /nobreak >nul
start "" "http://localhost:3200"
start "" "http://localhost:3100"
goto end

:end
echo.
echo  Done.
