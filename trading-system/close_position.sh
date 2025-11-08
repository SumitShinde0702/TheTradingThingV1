#!/bin/bash

# Manual Position Close Script
# Usage: ./close_position.sh <trader_id> <symbol> <side> [quantity]

TRADER_ID=${1:-""}
SYMBOL=${2:-"BTCUSDT"}
SIDE=${3:-"short"}
QUANTITY=${4:-"0"}

if [ -z "$TRADER_ID" ]; then
    echo "Usage: ./close_position.sh <trader_id> <symbol> <side> [quantity]"
    echo "Example: ./close_position.sh my_trader BTCUSDT short"
    echo "Example: ./close_position.sh my_trader BTCUSDT short 0.4631"
    exit 1
fi

echo "🔧 Force closing position:"
echo "   Trader ID: $TRADER_ID"
echo "   Symbol: $SYMBOL"
echo "   Side: $SIDE"
echo "   Quantity: $QUANTITY (0 = auto-detect)"
echo ""

curl -X POST "http://localhost:8080/api/positions/force-close?trader_id=$TRADER_ID" \
  -H "Content-Type: application/json" \
  -d "{\"symbol\":\"$SYMBOL\",\"side\":\"$SIDE\",\"quantity\":$QUANTITY}" \
  | jq '.'

echo ""
echo "✅ Done!"


