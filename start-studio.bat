@echo off
chcp 65001 >nul 2>&1
title AppHarbor Studio

:menu
cls
echo.
echo  ========================================
echo   AppHarbor Studio Launcher
echo  ========================================
echo.

:: --- Port status ---
set "pid3200="
set "pid3100="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3200 " ^| findstr LISTENING 2^>nul') do set "pid3200=%%p"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3100 " ^| findstr LISTENING 2^>nul') do set "pid3100=%%p"

if defined pid3200 (
    echo   DEV  localhost:3200  [RUNNING  PID:%pid3200%]
) else (
    echo   DEV  localhost:3200  [stopped]
)
if defined pid3100 (
    echo   PROD localhost:3100  [RUNNING  PID:%pid3100%]
) else (
    echo   PROD localhost:3100  [stopped]
)

echo.
echo  ----------------------------------------
echo   [1] Start Dev    (localhost:3200, hot-reload)
echo   [2] Start Prod   (localhost:3100, build + start)
echo   [3] Start Both   (3200 + 3100)
echo   [4] Rebuild Prod (stop 3100, build, start)
echo   [5] Stop All     (shutdown 3200 + 3100)
echo  ----------------------------------------
echo.

set /p choice="  Select [1-5]: "

if "%choice%"=="1" goto dev
if "%choice%"=="2" goto prod
if "%choice%"=="3" goto both
if "%choice%"=="4" goto rebuild
if "%choice%"=="5" goto stop
echo.
echo  Invalid choice.
timeout /t 2 /nobreak >nul
goto menu

:: -----------------------------------------------
:dev
echo.
echo  Killing any existing process on port 3200...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3200 " ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%p /T /F >nul 2>&1
    echo  Stopped PID %%p
)
echo.
echo  Starting dev server on port 3200...
echo  (Ctrl+C to stop -- window will return to menu)
echo.
call npm run dev
echo.
echo  Dev server stopped.
pause
goto menu

:: -----------------------------------------------
:prod
echo.
echo  Killing any existing process on port 3100...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3100 " ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%p /T /F >nul 2>&1
    echo  Stopped PID %%p
)
echo.
echo  Building prod server...
call npm run build
if errorlevel 1 (
    echo.
    echo  [ERROR] Build failed.
    pause
    goto menu
)
echo.
echo  Starting prod server on port 3100...
echo  (Ctrl+C to stop -- window will return to menu)
echo.
call npm run start
echo.
echo  Prod server stopped.
pause
goto menu

:: -----------------------------------------------
:both
echo.
echo  Killing any existing process on port 3200...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3200 " ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%p /T /F >nul 2>&1
    echo  Stopped PID %%p
)
echo  Starting dev server in background window...
start "Studio Dev :3200" cmd /k "chcp 65001 >nul && cd /d %~dp0 && call npm run dev"

echo.
echo  Killing any existing process on port 3100...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3100 " ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%p /T /F >nul 2>&1
    echo  Stopped PID %%p
)
echo  Building prod server...
call npm run build
if errorlevel 1 (
    echo.
    echo  [ERROR] Build failed. Dev server (3200) is still running.
    pause
    goto menu
)
echo.
echo  Starting prod server on port 3100...
echo  (Ctrl+C to stop -- window will return to menu)
echo.
call npm run start
echo.
echo  Prod server stopped.
pause
goto menu

:: -----------------------------------------------
:rebuild
echo.
echo  Killing any existing process on port 3100...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3100 " ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%p /T /F >nul 2>&1
    echo  Stopped PID %%p
)
echo  Killing any existing process on port 3200...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3200 " ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%p /T /F >nul 2>&1
    echo  Stopped PID %%p
)
echo.
echo  Rebuilding prod server...
call npm run build
if errorlevel 1 (
    echo.
    echo  [ERROR] Build failed.
    pause
    goto menu
)
echo.
echo  Starting prod server on port 3100...
echo  (Ctrl+C to stop -- window will return to menu)
echo.
call npm run start
echo.
echo  Prod server stopped.
pause
goto menu

:: -----------------------------------------------
:stop
echo.
set "stopped=0"
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3200 " ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%p /T /F >nul 2>&1
    echo  Stopped PID %%p  (port 3200)
    set "stopped=1"
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3100 " ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%p /T /F >nul 2>&1
    echo  Stopped PID %%p  (port 3100)
    set "stopped=1"
)
if "%stopped%"=="0" (
    echo  No servers running.
)
echo.
timeout /t 2 /nobreak >nul
goto menu
