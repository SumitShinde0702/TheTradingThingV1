@echo off
echo ========================================
echo   FRESH START - Delete All Old Data
echo ========================================
echo.
echo This will delete ALL SQLite databases and JSON files
echo to start completely fresh from 10000 USDT
echo.
echo WARNING: This will delete all trading history!
echo.
pause

cd /d %~dp0

echo.
echo Deleting SQLite databases...
if exist "decision_logs" (
    for /d %%d in (decision_logs\*) do (
        echo Deleting databases in %%d...
        del /q "%%d\*.db" 2>nul
        del /q "%%d\*.db-wal" 2>nul
        del /q "%%d\*.db-shm" 2>nul
        echo ✅ Deleted SQLite files in %%d
    )
) else (
    echo ⚠️  decision_logs folder not found
)

echo.
echo ✅ All SQLite databases deleted!
echo.
echo Next steps:
echo   1. Stop both backends (Ctrl+C)
echo   2. Restart both backends
echo   3. They will start fresh from 10000 USDT
echo   4. New cycle #1 will be created
echo.
pause

