@echo off
REM Quick reset without prompts - for automation
cd /d %~dp0

echo Resetting ETF Portfolio...

taskkill /IM nofx-etf.exe /F >nul 2>&1

set AGENTS=qwen_single openai_single qwen_multi openai_multi llama_scalper llama_analyzer gpt20b_fast

if exist "decision_logs" (
    for %%a in (%AGENTS%) do (
        if exist "decision_logs\%%a" (
            del /q "decision_logs\%%a\*.db" 2>nul
            del /q "decision_logs\%%a\*.db-wal" 2>nul
            del /q "decision_logs\%%a\*.db-shm" 2>nul
        )
    )
)

go build -o nofx-etf.exe >nul 2>&1

start cmd /k "title ETF Portfolio (Port 8082) && nofx-etf.exe config-etf-portfolio.json"

echo ✅ ETF Portfolio reset and restarted!

