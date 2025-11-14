@echo off
echo ========================================
echo   Restarting Binance Real Trading Only
echo ========================================
echo.
echo This will:
echo   1. Stop all systems (paper + real)
echo   2. Rebuild Binance executable
echo   3. Start only Binance Real Trading
echo.
pause

cd /d %~dp0

echo.
echo Step 1: Stopping all systems...
taskkill /IM nofx-single.exe /F >nul 2>&1
taskkill /IM nofx-multiagent.exe /F >nul 2>&1
taskkill /IM nofx-etf.exe /F >nul 2>&1
taskkill /IM nofx-binance-real.exe /F >nul 2>&1
taskkill /IM nofx.exe /F >nul 2>&1
echo ✅ All systems stopped.

echo.
echo Step 2: Rebuilding Binance executable...
go build -o nofx-binance-real.exe
if errorlevel 1 (
    echo ❌ Build failed!
    pause
    exit /b 1
)
echo ✅ Build successful!

echo.
echo Step 3: Starting Binance Real Trading only...
echo.
echo 📊 Configuration:
echo    - Trader: Llama 3.1 8B Scalper
echo    - Initial Capital: 71.23 USDT
echo    - Scan Interval: 1 minute (faster!)
echo    - Port: 8083
echo.
echo 🌐 Access dashboard at: http://localhost:8083
echo.

start cmd /k "title Binance Real Trading (Port 8083) && nofx-binance-real.exe config-binance-real.json"

echo.
echo ✅ Binance Real Trading started!
echo.
echo 📋 Next Steps:
echo   1. Make sure you've transferred funds to Futures
echo   2. Check terminal for balance confirmation
echo   3. Watch for first trade (every 1 minute now!)
echo.
pause


