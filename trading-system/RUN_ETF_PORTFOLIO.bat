@echo off
echo ========================================
echo   ETF Portfolio System (7 Agents)
echo ========================================
echo.

cd /d %~dp0

echo Building ETF portfolio executable...
go build -o nofx-etf.exe
if errorlevel 1 (
    echo ❌ Build failed!
    pause
    exit /b 1
)

echo ✅ Build successful!
echo.
echo Starting ETF Portfolio System...
echo.
echo 📊 Portfolio Configuration:
echo    - 7 Agents (Qwen, OpenAI, Llama models)
echo    - Total Capital: 10,000 USDT
echo    - Per Agent: ~1,428.57 USDT
echo    - Port: 8082
echo.
echo 🌐 Access dashboard at: http://localhost:8082
echo 📈 Portfolio API: http://localhost:8082/api/portfolio
echo.

start cmd /k "title ETF Portfolio (Port 8082) && nofx-etf.exe config-etf-portfolio.json"

echo.
echo ✅ ETF Portfolio system started!
echo.
echo Press any key to close this window...
pause > nul
exit

