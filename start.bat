@echo off
chcp 65001 > nul
echo ===================================================
echo   TengeAlert Studio - Сервер и шлюз алертов для OBS
echo ===================================================

set NODE_BIN=""

if exist "C:\Users\rusta\AppData\Local\ms-playwright-go\1.57.0\node.exe" (
    set NODE_BIN="C:\Users\rusta\AppData\Local\ms-playwright-go\1.57.0\node.exe"
) else (
    where node >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        set NODE_BIN=node
    )
)

if %NODE_BIN%=="" (
    echo [ERROR] Node.js не найден на компьютере!
    pause
    exit /b 1
)

echo [OK] Запуск TengeAlert через Node.js: %NODE_BIN%
%NODE_BIN% website/server/server.js

pause
