@echo off
echo Opening Windows Firewall port 8080 for LIA API Server...
netsh advfirewall firewall add rule name="LIA API Server" dir=in action=allow protocol=TCP localport=8080
if %errorlevel% == 0 (
    echo.
    echo ✓ Firewall port 8080 opened successfully!
    echo.
    echo Your friend can now access the API at:
    echo   http://172.16.8.171:8080/api/competition
    echo.
) else (
    echo.
    echo ❌ Failed to open firewall port. Please run this script as Administrator.
    echo.
)
pause

