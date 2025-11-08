@echo off
echo ========================================
echo   Reset ETF Portfolio to Initial Capital
echo ========================================
echo.
echo This will:
echo   1. Kill the ETF portfolio backend
echo   2. Delete all SQLite databases for 7 agents
echo   3. Rebuild the executable
echo   4. Restart fresh from 1,428.57 USDT per agent
echo.
echo WARNING: This will delete all trading history!
echo.
pause

cd /d %~dp0

echo.
echo Step 1: Killing ETF portfolio backend...
taskkill /IM nofx-etf.exe /F >nul 2>&1
if errorlevel 1 (
    echo ⚠️  No running ETF portfolio process found (or already stopped)
) else (
    echo ✅ ETF portfolio backend stopped
)

echo.
echo Step 2: Deleting SQLite databases for all 7 ETF agents...
echo.

REM List of all ETF agent IDs
set AGENTS=qwen_single openai_single qwen_multi openai_multi llama_scalper llama_analyzer gpt20b_fast

if exist "decision_logs" (
    for %%a in (%AGENTS%) do (
        if exist "decision_logs\%%a" (
            echo Deleting databases for %%a...
            del /q "decision_logs\%%a\*.db" 2>nul
            del /q "decision_logs\%%a\*.db-wal" 2>nul
            del /q "decision_logs\%%a\*.db-shm" 2>nul
            echo ✅ Deleted databases for %%a
        ) else (
            echo ⚠️  decision_logs\%%a folder not found (will be created on first run)
        )
    )
) else (
    echo ⚠️  decision_logs folder not found (will be created on first run)
)

echo.
echo Step 3: Rebuilding ETF portfolio executable...
go build -o nofx-etf.exe
if errorlevel 1 (
    echo ❌ Build failed!
    pause
    exit /b 1
)
echo ✅ Build successful!

echo.
echo Step 4: Starting ETF Portfolio System fresh...
echo.
echo 📊 Portfolio Configuration:
echo    - 7 Agents (Qwen, OpenAI, Llama models)
echo    - Total Capital: 10,000 USDT
echo    - Per Agent: 1,428.57 USDT (fresh start)
echo    - Port: 8082
echo.

start cmd /k "title ETF Portfolio (Port 8082) && nofx-etf.exe config-etf-portfolio.json"

echo.
echo ========================================
echo   ✅ ETF Portfolio Reset Complete!
echo ========================================
echo.
echo All 7 agents have been reset to initial capital:
echo   - qwen_single: 1,428.57 USDT
echo   - openai_single: 1,428.57 USDT
echo   - qwen_multi: 1,428.57 USDT
echo   - openai_multi: 1,428.57 USDT
echo   - llama_scalper: 1,428.57 USDT
echo   - llama_analyzer: 1,428.57 USDT
echo   - gpt20b_fast: 1,428.57 USDT
echo.
echo Total Portfolio: 10,000 USDT
echo.
echo 🌐 Access dashboard at: http://localhost:8082
echo 📈 Portfolio API: http://localhost:8082/api/portfolio
echo.
echo The frontend will show all agents starting from cycle #1
echo.
pause

