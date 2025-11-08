# Manual Position Close Script (PowerShell)
# Usage: .\close_position.ps1 <trader_id> <symbol> <side> [quantity]

param(
    [Parameter(Mandatory=$true)]
    [string]$TraderId,
    
    [Parameter(Mandatory=$false)]
    [string]$Symbol = "BTCUSDT",
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("long","short")]
    [string]$Side = "short",
    
    [Parameter(Mandatory=$false)]
    [double]$Quantity = 0
)

$url = "http://localhost:8080/api/positions/force-close?trader_id=$TraderId"
$body = @{
    symbol = $Symbol
    side = $Side
    quantity = $Quantity
} | ConvertTo-Json

Write-Host "🔧 Force closing position:" -ForegroundColor Yellow
Write-Host "   Trader ID: $TraderId"
Write-Host "   Symbol: $Symbol"
Write-Host "   Side: $Side"
Write-Host "   Quantity: $Quantity (0 = auto-detect)"
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri $url -Method Post -Body $body -ContentType "application/json"
    Write-Host "✅ Success!" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "❌ Error:" -ForegroundColor Red
    $_.Exception.Message
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }
}


