# 🔍 How to Verify Auto-Close is Active

## ✅ Method 1: Check Startup Logs

When the trader starts, you should see:

```
[Trader Name] 🎯 Auto Take Profit: ENABLED (1.50% P&L target)
[Trader Name]    Positions will auto-close at 1.50% profit (with leverage)
```

**If you see this** → Auto-close is **ACTIVE** ✅

**If you see this instead**:
```
[Trader Name] ⚠️  Auto Take Profit: DISABLED (set auto_take_profit_pct in config to enable)
```
→ Auto-close is **DISABLED** ❌

---

## ✅ Method 2: Check During Trading

### When Auto-Close Triggers:

Look for these log messages:

```
🎯 [Auto-Close] BTCUSDT long: 1.52% P&L reached (target: 1.50%)
🎯 Auto-closing 1 position(s) due to take profit/stop loss
✅ Auto-closed BTCUSDT long: Auto take profit: 1.52% P&L (target: 1.50%)
```

**If you see these** → Auto-close is **WORKING** ✅

### Stop Loss Auto-Close:

```
🛑 [Auto-Close] ETHUSDT short: Stop loss triggered (price: 3450.00, stop: 3455.00)
✅ Auto-closed ETHUSDT short: Stop loss triggered: price 3450.00 hit stop loss 3455.00
```

---

## ✅ Method 3: Check Config File

Open `config.json` or `config-single.json`:

```json
{
  "auto_take_profit_pct": 1.5,  // ✅ Should be > 0
  ...
}
```

**If `auto_take_profit_pct` is:**
- `1.5` or any number > 0 → **ENABLED** ✅
- `0` or missing → **DISABLED** ❌

---

## ✅ Method 4: Check Exchange Type

Auto-close **only works** with paper trading:

```json
{
  "traders": [
    {
      "exchange": "paper",  // ✅ Must be "paper"
      ...
    }
  ]
}
```

**If `exchange` is:**
- `"paper"` → Auto-close **CAN work** ✅
- `"binance"`, `"hyperliquid"`, etc. → Auto-close **WON'T work** (real exchanges handle this differently)

---

## 🔍 What to Look For in Your Logs

### ✅ Signs Auto-Close is Working:

1. **Startup message**:
   ```
   🎯 Auto Take Profit: ENABLED (1.50% P&L target)
   ```

2. **During trading** (when position hits 1.5%):
   ```
   🎯 [Auto-Close] SYMBOL side: X.XX% P&L reached (target: 1.50%)
   🎯 Auto-closing 1 position(s) due to take profit/stop loss
   ✅ Auto-closed SYMBOL side: Auto take profit: X.XX% P&L
   ```

3. **Position closes automatically** without AI decision

### ❌ Signs Auto-Close is NOT Working:

1. **Startup message**:
   ```
   ⚠️  Auto Take Profit: DISABLED
   ```

2. **No auto-close logs** when positions reach 1.5% profit

3. **Positions stay open** past 1.5% profit (waiting for AI decision)

---

## 🧪 Quick Test

1. **Check startup logs** - Look for "Auto Take Profit: ENABLED"
2. **Open a position** - Wait for it to reach 1.5% profit
3. **Watch logs** - Should see auto-close messages
4. **Check positions** - Should close automatically

---

## 🐛 Troubleshooting

### Problem: No startup message about auto-close

**Solution**: 
- Check `config.json` has `"auto_take_profit_pct": 1.5`
- Restart the backend
- Check exchange is `"paper"`

### Problem: Positions not auto-closing at 1.5%

**Possible causes**:
1. **Config not loaded** - Restart backend
2. **Exchange not paper** - Check `exchange: "paper"`
3. **Position hasn't reached 1.5%** - Check P&L percentage
4. **Auto-close disabled** - Check `auto_take_profit_pct` is > 0

### Problem: See "DISABLED" message

**Solution**:
- Set `"auto_take_profit_pct": 1.5` in config
- Restart backend

---

## 📊 Example: What You Should See

### Startup:
```
[OpenAI Trader (Multi-Agent)] 🎯 Auto Take Profit: ENABLED (1.50% P&L target)
[OpenAI Trader (Multi-Agent)]    Positions will auto-close at 1.50% profit (with leverage)
```

### When Position Hits 1.5%:
```
🎯 [Auto-Close] HYPEUSDT short: 1.52% P&L reached (target: 1.50%)
🎯 Auto-closing 1 position(s) due to take profit/stop loss
✅ Auto-closed HYPEUSDT short: Auto take profit: 1.52% P&L (target: 1.50%)
📤 [Simulated] Close short: HYPEUSDT (all) @ 40.2000, P&L=145.23
```

---

**Quick Check**: Look for `🎯 Auto Take Profit: ENABLED` in your startup logs!

