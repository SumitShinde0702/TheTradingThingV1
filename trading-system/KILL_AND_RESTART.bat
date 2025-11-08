@echo off
echo ========================================
echo   Kill Old Processes and Restart
echo ========================================
echo.

echo Killing old processes...
taskkill /IM nofx-single.exe /F 2>nul
taskkill /IM nofx-multiagent.exe /F 2>nul
taskkill /IM nofx.exe /F 2>nul

echo Waiting 2 seconds...
timeout /t 2 /nobreak >nul

echo Checking port 8080...
netstat -ano | findstr :8080
if %errorlevel% == 0 (
    echo Port 8080 still in use! Finding process...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8080') do (
        echo Killing PID %%a
        taskkill /PID %%a /F 2>nul
    )
)

echo Checking port 8081...
netstat -ano | findstr :8081
if %errorlevel% == 0 (
    echo Port 8081 still in use! Finding process...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8081') do (
        echo Killing PID %%a
        taskkill /PID %%a /F 2>nul
    )
)

echo.
echo Waiting 1 second...
timeout /t 1 /nobreak >nul

echo.
echo ========================================
echo   Starting Fresh
echo ========================================
echo.
echo Starting Single-Agent (Port 8080)...
start "Single-Agent" cmd /k "cd /d %~dp0 && nofx-single.exe config-single.json"

timeout /t 2 /nobreak >nul

echo Starting Multi-Agent (Port 8081)...
start "Multi-Agent" cmd /k "cd /d %~dp0 && nofx-multiagent.exe config.json"

echo.
echo Done! Both systems should be starting...
echo.
echo Check the windows for:
echo   - "⚠️ Falling back to SQLite..." (good!)
echo   - "✅ Using SQLite for paper trading decision logging" (good!)
echo   - NOT "🔄 Restoring balance from latest Supabase record..." (bad!)
echo.
pause

