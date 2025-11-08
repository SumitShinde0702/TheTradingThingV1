@echo off
echo ========================================
echo   Single-Agent vs Multi-Agent Comparison
echo ========================================
echo.
echo Starting both systems...
echo.
echo Single-Agent: http://localhost:8080
echo Multi-Agent:  http://localhost:8081
echo.
echo Press Ctrl+C to stop both
echo.

REM Start single-agent in a new window
start "Single-Agent (Port 8080)" cmd /k "nofx-single.exe config-single.json"

REM Wait a bit for first one to start
timeout /t 2 /nobreak >nul

REM Start multi-agent in a new window
start "Multi-Agent (Port 8081)" cmd /k "nofx-multiagent.exe config.json"

echo.
echo Both systems are running!
echo.
echo To compare results:
echo   1. Open http://localhost:8080/api/competition (Single-Agent)
echo   2. Open http://localhost:8081/api/competition (Multi-Agent)
echo   3. Compare the equity curves and P&L
echo.
echo Press any key to exit this window (systems will keep running)...
pause >nul

