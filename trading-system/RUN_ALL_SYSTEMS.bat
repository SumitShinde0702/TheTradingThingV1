@echo off
echo ========================================
echo   Running All Trading Systems
echo ========================================
echo.
echo This will start:
echo   1. Single-Agent System (Paper) - Port 8080
echo   2. Multi-Agent System (Paper) - Port 8081
echo   3. ETF Portfolio (Paper) - Port 8082
echo   4. Binance Real Trading - Port 8083
echo.
echo ⚠️  Make sure you've configured Binance API keys in config-binance-real.json!
echo.
pause

cd /d %~dp0

echo.
echo Step 1: Building all executables...
go build -o nofx-single.exe
go build -o nofx-multiagent.exe
go build -o nofx-etf.exe
go build -o nofx-binance-real.exe
echo ✅ All executables built!

echo.
echo Step 2: Starting all systems...
echo.

echo Starting Single-Agent (Paper) on port 8080...
start cmd /k "title Single-Agent (Paper - Port 8080) && nofx-single.exe config-single.json"

timeout /t 2 /nobreak >nul

echo Starting Multi-Agent (Paper) on port 8081...
start cmd /k "title Multi-Agent (Paper - Port 8081) && nofx-multiagent.exe config.json"

timeout /t 2 /nobreak >nul

echo Starting ETF Portfolio (Paper) on port 8082...
start cmd /k "title ETF Portfolio (Paper - Port 8082) && nofx-etf.exe config-etf-portfolio-rebalanced.json"

timeout /t 2 /nobreak >nul

echo Starting Binance Real Trading on port 8083...
start cmd /k "title Binance Real Trading (Port 8083) && nofx-binance-real.exe config-binance-real.json"

echo.
echo ========================================
echo   ✅ All Systems Started!
echo ========================================
echo.
echo 📊 Access Dashboards:
echo   - Single-Agent: http://localhost:8080
echo   - Multi-Agent: http://localhost:8081
echo   - ETF Portfolio: http://localhost:8082
echo   - Binance Real: http://localhost:8083
echo.
echo 🔍 Frontend will show all systems combined
echo.
echo ⚠️  Remember:
echo   - Ports 8080-8082 = Paper Trading (no real money)
echo   - Port 8083 = REAL Binance Trading (real money!)
echo.
pause


