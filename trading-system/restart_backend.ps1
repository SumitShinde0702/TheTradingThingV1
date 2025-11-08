# Quick Backend Restart Script
Write-Host "🔄 Restarting backend..." -ForegroundColor Yellow

# Find and stop existing backend processes
Write-Host "⏹️  Stopping existing backend processes..." -ForegroundColor Cyan
Get-Process | Where-Object { $_.ProcessName -eq "lia" -or $_.ProcessName -eq "lia.exe" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Rebuild the backend
Write-Host "🔨 Rebuilding backend..." -ForegroundColor Cyan
go build -o lia.exe
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Build successful!" -ForegroundColor Green
Write-Host ""
Write-Host "▶️  Starting backend..." -ForegroundColor Cyan
Write-Host "   (Press Ctrl+C to stop)" -ForegroundColor Gray
Write-Host ""

# Start the backend
Start-Process -FilePath ".\lia.exe" -NoNewWindow

Write-Host "✅ Backend started! Waiting 3 seconds for it to initialize..." -ForegroundColor Green
Start-Sleep -Seconds 3

# Test if it's running
try {
    $health = Invoke-RestMethod -Uri "http://localhost:8080/health" -Method Get -ErrorAction Stop
    Write-Host "✅ Backend is running and healthy!" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Backend started but health check failed. It may still be initializing." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎯 Backend should now have the /api/positions/close endpoint!" -ForegroundColor Green

