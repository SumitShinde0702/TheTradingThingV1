@echo off
echo ========================================
echo   Stopping All Paper Trading Systems
echo ========================================
echo.
echo This will stop:
echo   - Single-Agent (Port 8080)
echo   - Multi-Agent (Port 8081)
echo   - ETF Portfolio (Port 8082)
echo.
echo Binance Real Trading (Port 8083) will continue running.
echo.
pause

cd /d %~dp0

echo.
echo Stopping paper trading systems...
taskkill /IM nofx-single.exe /F >nul 2>&1
taskkill /IM nofx-multiagent.exe /F >nul 2>&1
taskkill /IM nofx-etf.exe /F >nul 2>&1
taskkill /IM nofx.exe /F >nul 2>&1

echo.
echo ✅ All paper trading systems stopped!
echo.
echo Binance Real Trading (Port 8083) is still running.
echo.
pause


