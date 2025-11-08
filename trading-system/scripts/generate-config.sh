#!/bin/bash
# Generate config.json from environment variables for Render deployment

cat > config.json <<EOF
{
  "traders": [
EOF

# Generate traders from environment variables
# For now, we'll create a template - user needs to fill in actual values
# This script will be enhanced to read from env vars

TRADER_COUNT=${TRADER_COUNT:-1}

for i in $(seq 1 $TRADER_COUNT); do
  if [ $i -gt 1 ]; then
    echo "    ," >> config.json
  fi
  
  ID=$(eval echo \$\{TRADER_${i}_ID\})
  NAME=$(eval echo \$\{TRADER_${i}_NAME\})
  ENABLED=$(eval echo \$\{TRADER_${i}_ENABLED\:-true\})
  AI_MODEL=$(eval echo \$\{TRADER_${i}_AI_MODEL\})
  EXCHANGE=$(eval echo \$\{TRADER_${i}_EXCHANGE\})
  INITIAL_BALANCE=$(eval echo \$\{TRADER_${i}_INITIAL_BALANCE\:-1000\})
  SCAN_INTERVAL=$(eval echo \$\{TRADER_${i}_SCAN_INTERVAL_MINUTES\:-3\})
  
  cat >> config.json <<EOF
    {
      "id": "${ID:-trader_${i}}",
      "name": "${NAME:-Trader ${i}}",
      "enabled": ${ENABLED},
      "ai_model": "${AI_MODEL}",
      "exchange": "${EXCHANGE}",
EOF

  # Add exchange-specific config
  if [ "$EXCHANGE" = "binance" ]; then
    BINANCE_API_KEY=$(eval echo \$\{TRADER_${i}_BINANCE_API_KEY\})
    BINANCE_SECRET_KEY=$(eval echo \$\{TRADER_${i}_BINANCE_SECRET_KEY\})
    echo "      \"binance_api_key\": \"${BINANCE_API_KEY}\"," >> config.json
    echo "      \"binance_secret_key\": \"${BINANCE_SECRET_KEY}\"," >> config.json
  elif [ "$EXCHANGE" = "hyperliquid" ]; then
    HYPERLIQUID_PK=$(eval echo \$\{TRADER_${i}_HYPERLIQUID_PRIVATE_KEY\})
    HYPERLIQUID_ADDR=$(eval echo \$\{TRADER_${i}_HYPERLIQUID_WALLET_ADDR\})
    HYPERLIQUID_TESTNET=$(eval echo \$\{TRADER_${i}_HYPERLIQUID_TESTNET\:-false\})
    echo "      \"hyperliquid_private_key\": \"${HYPERLIQUID_PK}\"," >> config.json
    echo "      \"hyperliquid_wallet_addr\": \"${HYPERLIQUID_ADDR}\"," >> config.json
    echo "      \"hyperliquid_testnet\": ${HYPERLIQUID_TESTNET}," >> config.json
  fi
  
  # Add AI model-specific config
  if [ "$AI_MODEL" = "qwen" ]; then
    QWEN_KEY=$(eval echo \$\{TRADER_${i}_QWEN_KEY\})
    echo "      \"qwen_key\": \"${QWEN_KEY}\"," >> config.json
  elif [ "$AI_MODEL" = "grok" ]; then
    GROK_KEY=$(eval echo \$\{TRADER_${i}_GROK_KEY\})
    echo "      \"grok_key\": \"${GROK_KEY}\"," >> config.json
  elif [ "$AI_MODEL" = "deepseek" ]; then
    DEEPSEEK_KEY=$(eval echo \$\{TRADER_${i}_DEEPSEEK_KEY\})
    echo "      \"deepseek_key\": \"${DEEPSEEK_KEY}\"," >> config.json
  elif [ "$AI_MODEL" = "custom" ]; then
    CUSTOM_API_URL=$(eval echo \$\{TRADER_${i}_CUSTOM_API_URL\})
    CUSTOM_API_KEY=$(eval echo \$\{TRADER_${i}_CUSTOM_API_KEY\})
    CUSTOM_MODEL=$(eval echo \$\{TRADER_${i}_CUSTOM_MODEL_NAME\})
    echo "      \"custom_api_url\": \"${CUSTOM_API_URL}\"," >> config.json
    echo "      \"custom_api_key\": \"${CUSTOM_API_KEY}\"," >> config.json
    echo "      \"custom_model_name\": \"${CUSTOM_MODEL}\"," >> config.json
  fi
  
  cat >> config.json <<EOF
      "initial_balance": ${INITIAL_BALANCE},
      "scan_interval_minutes": ${SCAN_INTERVAL}
    }
EOF
done

cat >> config.json <<EOF
  ],
  "leverage": {
    "btc_eth_leverage": ${BTC_ETH_LEVERAGE:-5},
    "altcoin_leverage": ${ALTCOIN_LEVERAGE:-5}
  },
  "use_default_coins": ${USE_DEFAULT_COINS:-true},
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
  "coin_pool_api_url": "${COIN_POOL_API_URL:-}",
  "oi_top_api_url": "${OI_TOP_API_URL:-}",
  "api_server_port": ${PORT:-8080},
  "max_daily_loss": ${MAX_DAILY_LOSS:-10.0},
  "max_drawdown": ${MAX_DRAWDOWN:-20.0},
  "stop_trading_minutes": ${STOP_TRADING_MINUTES:-60}
EOF

# Add Supabase config if enabled
if [ "${USE_SUPABASE:-false}" = "true" ]; then
  cat >> config.json <<EOF
,
  "use_supabase": true,
  "supabase_url": "${SUPABASE_URL}",
  "supabase_key": "${SUPABASE_KEY}",
  "supabase_database_url": "${SUPABASE_DATABASE_URL:-}",
  "supabase_schema": "${SUPABASE_SCHEMA:-public}"
EOF
fi

echo "}" >> config.json

echo "✅ config.json generated successfully"

