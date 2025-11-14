@echo off
echo ========================================
echo   Starting Binance Real Trading
echo ========================================
echo.
echo ⚠️  WARNING: This will trade with REAL MONEY!
echo.
echo Make sure you have:
echo   1. ✅ Added your Binance API keys to config-binance-real.json
echo   2. ✅ API keys have trading permissions enabled
echo   3. ✅ IP whitelist configured (recommended)
echo   4. ✅ Starting with small capital (2,000 USDT)
echo.
pause

cd /d %~dp0

echo.
echo Step 1: Building Binance real trading executable...
go build -o nofx-binance-real.exe
if errorlevel 1 (
    echo ❌ Build failed!
    pause
    exit /b 1
)

echo ✅ Build successful!
echo.
echo Step 2: Starting Binance Real Trading...
echo.
echo 📊 Configuration:
echo    - Trader: Llama 3.1 8B Scalper
echo    - Initial Capital: 2,000 USDT
echo    - Leverage: 7x (BTC/ETH), 7x (Altcoins)
echo    - Scan Interval: 2 minutes
echo    - Port: 8083
echo.
echo 🌐 Access dashboard at: http://localhost:8083
echo 📈 API: http://localhost:8083/api
echo.
echo ⚠️  Monitor closely - this is REAL trading!
echo.

start cmd /k "title Binance Real Trading (Port 8083) && nofx-binance-real.exe config-binance-real.json"

echo.
echo ✅ Binance Real Trading started!
echo.
echo 📋 Next Steps:
echo   1. Check the terminal window for startup logs
echo   2. Verify API connection is successful
echo   3. Monitor first trades closely
echo   4. Check dashboard at http://localhost:8083
echo.
echo Press any key to close this window...
pause > nul
exit


