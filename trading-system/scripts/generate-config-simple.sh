#!/bin/bash
# Simple config.json generator for Render deployment
# This creates a basic config file - you'll need to manually edit it or use env vars

echo "Generating config.json..."

# Create basic config structure
cat > config.json << 'CONFIGEOF'
{
  "traders": [
    {
      "id": "openai_trader",
      "name": "OpenAI Trader",
      "enabled": true,
      "ai_model": "qwen",
      "exchange": "binance",
      "binance_api_key": "REPLACE_WITH_YOUR_BINANCE_API_KEY",
      "binance_secret_key": "REPLACE_WITH_YOUR_BINANCE_SECRET_KEY",
      "qwen_key": "REPLACE_WITH_YOUR_QWEN_KEY",
      "initial_balance": 1000,
      "scan_interval_minutes": 3
    }
  ],
  "leverage": {
    "btc_eth_leverage": 5,
    "altcoin_leverage": 5
  },
  "use_default_coins": true,
  "default_coins": [
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "BNBUSDT",
    "XRPUSDT",
    "DOGEUSDT",
    "ADAUSDT",
    "HYPEUSDT"
  ],
  "coin_pool_api_url": "",
  "oi_top_api_url": "",
  "api_server_port": 8080,
  "max_daily_loss": 10.0,
  "max_drawdown": 20.0,
  "stop_trading_minutes": 60
}
CONFIGEOF

# Replace API server port with PORT env var if set
if [ ! -z "$PORT" ]; then
  # Use sed to replace port (works on Linux/Mac)
  sed -i "s/\"api_server_port\": [0-9]*/\"api_server_port\": $PORT/" config.json || \
  # Fallback for systems without sed -i
  perl -pi -e "s/\"api_server_port\": [0-9]*/\"api_server_port\": $PORT/" config.json
fi

echo "✅ config.json created"
echo "⚠️  Remember to replace REPLACE_WITH_YOUR_* values with actual API keys!"

