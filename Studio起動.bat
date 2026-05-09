@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo ========================================
echo   AppHarbor Studio
echo ========================================
echo.

REM Node.js の存在確認
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js がインストールされていません
    echo https://nodejs.org/ja からダウンロード・インストールしてください
    echo.
    pause
    exit /b 1
)

REM 依存パッケージのインストール（初回のみ）
if not exist node_modules (
    echo [Setup] 初回起動のため依存パッケージをインストールします
    echo         数分かかる場合があります...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install に失敗しました
        pause
        exit /b 1
    )
    echo.
    echo [Setup] インストール完了
    echo.
)

REM ブラウザを少し遅らせて自動で開く
echo [Studio] dev サーバーを起動中...
echo [Studio] 数秒後にブラウザで http://localhost:3100 を自動で開きます
echo.
echo [INFO] このウィンドウを閉じるか Ctrl+C で停止します
echo.
start "" cmd /c "timeout /t 6 /nobreak > nul && start http://localhost:3100"

call npm run dev

REM dev サーバーが終了した後はウィンドウを残す
echo.
echo [Studio] サーバーが停止しました
pause
