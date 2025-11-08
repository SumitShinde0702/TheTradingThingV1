@echo off
echo ========================================
echo   Delete SQLite Databases (Fresh Start)
echo ========================================
echo.
echo This will delete all SQLite database files to start fresh from 10000 USDT
echo.
pause

echo Deleting SQLite databases...
cd /d %~dp0

REM Delete all .db, .db-wal, .db-shm files in decision_logs folder
if exist "decision_logs" (
    echo Found decision_logs folder, deleting databases...
    del /s /q "decision_logs\*\*.db" 2>nul
    del /s /q "decision_logs\*\*.db-wal" 2>nul
    del /s /q "decision_logs\*\*.db-shm" 2>nul
    echo ✅ Deleted all SQLite database files
) else (
    echo ⚠️  decision_logs folder not found (might be first run)
)

echo.
echo ✅ Done! All SQLite databases deleted.
echo.
echo Next steps:
echo   1. Restart both backends
echo   2. They will start fresh from 10000 USDT
echo   3. New cycle #1 will be created
echo.
pause

