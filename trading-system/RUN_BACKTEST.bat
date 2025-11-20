    @echo off
echo ========================================
echo   Auto-Close Strategy Backtest - ALL TRADERS
echo ========================================
echo.

cd /d %~dp0

echo Running backtest for ALL traders...
echo.

set TRADERS=qwen_trader_single openai_trader_single qwen_trader_multi openai_trader_multi

for %%T in (%TRADERS%) do (
    echo.
    echo ========================================
    echo   Testing: %%T
    echo ========================================
    echo.
    
    set LOG_DIR=decision_logs\%%T
    call :test_trader %%T
)

goto :end

:test_trader
set TRADER_ID=%~1
set LOG_DIR=decision_logs\%TRADER_ID%

if exist "%LOG_DIR%" (
    echo Running backtest for: %TRADER_ID%
    echo Log directory: %LOG_DIR%
    echo.
    
    cd cmd\backtest
    go run main.go -trader %TRADER_ID% -dir ..\..\%LOG_DIR%
    cd ..\..
    
    echo.
    echo ✅ Completed: %TRADER_ID%
    echo.
) else (
    echo ⚠️  Directory not found: %LOG_DIR%
    echo.
)
exit /b

:end

echo.
echo ========================================
echo   All Backtests Complete!
echo ========================================
echo.
echo Results saved to: decision_logs\*\backtest_*.json
echo.
echo Generating summary...
echo.

cd cmd\summarize
go run main.go
cd ..\..

echo.
echo ========================================
echo   Summary Complete!
echo ========================================
echo.
pause

