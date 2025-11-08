# Real Trading Database Guide

## Current Database Status ✅

**Good News:** Your current database schema **already supports real trading** without any changes!

### What Works Now

The database stores:
- ✅ **Account balances** - Works for both paper and real wallets
- ✅ **Positions** - Works for both simulated and real positions
- ✅ **Decision records** - Works for both trading modes
- ✅ **Trading actions** - Works for both (real orders have actual `order_id`s)
- ✅ **Multi-trader support** - Each trader has unique `trader_id`

### Current Database Schema

```sql
decisions (
  trader_id TEXT,        -- Distinguishes different traders
  account_total_balance, -- Works for real money
  account_available_balance,
  ...
)

positions (
  decision_id INTEGER,
  symbol TEXT,
  entry_price REAL,      -- Real entry prices from exchange
  mark_price REAL,       -- Real-time market prices
  unrealized_profit REAL -- Real P&L calculations
  ...
)

decision_actions (
  order_id BIGINT,      -- Real order IDs from exchange
  success BOOLEAN,       -- Real execution results
  ...
)
```

## What Happens When You Switch to Real Trading?

### Same Database, Different Data Source

1. **Paper Trading** (`exchange: "paper"`):
   - Uses simulated account balance
   - Creates fake positions
   - Simulates order execution
   - All stored in same database tables

2. **Real Trading** (`exchange: "binance"` or `"hyperliquid"`):
   - Uses real wallet balance
   - Creates real positions on exchange
   - Real order IDs from exchange
   - Same database tables, but with real data

### Tracking Portfolio

Your portfolio tracking will work automatically because:
- Each decision record captures account state snapshot
- Positions table stores all open positions
- Decision actions show what trades were executed
- All queries work the same (paper vs real)

## Optional Enhancement: Add Trading Mode Flag

If you want to **filter** between paper and real trading in queries, you can add a field:

### Database Migration (Optional)

```sql
-- Add exchange_type column to distinguish trading modes
ALTER TABLE decisions 
ADD COLUMN IF NOT EXISTS exchange_type TEXT;

-- Update existing records (optional)
UPDATE decisions SET exchange_type = 'paper' WHERE exchange_type IS NULL;

-- Create index for filtering
CREATE INDEX IF NOT EXISTS idx_decisions_exchange_type 
ON decisions(trader_id, exchange_type);
```

### Code Changes Needed (Optional)

If you add the `exchange_type` field, update `logger/decision_logger.go`:

```go
// In insertDecisionRecord function, add:
exchange_type TEXT  -- 'paper', 'binance', 'hyperliquid', etc.
```

## Recommendation

### Option 1: Keep It Simple (Recommended)
- **No database changes needed**
- Use different `trader_id` values to separate:
  - `"openai_trader_paper"` - Paper trading
  - `"openai_trader_real"` - Real trading
- Query by `trader_id` to filter

### Option 2: Add Trading Mode Field
- Adds `exchange_type` column
- Allows filtering: "Show me all real trading results"
- More explicit separation
- Requires code changes

## Example: Running Both Paper and Real Trading

### Config Setup

```json
{
  "traders": [
    {
      "id": "openai_trader_paper",
      "name": "OpenAI Paper Trader",
      "exchange": "paper",
      ...
    },
    {
      "id": "openai_trader_real",
      "name": "OpenAI Real Trader",
      "exchange": "binance",
      "binance_api_key": "your_real_key",
      "binance_secret_key": "your_real_secret",
      ...
    }
  ]
}
```

### Database Queries

```sql
-- All paper trading results
SELECT * FROM decisions WHERE trader_id LIKE '%_paper';

-- All real trading results
SELECT * FROM decisions WHERE trader_id LIKE '%_real';

-- Compare performance
SELECT 
  trader_id,
  COUNT(*) as cycles,
  AVG(account_total_balance) as avg_balance
FROM decisions
GROUP BY trader_id;
```

## Summary

✅ **No database changes required** - Current schema works perfectly for real trading

✅ **Portfolio tracking works automatically** - All positions and balances are tracked

✅ **Optional enhancement available** - Add `exchange_type` field if you want explicit filtering

✅ **Multi-trader support** - Run paper and real trading side-by-side with different `trader_id`s

Your database is ready for real trading! 🚀

