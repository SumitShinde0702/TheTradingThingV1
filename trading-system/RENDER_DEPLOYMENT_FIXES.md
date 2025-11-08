# 🔧 Render Deployment Issues - Root Cause Analysis & Fixes

## 🎯 Summary of Changes Made

### ✅ 1. Changed Scan Interval to 3 Minutes
- **File**: `config.json`
- **Change**: `scan_interval_minutes: 5` → `scan_interval_minutes: 3` for both traders

### ✅ 2. Fixed Cycle Number Restoration
- **File**: `logger/decision_logger.go` → `restoreCycleNumber()`
- **Issue**: When only cycle #0 exists, it wasn't properly handled
- **Fix**: Now correctly detects cycle #0 seed record and starts from #1

### 📋 3. Database Reset Instructions
- **File**: `supabase/reset_to_10000.sql` (already exists)
- **Action Needed**: Run this SQL script in Supabase SQL Editor before deploying

## 🔍 Root Causes of Render Redeploy Issues

### **Issue #1: Cycle Number Restoration**
**Location**: `logger/decision_logger.go:423-448`

**Problem**:
- When backend restarts, it queries `MAX(cycle_number)`
- If only cycle #0 exists (after reset), it was checking `> 0`, which would fail
- This could cause cycle number to not restore properly

**Fix Applied**:
- Changed condition from `maxCycle.Int64 > 0` to `maxCycle.Int64 >= 0`
- Added logic to detect cycle #0 and properly start from #1
- Added better logging

### **Issue #2: Initial Balance Not Restored**
**Location**: `trader/auto_trader.go:217-229`

**Problem**:
- If `restorePaperTraderState()` fails, falls back to config initial balance (10000)
- But if paper trader wasn't properly restored, `GetAccountInfo()` calculates PnL wrong
- Formula: `totalPnL = totalEquity - at.initialBalance`
- If `at.initialBalance` is wrong (10000 instead of restored value), PnL shows incorrectly

**Potential Causes**:
- Supabase connection timeout during startup
- Latest record query fails
- Cycle #0 doesn't exist in database

**Check Logs For**:
```
✅ Successfully restored from database
💰 Current balance: Wallet=10000.00, Equity=10000.00
```

If you see:
```
❌ Failed to restore from database
💡 Falling back to config initial balance: 10000.00 USDT
```
**This is the problem!**

### **Issue #3: Paper Trader Balance Not Restored**
**Location**: `trader/auto_trader.go:946-989` → `restorePaperTraderState()`

**Problem**:
- Gets latest record: `GetLatestRecords(1)`
- If query fails or returns empty, can't restore balance
- Falls back to creating new PaperTrader with initialBalance
- But positions won't be restored, and balance will be wrong

**Check Logs For**:
```
🔄 Restoring from cycle #X (latest record)
📊 Latest record data: TotalBalance=10000.00, AvailableBalance=10000.00
```

### **Issue #4: Frontend Cache/Stale Data**
**Location**: `web/src/App.tsx` → useSWR hooks

**Problem**:
- SWR might cache old data after backend restart
- If backend hasn't fully initialized, API returns errors
- Frontend might show 0.00 from cached error responses

**Check**:
- Browser console for API errors
- Network tab for failed requests
- SWR might be showing stale cached data

## 🛠️ Debugging Steps After Deploy

### Step 1: Check Render Logs (Immediately After Deploy)

Look for these **SUCCESS** indicators:
```
✅ Connected to Supabase database (trader_id: openai_trader)
✅ Restored cycle number: found seed record (cycle #0), will start from cycle #1
✅ [OpenAI Trader] Successfully restored from database
💰 [OpenAI Trader] Current balance: Wallet=10000.00, Equity=10000.00, Available=10000.00, InitialBalance=10000.00
```

If you see **ERRORS**:
```
❌ Failed to restore from database: ...
💡 Falling back to config initial balance: 10000.00 USDT
```
→ This means restoration failed, backend is using config defaults

### Step 2: Verify Database State

Run in Supabase SQL Editor:
```sql
SELECT 
    trader_id,
    cycle_number,
    account_total_balance,
    timestamp
FROM decisions
WHERE trader_id IN ('openai_trader', 'qwen_trader')
ORDER BY trader_id, cycle_number;
```

**Expected After Reset**:
- `openai_trader`, `0`, `10000.0`
- `qwen_trader`, `0`, `10000.0`

### Step 3: Test API Directly

```bash
# Test account endpoint
curl https://lia-ai-pwup.onrender.com/api/account?trader_id=openai_trader

# Should return:
{
  "total_equity": 10000.0,
  "available_balance": 10000.0,
  "total_pnl": 0.0,
  "total_pnl_pct": 0.0,
  ...
}
```

If returns `0.00`, backend didn't restore properly.

### Step 4: Check Frontend Console

Open browser DevTools → Console:
- Look for `Account data loaded for trader...` messages
- Look for API errors (404, 500, timeout)
- Check if `VITE_API_URL` is correct

## 🔧 Recommended Additional Fixes (Not Yet Applied)

### Fix 1: Add Startup Retry Logic
**File**: `trader/auto_trader.go:217`
- Add retry logic with exponential backoff for Supabase queries
- Wait 5 seconds between retries
- Retry up to 3 times before falling back

### Fix 2: Improve Error Logging
**File**: `trader/auto_trader.go:217-229`
- Log the exact Supabase error
- Log what query failed
- Log connection pool status

### Fix 3: Frontend Health Check
**File**: `web/src/lib/api.ts`
- Add health check before making API calls
- Show "Backend starting..." message if health check fails
- Auto-retry after backend is ready

### Fix 4: Add Connection Pool Monitoring
**File**: `logger/decision_logger.go:127-152`
- Log connection pool stats
- Warn if connections are exhausted
- Add connection retry logic

## 📝 Pre-Deployment Checklist

Before pushing to Render:

- [ ] ✅ Run `supabase/reset_to_10000.sql` in Supabase SQL Editor
- [ ] ✅ Verify cycle #0 exists: `SELECT * FROM decisions WHERE cycle_number = 0;`
- [ ] ✅ Config file has `scan_interval_minutes: 3`
- [ ] ✅ Config file has `initial_balance: 10000.0`
- [ ] ✅ All code changes committed (but NOT pushed yet, as requested)

## 🎯 Next Steps

1. **Reset Database**: Run SQL script in Supabase
2. **Verify**: Check database has cycle #0 with 10000 USDT
3. **Deploy**: Push to GitHub (Render will auto-deploy)
4. **Monitor**: Check Render logs immediately after deploy
5. **Test**: Verify frontend shows correct data
6. **Debug**: If issues, follow debugging steps above

## 🔍 What to Watch For

After deployment, monitor these:

1. **Backend Logs**: 
   - ✅ Restoration successful?
   - ❌ Any Supabase connection errors?
   
2. **Frontend**:
   - Balance shows 10000.00 (not 0.00)?
   - First cycle is #1 (not #0)?
   - No console errors?

3. **Database**:
   - New cycles start from #1?
   - Balance persists after restart?

